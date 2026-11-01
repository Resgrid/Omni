import { isDev } from '@resgrid/core';
import type { DurableDb } from '@resgrid/offline';

import type { StyleSpecification } from '../types';
import { DEFAULT_CHUNK_BYTES, downloadAsset } from './downloader';
import { actionFailed, actionOk, errorName, type OfflineMapsActionResult, type OfflineMapsErrorCode } from './errors';
import type { OfflinePackFileStore } from './file-store';
import { DEFAULT_OFFLINE_POLICY, type OfflineManifest, type OfflineManifestAsset, type OfflineManifestPolicy, type OfflineManifestSnapshot, type OfflineSnapshotAsset, toManifestSnapshot } from './manifest';
import { fetchOfflineManifest, type OfflineMapsAvailability, type OfflineMapsConfigInput, resolveOfflineMapsAvailability } from './manifest-client';
import type { OfflineNetworkProbe } from './network';
import { isOfflineMapPacksSupported } from './platform';
import { createDbOfflinePackRegistry, type DbOfflinePackRegistry, offlinePackScopeKey } from './registry';
import { sha256Hex } from './sha256';
import { evaluateManifestSizes, LOW_STORAGE_FREE_RATIO, type ManifestSizeEvaluation, wouldExhaustStorage } from './size-guard';
import { defaultOfflineFetch, type OfflineFetch } from './transport';
import { OFFLINE_MAP_ATTRIBUTION, type OfflineAssetKind, type OfflineIndoorFloor, type OfflineMapPackRecord, type OfflinePackScope } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const GB = 1024 * 1024 * 1024;

/** Device preference (kept across logout: `registerOfflineMapPacks` preserves it). */
export const OFFLINE_MAPS_WIFI_ONLY_KEY = 'resgrid.maps.offline.wifiOnly';
const SNAPSHOT_KEY = 'resgrid.maps.offline.snapshot.';
const INSTALLED_KEY = 'resgrid.maps.offline.installed.';
/** Default device budget for all packs; unpinned packs are evicted (LRU) above it or when < 10 % of the device is free. */
export const DEFAULT_OFFLINE_PACKS_BUDGET_BYTES = 2 * GB;
/** Ambient cache bounds applied to `AmbientCacheMaxBytes`. */
export const AMBIENT_CACHE_MAX_BYTES_CEILING = 2 * GB;

const DOWNLOAD_PRIORITY: Record<OfflineAssetKind, number> = { 'department-data': 0, sprite: 1, style: 2, basemap: 3, incident: 4, corridor: 5, 'custom-map': 6, 'indoor-floor': 7 };
const VECTOR_KINDS = new Set<OfflineAssetKind>(['basemap', 'incident', 'corridor']);

/** Small KV surface (`DurableKv` from `@resgrid/offline` fits). */
export interface OfflineMapsKv {
  getString(key: string): string | undefined;
  getBoolean(key: string): boolean | undefined;
  set(key: string, value: string | boolean): unknown;
  delete(key: string): void;
}

export const createMemoryOfflineMapsKv = (): OfflineMapsKv => {
  const values = new Map<string, string | boolean>();
  return {
    getString: (key) => {
      const value = values.get(key);
      return typeof value === 'string' ? value : undefined;
    },
    getBoolean: (key) => {
      const value = values.get(key);
      return typeof value === 'boolean' ? value : undefined;
    },
    set: (key, value) => values.set(key, value),
    delete: (key) => {
      values.delete(key);
    },
  };
};

export type OfflineMapsStatus = 'idle' | 'checking' | 'downloading' | 'paused' | 'waiting-for-wifi' | 'error';

export type OfflinePackState = 'installed' | 'outdated' | 'not-downloaded' | 'building' | 'failed' | 'rejected';

export interface OfflinePackSummary {
  packId: string;
  kind: OfflineAssetKind;
  name: string;
  sizeBytes: number | null;
  installedBytes: number | null;
  state: OfflinePackState;
  code: OfflineMapsErrorCode | null;
  pinned: boolean;
}

export interface OfflineMapsProgress {
  completedBytes: number;
  totalBytes: number;
  fraction: number;
  currentName: string | null;
  itemIndex: number;
  itemCount: number;
}

export interface OfflineMapsState {
  availability: OfflineMapsAvailability | 'unknown';
  status: OfflineMapsStatus;
  /** Last failure, as a code for `t('offline_maps.error.<code>')`. */
  error: OfflineMapsErrorCode | null;
  errorHttpStatus: number | null;
  manifestVersion: string | null;
  checkedAt: number | null;
  /** When the installed set was last confirmed current (offline badge "updated 2 d ago"). */
  updatedAt: number | null;
  /** A base map is on the device. */
  isInstalled: boolean;
  /** Something in the manifest is missing or outdated locally. */
  updateAvailable: boolean;
  /** Installed but not confirmed current for longer than the stale threshold. */
  stale: boolean;
  /** Bytes of installed packs (registry). */
  installedBytes: number;
  /** Bytes still to download for the current manifest (known sizes). */
  pendingBytes: number;
  /** Bytes of the full set in the manifest (known sizes). */
  totalBytes: number;
  freeBytes: number | null;
  progress: OfflineMapsProgress | null;
  wifiOnly: boolean;
  packs: OfflinePackSummary[];
  attribution: string;
  policy: OfflineManifestPolicy;
  responseAreaBytes: number;
  responseAreaLimitBytes: number;
}

/** What the style seam reads: installed vector/raster packs, templates and local sprite. */
export interface OfflineInstalledSet {
  revision: number;
  basemapPacks: OfflineMapPackRecord[];
  customMapPacks: OfflineMapPackRecord[];
  indoorFloors: OfflineIndoorFloor[];
  templates: { light: StyleSpecification | null; dark: StyleSpecification | null };
  spritePath: string | null;
  departmentDataPath: string | null;
  attribution: string;
  updatedAt: number | null;
  preferLocal: boolean;
}

/** The surface the Offline maps screen and `useOfflineMapOptions` use. */
export interface OfflineMapsController {
  getState(): OfflineMapsState;
  subscribe(listener: () => void): () => void;
  getInstalledSet(): OfflineInstalledSet | null;
  refreshManifest(options?: { force?: boolean }): Promise<OfflineMapsActionResult>;
  /** Refreshes when never checked or older than the policy's `RefreshHours`. */
  refreshIfStale(): Promise<OfflineMapsActionResult>;
  /** Downloads or updates everything the manifest offers (guards applied). */
  download(): Promise<OfflineMapsActionResult>;
  /** Stops a download; partial files stay for resume. */
  cancel(): void;
  /** Deletes this account's packs (keeps the manifest summary so they can be downloaded again). */
  deleteAll(): Promise<void>;
  setWifiOnly(value: boolean): void;
  markUsed(packIds: readonly string[]): void;
}

export interface OfflinePackManagerOptions {
  /** The offline database (`initOffline().db`). */
  db: DurableDb;
  /** `createExpoPackFileStore()` on native; null on web/Electron (feature unsupported). */
  fileStore: OfflinePackFileStore | null;
  /** The signed-in server/department/user, or null. */
  getScope: () => OfflinePackScope | null;
  /** Resgrid API base URL (the manifest must come from this origin). */
  getApiBaseUrl: () => string;
  fetchImpl?: OfflineFetch;
  /** Wi-Fi-only policy; without a probe the network is assumed allowed. */
  network?: OfflineNetworkProbe | null;
  kv?: OfflineMapsKv | null;
  /** `setMaplibreAmbientCacheSize` on native. */
  applyAmbientCacheSize?: ((bytes: number) => Promise<void> | void) | null;
  now?: () => number;
  chunkBytes?: number;
  budgetBytes?: number;
  platformSupported?: boolean;
  allowLocalHttp?: boolean;
  progressIntervalMs?: number;
  /** Diagnostic logger (codes, counts and sizes only). */
  log?: (message: string, context?: Record<string, unknown>) => void;
}

interface InstalledInfo {
  manifestVersion: string;
  updatedAt: number;
}

interface PlanItem {
  asset: OfflineManifestAsset;
  previousPath: string | null;
}

interface DownloadPlan {
  evaluation: ManifestSizeEvaluation<OfflineManifestAsset>;
  toDownload: PlanItem[];
  /** Rows whose item is no longer offered (removed after a complete update). */
  toRemove: string[];
  pendingBytes: number;
}

const freshState = (wifiOnly: boolean): OfflineMapsState => ({
  availability: 'unknown',
  status: 'idle',
  error: null,
  errorHttpStatus: null,
  manifestVersion: null,
  checkedAt: null,
  updatedAt: null,
  isInstalled: false,
  updateAvailable: false,
  stale: false,
  installedBytes: 0,
  pendingBytes: 0,
  totalBytes: 0,
  freeBytes: null,
  progress: null,
  wifiOnly,
  packs: [],
  attribution: OFFLINE_MAP_ATTRIBUTION,
  policy: DEFAULT_OFFLINE_POLICY,
  responseAreaBytes: 0,
  responseAreaLimitBytes: DEFAULT_OFFLINE_POLICY.responseAreaMaxBytes,
});

const isCurrent = (row: OfflineMapPackRecord | undefined, asset: Pick<OfflineSnapshotAsset, 'version' | 'sha256'>): boolean =>
  row !== undefined && row.version === asset.version && (asset.sha256 === null || row.sha256 === asset.sha256);

/** Clamps `AmbientCacheMaxBytes` to [0, 2 GB]; null when absent or invalid. */
export const normalizeAmbientCacheBytes = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), AMBIENT_CACHE_MAX_BYTES_CEILING) : null;

/**
 * Offline map pack manager (MapLibre plan §19.5): manifest sync, download queue with Range resume and SHA-256 verify,
 * atomic install, Wi-Fi-only policy, size guards, storage reporting, update on manifest change, delete, retention and
 * wipe. Scoped by server/department/user (files under `<root>/<scopeKey>/`, registry rows keyed by scope).
 */
export class OfflinePackManager implements OfflineMapsController {
  private readonly registry: DbOfflinePackRegistry | null;
  private readonly kv: OfflineMapsKv;
  private readonly fetchImpl: OfflineFetch;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();
  private state: OfflineMapsState;
  private config: OfflineMapsConfigInput | null = null;
  private configLoaded = false;
  private manifest: OfflineManifest | null = null;
  private snapshot: OfflineManifestSnapshot | null = null;
  private rows = new Map<string, OfflineMapPackRecord>();
  /** packId → file path relative to the store root (what the registry stores). */
  private relativePaths = new Map<string, string>();
  private loadedScopeKey: string | null = null;
  private templates: { light: StyleSpecification | null; dark: StyleSpecification | null } = { light: null, dark: null };
  private installedSet: OfflineInstalledSet | null = null;
  private revision = 0;
  private styleSignature = '';
  private abort: AbortController | null = null;
  private downloading: Promise<OfflineMapsActionResult> | null = null;
  private refreshing: Promise<OfflineMapsActionResult> | null = null;
  private initialized: Promise<void> | null = null;
  private appliedAmbientBytes: number | null = null;
  private lastProgressEmit = 0;

  constructor(private readonly options: OfflinePackManagerOptions) {
    this.kv = options.kv ?? createMemoryOfflineMapsKv();
    this.fetchImpl = options.fetchImpl ?? defaultOfflineFetch;
    this.now = options.now ?? Date.now;
    this.registry = options.fileStore ? createDbOfflinePackRegistry({ db: options.db, resolvePath: (path) => (options.fileStore as OfflinePackFileStore).uriFor(path) }) : null;
    this.state = freshState(this.kv.getBoolean(OFFLINE_MAPS_WIFI_ONLY_KEY) ?? DEFAULT_OFFLINE_POLICY.wifiOnly);
  }

  // ── Observable state ──────────────────────────────────────────────────────────────────────────────────────────────

  getState = (): OfflineMapsState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getInstalledSet = (): OfflineInstalledSet | null => this.installedSet;

  private setState(patch: Partial<OfflineMapsState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private log(message: string, context?: Record<string, unknown>): void {
    this.options.log?.(message, context);
  }

  private get supported(): boolean {
    return (this.options.platformSupported ?? isOfflineMapPacksSupported()) && this.options.fileStore !== null;
  }

  private get availability(): OfflineMapsAvailability {
    return resolveOfflineMapsAvailability(this.config, this.supported);
  }

  private get fileStore(): OfflinePackFileStore {
    if (!this.options.fileStore) throw new Error('Offline packs are not supported on this platform');
    return this.options.fileStore;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Creates the registry table and loads the current scope (idempotent). */
  init(): Promise<void> {
    this.initialized ??= (async () => {
      if (this.registry) {
        await this.registry.init();
      }
      await this.loadScope(true);
    })();
    return this.initialized;
  }

  /** Department config changed (`Config/GetConfig`): availability and the ambient cache budget. */
  updateConfig(config: OfflineMapsConfigInput | null): void {
    this.config = config;
    this.configLoaded = config !== null;
    this.applyAmbientCache();
    this.recompute();
  }

  /** The signed-in session changed (call after login, department or server switch). */
  async onSessionChanged(): Promise<void> {
    this.cancel();
    await this.init();
    await this.loadScope(true);
  }

  private currentScope(): { scope: OfflinePackScope; key: string } | null {
    const scope = this.options.getScope();
    return scope ? { scope, key: offlinePackScopeKey(scope) } : null;
  }

  private async loadScope(force = false): Promise<void> {
    const current = this.currentScope();
    const key = current?.key ?? null;
    if (!force && key === this.loadedScopeKey) return;
    this.loadedScopeKey = key;
    this.manifest = null;
    this.rows = new Map();
    this.relativePaths = new Map();
    this.snapshot = null;
    this.templates = { light: null, dark: null };
    if (current && this.registry) {
      try {
        for (const row of await this.registry.list(current.scope)) this.rows.set(row.packId, row);
        for (const row of await this.registry.rowsForScopeKey(current.key)) this.relativePaths.set(row.packId, row.relativePath);
      } catch (error) {
        this.log('Offline pack registry could not be read', { error: errorName(error) });
      }
      this.snapshot = this.readJson<OfflineManifestSnapshot>(`${SNAPSHOT_KEY}${current.key}`);
      await this.loadTemplates();
    }
    await this.refreshFreeSpace();
    this.recompute();
  }

  private async ensureScope(): Promise<{ scope: OfflinePackScope; key: string } | null> {
    await this.init();
    const current = this.currentScope();
    if ((current?.key ?? null) !== this.loadedScopeKey) await this.loadScope(true);
    return current;
  }

  private readJson<T>(key: string): T | null {
    const raw = this.kv.getString(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private installedInfo(): InstalledInfo | null {
    return this.loadedScopeKey ? this.readJson<InstalledInfo>(`${INSTALLED_KEY}${this.loadedScopeKey}`) : null;
  }

  private writeInstalledInfo(info: InstalledInfo | null): void {
    if (!this.loadedScopeKey) return;
    if (info) this.kv.set(`${INSTALLED_KEY}${this.loadedScopeKey}`, JSON.stringify(info));
    else this.kv.delete(`${INSTALLED_KEY}${this.loadedScopeKey}`);
  }

  private async refreshFreeSpace(): Promise<void> {
    const disk = this.options.fileStore ? await this.options.fileStore.diskSpace().catch(() => null) : null;
    this.state = { ...this.state, freeBytes: disk?.freeBytes ?? null };
  }

  private applyAmbientCache(): void {
    const bytes = normalizeAmbientCacheBytes(this.config?.AmbientCacheMaxBytes ?? this.snapshot?.policy.ambientCacheMaxBytes ?? null);
    if (bytes === null || bytes === this.appliedAmbientBytes || !this.options.applyAmbientCacheSize) return;
    this.appliedAmbientBytes = bytes;
    Promise.resolve(this.options.applyAmbientCacheSize(bytes)).catch((error: unknown) => {
      this.appliedAmbientBytes = null;
      this.log('Ambient cache size could not be applied', { error: errorName(error) });
    });
  }

  // ── Derived state ─────────────────────────────────────────────────────────────────────────────────────────────────

  private computePlan(manifest: OfflineManifest): DownloadPlan {
    const evaluation = evaluateManifestSizes(manifest);
    const toDownload: PlanItem[] = [];
    let pendingBytes = 0;
    for (const asset of evaluation.allowed) {
      const row = this.rows.get(asset.assetId);
      if (isCurrent(row, asset)) continue;
      toDownload.push({ asset, previousPath: row ? row.path : null });
      pendingBytes += asset.sizeBytes ?? 0;
    }
    toDownload.sort((a, b) => DOWNLOAD_PRIORITY[a.asset.kind] - DOWNLOAD_PRIORITY[b.asset.kind] || a.asset.name.localeCompare(b.asset.name));
    // Only items the manifest no longer mentions go; a pack that is rebuilding, or now refused, keeps its verified copy.
    const keep = new Set([...manifest.assets.map((asset) => asset.assetId), ...manifest.pending.map((pack) => pack.assetId), ...manifest.rejected.map((entry) => entry.assetId)]);
    const toRemove = [...this.rows.keys()].filter((packId) => !keep.has(packId));
    return { evaluation, toDownload, toRemove, pendingBytes };
  }

  private recompute(): void {
    const availability = this.configLoaded || this.availability === 'unsupported' ? this.availability : 'unknown';
    const snapshot = this.snapshot;
    const rows = this.rows;
    const installed = this.installedInfo();
    const installedBytes = [...rows.values()].reduce((sum, row) => sum + row.bytes, 0);
    const isInstalled = [...rows.values()].some((row) => row.assetKind !== undefined && VECTOR_KINDS.has(row.assetKind));
    const policy = snapshot?.policy ?? DEFAULT_OFFLINE_POLICY;

    const packs: OfflinePackSummary[] = [];
    let pendingBytes = 0;
    let totalBytes = 0;
    let missing = 0;
    let responseAreaBytes = 0;
    if (snapshot) {
      const evaluation = evaluateManifestSizes(snapshot);
      const rejectedCodes = new Map(evaluation.rejected.map((entry) => [entry.assetId, entry.code]));
      responseAreaBytes = evaluation.responseAreaBytes;
      for (const asset of snapshot.assets) {
        const row = rows.get(asset.assetId);
        const rejected = rejectedCodes.get(asset.assetId) ?? null;
        const state: OfflinePackState = rejected ? 'rejected' : isCurrent(row, asset) ? 'installed' : row ? 'outdated' : 'not-downloaded';
        if (!rejected) {
          totalBytes += asset.sizeBytes ?? row?.bytes ?? 0;
          if (state !== 'installed') {
            missing += 1;
            pendingBytes += asset.sizeBytes ?? 0;
          }
        }
        packs.push({ packId: asset.assetId, kind: asset.kind, name: asset.name, sizeBytes: asset.sizeBytes, installedBytes: row?.bytes ?? null, state, code: rejected, pinned: asset.pinned });
      }
      for (const pack of snapshot.pending) {
        const row = rows.get(pack.assetId);
        packs.push({ packId: pack.assetId, kind: pack.kind, name: pack.name, sizeBytes: pack.sizeBytes, installedBytes: row?.bytes ?? null, state: pack.state, code: null, pinned: pack.kind === 'basemap' });
      }
      for (const entry of snapshot.rejected) {
        packs.push({ packId: entry.assetId, kind: entry.kind ?? 'basemap', name: entry.name, sizeBytes: null, installedBytes: null, state: 'rejected', code: entry.code, pinned: false });
      }
    }
    const updatedAt = installed?.updatedAt ?? null;
    this.state = {
      ...this.state,
      availability,
      manifestVersion: snapshot?.version ?? null,
      checkedAt: snapshot?.checkedAt ?? null,
      updatedAt,
      isInstalled,
      updateAvailable: snapshot !== null && missing > 0,
      stale: isInstalled && (updatedAt === null || this.now() - updatedAt > policy.staleDays * DAY_MS),
      installedBytes,
      pendingBytes,
      totalBytes,
      packs,
      attribution: snapshot?.attribution ?? OFFLINE_MAP_ATTRIBUTION,
      policy,
      wifiOnly: this.kv.getBoolean(OFFLINE_MAPS_WIFI_ONLY_KEY) ?? policy.wifiOnly,
      responseAreaBytes,
      responseAreaLimitBytes: policy.responseAreaMaxBytes,
    };
    this.rebuildInstalledSet();
    this.listeners.forEach((listener) => listener());
  }

  private rebuildInstalledSet(): void {
    const rows = [...this.rows.values()];
    const vector = rows.filter((row) => row.assetKind !== undefined && VECTOR_KINDS.has(row.assetKind));
    if (vector.length === 0 || this.availability === 'unsupported') {
      if (this.installedSet !== null) this.revision += 1;
      this.installedSet = null;
      this.styleSignature = '';
      return;
    }
    const sprite = rows.find((row) => row.packId === 'sprite:sprite.json');
    const departmentData = rows.find((row) => row.assetKind === 'department-data');
    const floors: OfflineIndoorFloor[] = rows
      .filter((row) => row.assetKind === 'indoor-floor' && row.floorId && row.corners)
      .map((row) => ({ floorId: row.floorId as string, imagePath: row.path, corners: row.corners as NonNullable<OfflineMapPackRecord['corners']> }));
    const customMapPacks = rows.filter((row) => row.assetKind === 'custom-map');
    const attribution = this.snapshot?.attribution ?? OFFLINE_MAP_ATTRIBUTION;
    const preferLocal = this.snapshot?.policy.preferLocalInAo ?? DEFAULT_OFFLINE_POLICY.preferLocalInAo;
    const updatedAt = this.installedInfo()?.updatedAt ?? null;
    // The revision changes only when the composed style would change, so maps do not restyle on unrelated refreshes.
    const signature = JSON.stringify([
      [...vector, ...customMapPacks, ...rows.filter((row) => row.assetKind === 'indoor-floor' || row.assetKind === 'sprite' || row.assetKind === 'style')].map((row) => `${row.packId}@${row.version}@${row.path}`).sort(),
      attribution,
      preferLocal,
    ]);
    if (signature !== this.styleSignature) {
      this.styleSignature = signature;
      this.revision += 1;
    } else if (this.installedSet && this.installedSet.revision === this.revision && this.installedSet.updatedAt === updatedAt) {
      return;
    }
    this.installedSet = {
      revision: this.revision,
      basemapPacks: vector,
      customMapPacks,
      indoorFloors: floors,
      templates: this.templates,
      spritePath: sprite ? sprite.path.replace(/\.json$/, '') : null,
      departmentDataPath: departmentData ? departmentData.path : null,
      attribution,
      updatedAt,
      preferLocal,
    };
  }

  private async loadTemplates(): Promise<void> {
    const read = async (packId: string): Promise<StyleSpecification | null> => {
      const relative = this.relativePaths.get(packId);
      if (!relative || !this.options.fileStore) return null;
      try {
        const parsed: unknown = JSON.parse(await this.fileStore.readText(relative));
        return typeof parsed === 'object' && parsed !== null && (parsed as { version?: unknown }).version === 8 ? (parsed as StyleSpecification) : null;
      } catch {
        return null;
      }
    };
    this.templates = { light: await read('style:day'), dark: await read('style:night') };
  }

  // ── Manifest ──────────────────────────────────────────────────────────────────────────────────────────────────────

  refreshManifest = (options: { force?: boolean } = {}): Promise<OfflineMapsActionResult> => {
    if (this.refreshing && !options.force) return this.refreshing;
    const run = this.doRefresh().finally(() => {
      if (this.refreshing === run) this.refreshing = null;
    });
    this.refreshing = run;
    return run;
  };

  refreshIfStale = async (): Promise<OfflineMapsActionResult> => {
    await this.ensureScope();
    const checkedAt = this.snapshot?.checkedAt ?? null;
    const refreshMs = (this.snapshot?.policy.refreshHours ?? DEFAULT_OFFLINE_POLICY.refreshHours) * 60 * 60 * 1000;
    if (checkedAt !== null && this.now() - checkedAt < refreshMs) return actionOk;
    return this.refreshManifest();
  };

  private async doRefresh(): Promise<OfflineMapsActionResult> {
    const current = await this.ensureScope();
    const availability = this.availability;
    if (availability !== 'available') {
      this.recompute();
      return actionFailed(availability === 'unsupported' ? 'unsupported-platform' : 'disabled');
    }
    if (!current) return actionFailed('no-session');
    const busy = this.state.status === 'downloading';
    if (!busy) this.setState({ status: 'checking', error: null, errorHttpStatus: null });
    const result = await fetchOfflineManifest({ config: this.config, apiBaseUrl: this.options.getApiBaseUrl(), fetchImpl: this.fetchImpl, allowLocalHttp: this.options.allowLocalHttp ?? isDev() });
    if (this.currentScope()?.key !== current.key) {
      // The session changed while fetching: the result belongs to someone else.
      if (!busy) this.setState({ status: 'idle' });
      return actionFailed('no-session');
    }
    if (!result.ok) {
      this.log('Offline manifest refresh failed', { code: result.code, status: result.httpStatus });
      this.recompute();
      if (!busy) this.setState({ status: 'error', error: result.code, errorHttpStatus: result.httpStatus ?? null });
      return actionFailed(result.code, result.httpStatus);
    }
    const checkedAt = this.now();
    this.manifest = result.manifest;
    this.snapshot = toManifestSnapshot(result.manifest, checkedAt);
    this.kv.set(`${SNAPSHOT_KEY}${current.key}`, JSON.stringify(this.snapshot));
    const plan = this.computePlan(result.manifest);
    if (plan.toDownload.length === 0 && this.rows.size > 0) {
      this.writeInstalledInfo({ manifestVersion: result.manifest.version, updatedAt: checkedAt });
    }
    this.log('Offline manifest refreshed', { assets: result.manifest.assets.length, pending: result.manifest.pending.length, rejected: result.manifest.rejected.length, toDownload: plan.toDownload.length });
    this.applyAmbientCache();
    await this.refreshFreeSpace();
    this.recompute();
    if (!busy) this.setState({ status: 'idle' });
    return actionOk;
  }

  // ── Downloads ─────────────────────────────────────────────────────────────────────────────────────────────────────

  setWifiOnly = (value: boolean): void => {
    this.kv.set(OFFLINE_MAPS_WIFI_ONLY_KEY, value);
    this.setState({ wifiOnly: value });
  };

  private async networkBlock(): Promise<OfflineMapsErrorCode | null> {
    if (!this.options.network) return null;
    try {
      const network = await this.options.network.getState();
      if (!network.isConnected) return 'offline';
      if (this.state.wifiOnly && (!network.isUnmetered || network.isExpensive)) return 'waiting-for-wifi';
      return null;
    } catch {
      return null;
    }
  }

  download = (): Promise<OfflineMapsActionResult> => {
    if (this.downloading) return this.downloading;
    const run = this.doDownload().finally(() => {
      if (this.downloading === run) this.downloading = null;
      this.abort = null;
    });
    this.downloading = run;
    return run;
  };

  cancel = (): void => {
    this.abort?.abort();
  };

  private finishWith(result: OfflineMapsActionResult, status: OfflineMapsStatus): OfflineMapsActionResult {
    this.recompute();
    this.setState({ status, progress: null, error: result.ok ? null : result.code, errorHttpStatus: result.ok ? null : (result.httpStatus ?? null) });
    return result;
  }

  private async doDownload(): Promise<OfflineMapsActionResult> {
    const current = await this.ensureScope();
    if (this.availability !== 'available') return actionFailed(this.availability === 'unsupported' ? 'unsupported-platform' : 'disabled');
    if (!current || !this.registry) return actionFailed('no-session');
    const abort = new AbortController();
    this.abort = abort;

    const fresh = this.manifest && this.snapshot ? this.manifest.assets.every((asset) => asset.expiresAt === null || asset.expiresAt > this.now() + 60_000) : false;
    if (!fresh) {
      const refreshed = await this.refreshManifest({ force: true });
      if (!refreshed.ok) return this.finishWith(refreshed, 'error');
    }
    let manifest = this.manifest as OfflineManifest;
    let plan = this.computePlan(manifest);
    if (plan.evaluation.responseAreaExceeded) {
      this.log('Response area exceeds the size limit; base packs refused', { bytes: plan.evaluation.responseAreaBytes, limit: plan.evaluation.responseAreaLimitBytes });
    }
    if (plan.toDownload.length === 0) {
      if (plan.evaluation.responseAreaExceeded) {
        // Keep whatever base map is installed: a manifest over the limit is a server fault, not a reason to delete.
        return this.finishWith(actionFailed('response-area-too-large'), 'error');
      }
      if (plan.toRemove.length === 0 && this.rows.size === 0) {
        return this.finishWith(actionFailed('nothing-to-download'), 'idle');
      }
      await this.removeRows(current.scope, plan.toRemove);
      this.writeInstalledInfo({ manifestVersion: manifest.version, updatedAt: this.now() });
      return this.finishWith(actionOk, 'idle');
    }

    const disk = await this.fileStore.diskSpace().catch(() => null);
    if (wouldExhaustStorage(plan.pendingBytes, disk)) {
      return this.finishWith(actionFailed('insufficient-storage'), 'error');
    }
    const blocked = await this.networkBlock();
    if (blocked) {
      return this.finishWith(actionFailed(blocked), blocked === 'waiting-for-wifi' ? 'waiting-for-wifi' : 'paused');
    }

    const totalBytes = plan.pendingBytes;
    let completedBytes = 0;
    let firstFailure: OfflineMapsActionResult | null = plan.evaluation.responseAreaExceeded ? actionFailed('response-area-too-large') : null;
    let refreshedForExpiry = false;
    const items = [...plan.toDownload];
    this.setState({
      status: 'downloading',
      error: null,
      errorHttpStatus: null,
      progress: { completedBytes: 0, totalBytes, fraction: 0, currentName: items[0]?.asset.name ?? null, itemIndex: 0, itemCount: items.length },
    });
    this.log('Offline pack download started', { items: items.length, bytes: totalBytes });

    for (let index = 0; index < items.length; index++) {
      const { asset, previousPath } = items[index];
      const fileBase = sha256Hex(`${asset.assetId}|${asset.version}|${asset.sha256 ?? ''}`).slice(0, 24);
      const partPath = `${current.key}/tmp/${fileBase}.part`;
      const finalPath = asset.kind === 'sprite' ? `${current.key}/files/sprite/${asset.name}` : `${current.key}/files/${fileBase}.${asset.fileExtension}`;
      const result = await downloadAsset(
        { fileStore: this.fileStore, fetchImpl: this.fetchImpl },
        {
          url: asset.url,
          partPath,
          expectedBytes: asset.sizeBytes,
          sha256: asset.sha256,
          maxBytes: plan.evaluation.maxPackBytes,
          chunkBytes: this.options.chunkBytes ?? DEFAULT_CHUNK_BYTES,
          signal: abort.signal,
          canContinue: () => this.networkBlock(),
          onProgress: (written) => this.reportProgress(completedBytes + written, totalBytes, asset.name, index, items.length),
        }
      );

      if (result.status === 'stopped') {
        this.log('Offline pack download stopped', { code: result.code });
        const status: OfflineMapsStatus = result.code === 'waiting-for-wifi' ? 'waiting-for-wifi' : 'paused';
        return this.finishWith(result.code === 'cancelled' ? actionFailed('cancelled') : actionFailed(result.code), status);
      }
      if (result.status === 'failed') {
        if (result.code === 'download-url-expired' && !refreshedForExpiry) {
          refreshedForExpiry = true;
          const refreshed = await this.refreshManifest({ force: true });
          const replacement = refreshed.ok ? this.manifest?.assets.find((candidate) => candidate.assetId === asset.assetId) : undefined;
          if (replacement) {
            manifest = this.manifest as OfflineManifest;
            plan = this.computePlan(manifest);
            items[index] = { asset: replacement, previousPath };
            index -= 1;
            continue;
          }
        }
        this.log('Offline pack download failed', { code: result.code, status: result.httpStatus, kind: asset.kind });
        firstFailure ??= actionFailed(result.code, result.httpStatus);
        completedBytes += asset.sizeBytes ?? 0;
        continue;
      }

      try {
        await this.fileStore.move(partPath, finalPath);
        const record: OfflineMapPackRecord = {
          packId: asset.assetId,
          kind: asset.packKind,
          assetKind: asset.kind,
          name: asset.name,
          key: asset.key,
          version: asset.version,
          sha256: result.sha256,
          bytes: result.bytes,
          path: this.fileStore.uriFor(finalPath),
          bounds: asset.bounds,
          minZoom: asset.minZoom,
          maxZoom: asset.maxZoom,
          pinned: asset.pinned,
          lastUsedAt: this.rows.get(asset.assetId)?.lastUsedAt ?? null,
          downloadedAt: this.now(),
          customMapLayerId: asset.customMapLayerId,
          floorId: asset.floorId,
          corners: asset.corners,
          manifestVersion: manifest.version,
        };
        const previousRelative = previousPath ? (this.relativePaths.get(asset.assetId) ?? null) : null;
        await this.registry.put(current.scope, record, finalPath);
        this.rows.set(asset.assetId, record);
        this.relativePaths.set(asset.assetId, finalPath);
        if (previousRelative && previousRelative !== finalPath) {
          await this.fileStore.remove(previousRelative).catch(() => undefined);
        }
      } catch (error) {
        this.log('Offline pack install failed', { error: errorName(error), kind: asset.kind });
        await this.fileStore.remove(partPath).catch(() => undefined);
        firstFailure ??= actionFailed('storage-error');
      }
      completedBytes += asset.sizeBytes ?? result.bytes;
      this.reportProgress(completedBytes, totalBytes, items[index + 1]?.asset.name ?? null, index + 1, items.length, true);
    }

    // Items the manifest dropped go only after a complete update, so a failed update keeps the old set usable.
    if (firstFailure === null) {
      await this.removeRows(current.scope, this.computePlan(manifest).toRemove);
      this.writeInstalledInfo({ manifestVersion: manifest.version, updatedAt: this.now() });
    }
    if (items.some((item) => item.asset.kind === 'style')) await this.loadTemplates();
    await this.refreshFreeSpace();
    this.log('Offline pack download finished', { ok: firstFailure === null });
    return this.finishWith(firstFailure ?? actionOk, firstFailure ? 'error' : 'idle');
  }

  private reportProgress(completedBytes: number, totalBytes: number, currentName: string | null, itemIndex: number, itemCount: number, force = false): void {
    const now = this.now();
    if (!force && now - this.lastProgressEmit < (this.options.progressIntervalMs ?? 250)) return;
    this.lastProgressEmit = now;
    const fraction = totalBytes > 0 ? Math.min(1, completedBytes / totalBytes) : itemCount > 0 ? Math.min(1, itemIndex / itemCount) : 0;
    this.setState({ progress: { completedBytes, totalBytes, fraction, currentName, itemIndex, itemCount } });
  }

  private async removeRows(scope: OfflinePackScope, packIds: readonly string[]): Promise<number> {
    if (!this.registry || packIds.length === 0) return 0;
    let removed = 0;
    for (const packId of packIds) {
      const relative = this.relativePaths.get(packId);
      if (relative) await this.fileStore.remove(relative).catch(() => undefined);
      await this.registry.remove(scope, packId);
      this.rows.delete(packId);
      this.relativePaths.delete(packId);
      removed += 1;
    }
    return removed;
  }

  // ── Delete, wipe, retention, storage ──────────────────────────────────────────────────────────────────────────────

  private async stopDownload(): Promise<void> {
    this.cancel();
    await this.downloading?.catch(() => undefined);
  }

  deleteAll = async (): Promise<void> => {
    await this.stopDownload();
    const current = await this.ensureScope();
    if (!current || !this.options.fileStore || !this.registry) return;
    await this.fileStore.remove(current.key);
    await this.registry.wipe(current.scope);
    this.rows = new Map();
    this.relativePaths = new Map();
    this.templates = { light: null, dark: null };
    this.writeInstalledInfo(null);
    await this.refreshFreeSpace();
    this.log('Offline packs deleted');
    this.recompute();
    this.setState({ status: 'idle', progress: null, error: null, errorHttpStatus: null });
  };

  /** "Clear cached data": every pack on the device, all scopes. */
  clearAll = async (): Promise<void> => {
    await this.stopDownload();
    await this.init();
    if (this.options.fileStore) await this.fileStore.remove('');
    await this.registry?.wipe();
    this.rows = new Map();
    this.relativePaths = new Map();
    this.templates = { light: null, dark: null };
    this.writeInstalledInfo(null);
    await this.refreshFreeSpace();
    this.recompute();
    this.setState({ status: 'idle', progress: null, error: null, errorHttpStatus: null });
  };

  /** Logout / department / server switch / "Clear all local data" (D17): packs, rows and the manifest summary go. */
  wipe = async (): Promise<void> => {
    if (this.loadedScopeKey) this.kv.delete(`${SNAPSHOT_KEY}${this.loadedScopeKey}`);
    await this.clearAll();
    this.manifest = null;
    this.snapshot = null;
    this.loadedScopeKey = null;
    this.state = freshState(this.kv.getBoolean(OFFLINE_MAPS_WIFI_ONLY_KEY) ?? DEFAULT_OFFLINE_POLICY.wifiOnly);
    this.recompute();
  };

  /** Bytes on disk (installed + partial downloads, all scopes). */
  getStorageBytes = async (): Promise<number> => (this.options.fileStore ? this.fileStore.directorySize('').catch(() => 0) : 0);

  markUsed = (packIds: readonly string[]): void => {
    const current = this.currentScope();
    if (!current || !this.registry || current.key !== this.loadedScopeKey) return;
    const at = this.now();
    for (const packId of packIds) {
      const row = this.rows.get(packId);
      if (!row) continue;
      this.rows.set(packId, { ...row, lastUsedAt: at });
      void this.registry.markUsed(current.scope, packId, at).catch(() => undefined);
    }
  };

  /**
   * Retention hook (`maps.offline-packs`): removes other scopes' packs, rows whose file is gone, files no row
   * references, partial downloads for items or versions no longer offered, everything when the department turned
   * offline maps off, and unpinned packs (LRU) above the device budget or when less than 10 % of the device is free.
   * Skipped while a download runs. Returns the number of rows and files removed.
   */
  applyRetention = async (): Promise<number> => {
    if (!this.options.fileStore || !this.registry || this.downloading) return 0;
    await this.init();
    const current = this.currentScope();
    let removed = 0;

    // Other scopes (wipe should already have done this).
    for (const key of await this.registry.scopeKeys()) {
      if (key !== current?.key) removed += await this.registry.removeByScopeKey(key);
    }
    for (const entry of await this.fileStore.list('')) {
      if (entry.name !== current?.key) {
        await this.fileStore.remove(entry.name);
        removed += 1;
      }
    }
    if (!current) {
      this.rows = new Map();
      this.relativePaths = new Map();
      this.recompute();
      return removed;
    }
    if (current.key !== this.loadedScopeKey) await this.loadScope(true);

    // The department switched offline maps off.
    if (this.configLoaded && this.config?.OfflineMapsAvailable === false && this.rows.size > 0) {
      removed += this.rows.size;
      await this.fileStore.remove(current.key);
      await this.registry.wipe(current.scope);
      this.rows = new Map();
      this.relativePaths = new Map();
      this.writeInstalledInfo(null);
      this.recompute();
      return removed;
    }

    // Rows whose file is gone; files nothing references.
    const rows = await this.registry.rowsForScopeKey(current.key);
    const referenced = new Set<string>();
    for (const row of rows) {
      if ((await this.fileStore.size(row.relativePath)) === null) {
        await this.registry.removeByScopeKey(current.key, row.packId);
        this.rows.delete(row.packId);
        this.relativePaths.delete(row.packId);
        removed += 1;
      } else {
        referenced.add(row.relativePath);
      }
    }
    const walk = async (directory: string): Promise<string[]> => {
      const files: string[] = [];
      for (const entry of await this.fileStore.list(directory)) {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory) files.push(...(await walk(path)));
        else files.push(path);
      }
      return files;
    };
    for (const file of await walk(`${current.key}/files`)) {
      if (!referenced.has(file)) {
        await this.fileStore.remove(file);
        removed += 1;
      }
    }

    // Partial downloads for items/versions the manifest no longer offers.
    const wantedParts = new Set((this.snapshot?.assets ?? []).map((asset) => `${sha256Hex(`${asset.assetId}|${asset.version}|${asset.sha256 ?? ''}`).slice(0, 24)}.part`));
    for (const entry of await this.fileStore.list(`${current.key}/tmp`)) {
      if (!wantedParts.has(entry.name)) {
        await this.fileStore.remove(`${current.key}/tmp/${entry.name}`);
        removed += 1;
      }
    }

    // LRU over unpinned packs.
    const budget = this.options.budgetBytes ?? DEFAULT_OFFLINE_PACKS_BUDGET_BYTES;
    const disk = await this.fileStore.diskSpace().catch(() => null);
    let used = (await this.registry.rowsForScopeKey(current.key)).reduce((sum, row) => sum + row.bytes, 0);
    let free = disk?.freeBytes ?? null;
    const lowSpace = (): boolean => disk !== null && free !== null && free < disk.totalBytes * LOW_STORAGE_FREE_RATIO;
    if (used > budget || lowSpace()) {
      const candidates = (await this.registry.rowsForScopeKey(current.key)).filter((row) => !row.pinned).sort((a, b) => (a.lastUsedAt ?? a.downloadedAt) - (b.lastUsedAt ?? b.downloadedAt));
      for (const row of candidates) {
        if (used <= budget && !lowSpace()) break;
        await this.fileStore.remove(row.relativePath).catch(() => undefined);
        await this.registry.removeByScopeKey(current.key, row.packId);
        this.rows.delete(row.packId);
        this.relativePaths.delete(row.packId);
        used -= row.bytes;
        free = free === null ? null : free + row.bytes;
        removed += 1;
      }
    }

    if (removed > 0) this.log('Offline pack retention removed items', { removed });
    await this.refreshFreeSpace();
    this.recompute();
    return removed;
  };
}

export const createOfflinePackManager = (options: OfflinePackManagerOptions): OfflinePackManager => new OfflinePackManager(options);
