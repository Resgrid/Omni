import { z } from 'zod';

import { isSafeMapUrl } from '../provider/url-safety';
import type { OfflineMapsErrorCode } from './errors';
import { isSha256Hex } from './sha256';
import { resolveMaxPackBytes, resolveResponseAreaMaxBytes } from './size-guard';
import { type FloorCorners, OFFLINE_MAP_ATTRIBUTION, type OfflineAssetKind, OfflineMapPackKind, OfflineMapPackStatus, type PackBounds } from './types';

/**
 * The offline manifest contract (MapLibre plan §19.3, `GET /api/v4/Mapping/GetOfflineManifest`), parsed tolerantly:
 * every field may be absent (server phases land later), unknown fields are ignored, and one malformed pack is dropped
 * without failing the rest. Signed URLs stay in memory only — never persisted or logged.
 */

const text = z
  .string()
  .nullish()
  .transform((value) => (typeof value === 'string' && value.trim() ? value.trim() : null));
const versionText = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) => (value === null || value === undefined ? null : String(value).trim() || null));
const id = z.union([z.string(), z.number()]).transform((value) => String(value).trim());
const finite = z
  .number()
  .nullish()
  .transform((value) => (typeof value === 'number' && Number.isFinite(value) ? value : null));
const flag = z
  .boolean()
  .nullish()
  .transform((value) => (typeof value === 'boolean' ? value : null));

/** A downloadable file in the manifest (styles, department data, sprite files). */
export const offlineManifestFileSchema = z.object({
  Url: text,
  Version: versionText,
  Sha256: text,
  SizeBytes: finite,
});

const spriteFileSchema = offlineManifestFileSchema.extend({ Name: text });

/**
 * Sprite: the MapLibre sprite files listed in `Files` (`sprite.json`, `sprite.png`, `sprite@2x.json`, `sprite@2x.png`).
 * A bare `Url` (plan sketch) cannot be split without breaking its signature and is ignored.
 */
export const offlineManifestSpriteSchema = offlineManifestFileSchema.extend({ Files: z.array(z.unknown()).nullish() });

export const offlineManifestPolicySchema = z.object({
  WifiOnly: flag,
  RefreshHours: finite,
  StaleDays: finite,
  PreferLocalInAo: flag,
  AmbientCacheMaxBytes: finite,
  /** Per-pack limit (`OfflinePackMaxBytes`); assumption — Core adds it to `Policy`. */
  MaxPackBytes: finite,
  /** Response-area limit (`ResponseAreaMaxBytes`); assumption — Core adds it to `Policy`. */
  ResponseAreaMaxBytes: finite,
});

export const offlineManifestPackSchema = z.object({
  PackId: id.refine((value) => value.length > 0, 'PackId is required'),
  Kind: z.number().int().min(0),
  Name: text,
  PackKey: text,
  Bounds: z.array(z.number().finite()).length(4).nullish(),
  MinZoom: finite,
  MaxZoom: finite,
  SizeBytes: finite,
  Sha256: text,
  Version: versionText,
  Status: z.number().int().nullish(),
  DownloadUrl: text,
  ExpiresUtc: text,
  CustomMapLayerId: versionText,
});

export const offlineManifestFloorSchema = z.object({
  FloorId: id.refine((value) => value.length > 0, 'FloorId is required'),
  Name: text,
  ImageUrl: text,
  Corners: z.array(z.array(z.number().finite()).length(2)).length(4).nullish(),
  Version: versionText,
  Sha256: text,
  SizeBytes: finite,
});

export const offlineManifestSchema = z.object({
  ManifestVersion: id.refine((value) => value.length > 0, 'ManifestVersion is required'),
  Attribution: text,
  Policy: offlineManifestPolicySchema.nullish(),
  Styles: z.object({ Day: offlineManifestFileSchema.nullish(), Night: offlineManifestFileSchema.nullish(), Glyphs: offlineManifestFileSchema.nullish() }).nullish(),
  Packs: z.array(z.unknown()).nullish(),
  DepartmentData: offlineManifestFileSchema.nullish(),
  Sprite: offlineManifestSpriteSchema.nullish(),
  IndoorFloors: z.array(z.unknown()).nullish(),
});

export type OfflineManifestWire = z.infer<typeof offlineManifestSchema>;

export interface OfflineManifestPolicy {
  wifiOnly: boolean;
  refreshHours: number;
  staleDays: number;
  preferLocalInAo: boolean;
  ambientCacheMaxBytes: number | null;
  maxPackBytes: number;
  responseAreaMaxBytes: number;
}

export const DEFAULT_OFFLINE_POLICY: OfflineManifestPolicy = {
  wifiOnly: true,
  refreshHours: 24,
  staleDays: 7,
  preferLocalInAo: false,
  ambientCacheMaxBytes: null,
  maxPackBytes: resolveMaxPackBytes(null),
  responseAreaMaxBytes: resolveResponseAreaMaxBytes(null),
};

/** One file the client downloads. `url` is signed: memory only. */
export interface OfflineManifestAsset {
  assetId: string;
  kind: OfflineAssetKind;
  packKind: OfflineMapPackKind | null;
  name: string;
  key: string;
  version: string;
  sha256: string | null;
  sizeBytes: number | null;
  url: string;
  /** Epoch ms when the signed URL expires, when known. */
  expiresAt: number | null;
  fileExtension: string;
  bounds: PackBounds | null;
  minZoom: number;
  maxZoom: number;
  customMapLayerId: string | null;
  floorId: string | null;
  corners: FloorCorners | null;
  /** Part of the required set (never LRU-evicted). */
  pinned: boolean;
}

/** A pack listed without a file yet (queued/building) or that failed to build. */
export interface OfflineManifestPendingPack {
  assetId: string;
  kind: OfflineAssetKind;
  name: string;
  sizeBytes: number | null;
  state: 'building' | 'failed';
}

export interface OfflineManifestRejection {
  assetId: string;
  name: string;
  kind: OfflineAssetKind | null;
  code: OfflineMapsErrorCode;
}

export interface OfflineManifest {
  version: string;
  attribution: string;
  policy: OfflineManifestPolicy;
  assets: OfflineManifestAsset[];
  pending: OfflineManifestPendingPack[];
  rejected: OfflineManifestRejection[];
  /** Entries that failed schema validation (dropped). */
  invalidEntries: number;
}

export type ManifestParseResult = { ok: true; manifest: OfflineManifest } | { ok: false; code: 'manifest-invalid' | 'manifest-not-found' };

const PACK_KIND_ASSET: Partial<Record<OfflineMapPackKind, OfflineAssetKind>> = {
  [OfflineMapPackKind.Basemap]: 'basemap',
  [OfflineMapPackKind.IncidentDetail]: 'incident',
  [OfflineMapPackKind.RouteCorridor]: 'corridor',
  [OfflineMapPackKind.CustomMapRaster]: 'custom-map',
};

/** Public tile/build hosts the app must never download from (plan §19: never point clients at Protomaps/Mapbox builds). */
const PROVIDER_HOSTS = ['protomaps.com', 'mapbox.com', 'maptiler.com', 'openstreetmap.org', 'stadiamaps.com', 'thunderforest.com'];

const hostOf = (url: string): string | null => /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i.exec(url)?.[1]?.toLowerCase() ?? null;

/** A pack URL must be https (http only to localhost in development) and must not point at a public tile provider. */
export const isAllowedPackUrl = (url: string | null, allowLocalHttp?: boolean): url is string => {
  if (!isSafeMapUrl(url, allowLocalHttp)) {
    return false;
  }
  const host = hostOf(url);
  return host !== null && !PROVIDER_HOSTS.some((provider) => host === provider || host.endsWith(`.${provider}`));
};

const SPRITE_FILE = /^sprite(@2x)?\.(json|png)$/;

const extensionOf = (url: string, fallback: string): string => {
  const path = url.split(/[?#]/)[0] ?? '';
  const match = /\.([a-z0-9]{2,5})$/i.exec(path);
  return match ? match[1].toLowerCase() : fallback;
};

const parseUtcMs = (value: string | null): number | null => {
  if (!value) return null;
  const normalized = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
};

const clampZoom = (value: number | null, fallback: number): number => (value === null ? fallback : Math.max(0, Math.min(24, value)));

const toBounds = (value: number[] | null | undefined): PackBounds | null => {
  if (!value || value.length !== 4) return null;
  const [west, south, east, north] = value;
  return Math.abs(west) <= 180 && Math.abs(east) <= 180 && Math.abs(south) <= 90 && Math.abs(north) <= 90 && south <= north ? [west, south, east, north] : null;
};

const toCorners = (value: number[][] | null | undefined): FloorCorners | null =>
  value && value.length === 4 && value.every((pair) => pair.length === 2 && Math.abs(pair[0]) <= 180 && Math.abs(pair[1]) <= 90) ? (value.map((pair) => [pair[0], pair[1]]) as FloorCorners) : null;

const sizeOf = (value: number | null): number | null => (value !== null && value >= 0 ? Math.floor(value) : null);

/** Unwraps the v4 envelope (`{ Data, Status }`) when Core returns one. */
const unwrapEnvelope = (raw: unknown): { value: unknown; notFound: boolean } => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { value: raw, notFound: false };
  }
  const record = raw as Record<string, unknown>;
  if ('ManifestVersion' in record) {
    return { value: record, notFound: false };
  }
  const status = typeof record.Status === 'string' ? record.Status.toLowerCase() : '';
  if (status === 'not_found' || ('Data' in record && (record.Data === null || record.Data === undefined))) {
    return { value: null, notFound: true };
  }
  return { value: 'Data' in record ? record.Data : record, notFound: false };
};

interface ParseOptions {
  allowLocalHttp?: boolean;
}

/** Parse and normalize a manifest response (raw JSON, with or without the v4 envelope). */
export function parseOfflineManifest(raw: unknown, options: ParseOptions = {}): ManifestParseResult {
  const { value, notFound } = unwrapEnvelope(raw);
  if (notFound) {
    return { ok: false, code: 'manifest-not-found' };
  }
  const parsed = offlineManifestSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, code: 'manifest-invalid' };
  }
  const wire = parsed.data;
  const manifestVersion = wire.ManifestVersion;
  const policy: OfflineManifestPolicy = {
    wifiOnly: wire.Policy?.WifiOnly ?? DEFAULT_OFFLINE_POLICY.wifiOnly,
    refreshHours: wire.Policy?.RefreshHours !== null && wire.Policy?.RefreshHours !== undefined && wire.Policy.RefreshHours > 0 ? wire.Policy.RefreshHours : DEFAULT_OFFLINE_POLICY.refreshHours,
    staleDays: wire.Policy?.StaleDays !== null && wire.Policy?.StaleDays !== undefined && wire.Policy.StaleDays > 0 ? wire.Policy.StaleDays : DEFAULT_OFFLINE_POLICY.staleDays,
    preferLocalInAo: wire.Policy?.PreferLocalInAo ?? DEFAULT_OFFLINE_POLICY.preferLocalInAo,
    ambientCacheMaxBytes: wire.Policy?.AmbientCacheMaxBytes !== null && wire.Policy?.AmbientCacheMaxBytes !== undefined && wire.Policy.AmbientCacheMaxBytes >= 0 ? wire.Policy.AmbientCacheMaxBytes : null,
    maxPackBytes: resolveMaxPackBytes(wire.Policy?.MaxPackBytes),
    responseAreaMaxBytes: resolveResponseAreaMaxBytes(wire.Policy?.ResponseAreaMaxBytes),
  };

  const assets: OfflineManifestAsset[] = [];
  const pending: OfflineManifestPendingPack[] = [];
  const rejected: OfflineManifestRejection[] = [];
  let invalidEntries = 0;
  const seen = new Set<string>();

  const accept = (asset: OfflineManifestAsset): void => {
    if (seen.has(asset.assetId)) return;
    if (!isAllowedPackUrl(asset.url, options.allowLocalHttp)) {
      rejected.push({ assetId: asset.assetId, name: asset.name, kind: asset.kind, code: 'unsafe-url' });
      return;
    }
    if (asset.sha256 !== null && !isSha256Hex(asset.sha256)) {
      rejected.push({ assetId: asset.assetId, name: asset.name, kind: asset.kind, code: 'missing-hash' });
      return;
    }
    seen.add(asset.assetId);
    assets.push(asset);
  };

  const fileAsset = (
    assetId: string,
    kind: OfflineAssetKind,
    packKind: OfflineMapPackKind | null,
    name: string,
    file: z.infer<typeof offlineManifestFileSchema> | null | undefined,
    extension: string
  ): OfflineManifestAsset | null =>
    file?.Url
      ? {
          assetId,
          kind,
          packKind,
          name,
          key: assetId,
          version: file.Version ?? file.Sha256?.toLowerCase() ?? manifestVersion,
          sha256: file.Sha256 ? file.Sha256.toLowerCase() : null,
          sizeBytes: sizeOf(file.SizeBytes),
          url: file.Url,
          expiresAt: null,
          fileExtension: extension,
          bounds: null,
          minZoom: 0,
          maxZoom: 24,
          customMapLayerId: null,
          floorId: null,
          corners: null,
          pinned: true,
        }
      : null;

  // Department data, sprite and style templates first: they are small and every offline map needs them.
  const departmentData = fileAsset('department-data', 'department-data', OfflineMapPackKind.DepartmentData, 'Department data', wire.DepartmentData, 'json');
  if (departmentData) accept(departmentData);

  for (const entry of wire.Sprite?.Files ?? []) {
    const file = spriteFileSchema.safeParse(entry);
    if (!file.success || !file.data.Name || !SPRITE_FILE.test(file.data.Name)) {
      invalidEntries += 1;
      continue;
    }
    const name = file.data.Name;
    const asset = fileAsset(`sprite:${name}`, 'sprite', OfflineMapPackKind.Sprite, name, { ...file.data, Version: file.data.Version ?? wire.Sprite?.Version ?? null }, name.split('.').pop() ?? 'json');
    if (asset) accept(asset);
  }

  const day = fileAsset('style:day', 'style', null, 'Day style', wire.Styles?.Day, 'json');
  if (day) accept(day);
  const night = fileAsset('style:night', 'style', null, 'Night style', wire.Styles?.Night, 'json');
  if (night) accept(night);

  for (const entry of wire.Packs ?? []) {
    const result = offlineManifestPackSchema.safeParse(entry);
    if (!result.success) {
      invalidEntries += 1;
      continue;
    }
    const pack = result.data;
    const assetId = `pack:${pack.PackId}`;
    const assetKind = PACK_KIND_ASSET[pack.Kind as OfflineMapPackKind];
    const name = pack.Name ?? pack.PackKey ?? pack.PackId;
    if (!assetKind) {
      rejected.push({ assetId, name, kind: null, code: 'unsupported-kind' });
      continue;
    }
    const status = pack.Status ?? (pack.DownloadUrl ? OfflineMapPackStatus.Ready : OfflineMapPackStatus.Queued);
    if (status === OfflineMapPackStatus.Failed) {
      pending.push({ assetId, kind: assetKind, name, sizeBytes: sizeOf(pack.SizeBytes), state: 'failed' });
      continue;
    }
    if (status !== OfflineMapPackStatus.Ready || !pack.DownloadUrl) {
      pending.push({ assetId, kind: assetKind, name, sizeBytes: sizeOf(pack.SizeBytes), state: 'building' });
      continue;
    }
    if (!isSha256Hex(pack.Sha256)) {
      rejected.push({ assetId, name, kind: assetKind, code: 'missing-hash' });
      continue;
    }
    const sha256 = pack.Sha256.toLowerCase();
    accept({
      assetId,
      kind: assetKind,
      packKind: pack.Kind as OfflineMapPackKind,
      name,
      key: pack.PackKey ?? assetId,
      version: pack.Version ?? sha256,
      sha256,
      sizeBytes: sizeOf(pack.SizeBytes),
      url: pack.DownloadUrl,
      expiresAt: parseUtcMs(pack.ExpiresUtc),
      fileExtension: 'pmtiles',
      bounds: toBounds(pack.Bounds),
      minZoom: clampZoom(pack.MinZoom, 0),
      maxZoom: clampZoom(pack.MaxZoom, 15),
      customMapLayerId: pack.CustomMapLayerId,
      floorId: null,
      corners: null,
      pinned: assetKind === 'basemap',
    });
  }

  for (const entry of wire.IndoorFloors ?? []) {
    const result = offlineManifestFloorSchema.safeParse(entry);
    if (!result.success) {
      invalidEntries += 1;
      continue;
    }
    const floor = result.data;
    const corners = toCorners(floor.Corners);
    if (!floor.ImageUrl || !corners) {
      invalidEntries += 1;
      continue;
    }
    const asset = fileAsset(
      `floor:${floor.FloorId}`,
      'indoor-floor',
      null,
      floor.Name ?? floor.FloorId,
      { Url: floor.ImageUrl, Version: floor.Version, Sha256: floor.Sha256, SizeBytes: floor.SizeBytes },
      extensionOf(floor.ImageUrl, 'png')
    );
    if (asset) accept({ ...asset, floorId: floor.FloorId, corners, pinned: false });
  }

  return {
    ok: true,
    manifest: { version: manifestVersion, attribution: wire.Attribution ?? OFFLINE_MAP_ATTRIBUTION, policy, assets, pending, rejected, invalidEntries },
  };
}

/** What is persisted between launches (no URLs): shown in Settings → Offline maps while offline. */
export interface OfflineManifestSnapshot {
  version: string;
  checkedAt: number;
  attribution: string;
  policy: OfflineManifestPolicy;
  assets: Omit<OfflineManifestAsset, 'url' | 'expiresAt'>[];
  pending: OfflineManifestPendingPack[];
  rejected: OfflineManifestRejection[];
}

export type OfflineSnapshotAsset = OfflineManifestSnapshot['assets'][number];

const withoutUrl = (asset: OfflineManifestAsset): OfflineSnapshotAsset => ({
  assetId: asset.assetId,
  kind: asset.kind,
  packKind: asset.packKind,
  name: asset.name,
  key: asset.key,
  version: asset.version,
  sha256: asset.sha256,
  sizeBytes: asset.sizeBytes,
  fileExtension: asset.fileExtension,
  bounds: asset.bounds,
  minZoom: asset.minZoom,
  maxZoom: asset.maxZoom,
  customMapLayerId: asset.customMapLayerId,
  floorId: asset.floorId,
  corners: asset.corners,
  pinned: asset.pinned,
});

export const toManifestSnapshot = (manifest: OfflineManifest, checkedAt: number): OfflineManifestSnapshot => ({
  version: manifest.version,
  checkedAt,
  attribution: manifest.attribution,
  policy: manifest.policy,
  assets: manifest.assets.map(withoutUrl),
  pending: manifest.pending,
  rejected: manifest.rejected,
});
