import { SCHEMA_TABLE } from '../db/schema';
import type { DurableDb } from '../db/types';
import type { DurableKv } from '../kv/durable-kv';
import type { Outbox } from '../outbox/outbox';
import { OUTBOX_DROPPED_TABLE, OUTBOX_TABLE } from '../outbox/schema';
import type { OutboxItemView } from '../outbox/types';
import type { ScopeWiper } from '../reset/wipe';
import { type Clock, systemClock } from '../util/ids';
import { getOfflineLogger } from '../util/logger';
import { defaultStorageAreaRegistry, type StorageAreaRegistry } from './areas';
import { defaultRetentionRegistry, type RetentionRegistry, type StorageArea } from './retention';
import { type MaintenanceReason, type MaintenanceResult, runMaintenance } from './run-maintenance';
import { createMaintenanceScheduler, type MaintenanceScheduler, type MaintenanceSchedulerOptions } from './scheduler';

const MB = 1024 * 1024;
export const LAST_MAINTENANCE_SUMMARY_KEY = 'resgrid.offline.maintenance.last';

export type TableArea = StorageArea | 'unclassified';

export interface StorageReport {
  generatedAt: number;
  engine: 'sqlite' | 'memory';
  sizes: {
    databaseBytes: number;
    databaseFreeBytes: number;
    /** Cache + working-set tables + the API response cache. */
    cachedDataBytes: number;
    outboxBytes: number;
    attachmentsBytes: number | null;
    mapPacksBytes: number | null;
    /** Estimate across all MMKV instances. */
    keyValueBytes: number;
    freeDeviceBytes: number | null;
    byArea: Record<StorageArea, number>;
    byTable: { table: string; area: TableArea; rows: number; bytes: number }[];
  };
  budget: { budgetBytes: number | null; usedBytes: number; overBudget: boolean };
  pending: {
    unsent: number;
    pending: number;
    processing: number;
    failed: number;
    dead: number;
    stuck: number;
    awaitingConfirmation: number;
    held: number;
    oldestUnsentAt: number | null;
  };
  /** Queued, failed and stuck items for Retry / Retry all / Discard. No payloads. */
  items: OutboxItemView[];
  lastSyncAt: number | null;
  lastHydrationAt: number | null;
  lastMaintenanceAt: number | null;
  lastMaintenance: MaintenanceSummary | null;
}

export interface MaintenanceSummary {
  reason: MaintenanceReason;
  finishedAt: number;
  removedRows: number;
  prunedRows: number;
  failedSteps: number;
}

/** Support diagnostics: counts and sizes only — no record content, ids or protected values. */
export type StorageDiagnostics = Omit<StorageReport, 'items'> & { itemTypes: Record<string, number> };

export interface ClearCachedDataResult {
  tablesCleared: string[];
  rowsRemoved: number;
  areasCleared: string[];
  apiCacheCleared: boolean;
}

export type ClearAllLocalDataResult = { status: 'confirmation-required'; unsentCount: number } | { status: 'cleared'; discardedUnsent: number; tablesCleared: string[]; areasCleared: string[]; signOutFailed: boolean };

export interface ApiCacheLike {
  clear(): void;
  sizeBytes(): number;
}

export interface StorageManagerOptions {
  db: DurableDb;
  outbox?: Outbox | null;
  kvInstances?: () => DurableKv[];
  /** Instance where maintenance bookkeeping is kept (the main instance). */
  stateKv?: DurableKv | null;
  retention?: RetentionRegistry;
  areas?: StorageAreaRegistry;
  apiCache?: ApiCacheLike | null;
  /** Bytes; see `budgetBytesFromManifest`. */
  budgetBytes?: number | null;
  wiper?: ScopeWiper | null;
  getLastSyncAt?: () => number | null;
  getLastHydrationAt?: () => number | null;
  /** e.g. expo-file-system `getFreeDiskStorageAsync`. */
  getFreeDeviceBytes?: () => Promise<number | null>;
  /** Server sign-out (push unregister, token revoke) — runs before the wipe, while the token still exists. */
  signOut?: () => Promise<void>;
  now?: Clock;
  scheduler?: Omit<MaintenanceSchedulerOptions, 'run' | 'kv' | 'now'>;
}

export const budgetBytesFromManifest = (offline: { storageBudgetMb: number }): number => offline.storageBudgetMb * MB;

const SYSTEM_TABLES = new Set([SCHEMA_TABLE, OUTBOX_DROPPED_TABLE]);

const emptyAreas = (): Record<StorageArea, number> => ({ outbox: 0, cache: 0, 'working-set': 0, attachments: 0, 'map-packs': 0, system: 0 });

/**
 * Everything Settings → Advanced → Storage & sync calls (plan §8.2a): the report, Retry/Discard via
 * the outbox, "Clear cached data", "Clear all local data", and the maintenance job and scheduler.
 */
export class StorageManager {
  readonly scheduler: MaintenanceScheduler;
  private readonly retention: RetentionRegistry;
  private readonly areas: StorageAreaRegistry;
  private readonly now: Clock;

  constructor(private readonly options: StorageManagerOptions) {
    this.retention = options.retention ?? defaultRetentionRegistry;
    this.areas = options.areas ?? defaultStorageAreaRegistry;
    this.now = options.now ?? systemClock;
    this.scheduler = createMaintenanceScheduler({ ...options.scheduler, run: (reason) => this.executeMaintenance(reason), kv: options.stateKv ?? null, now: this.now });
  }

  get outbox(): Outbox | null {
    return this.options.outbox ?? null;
  }

  private areaOf(table: string): TableArea {
    if (table === OUTBOX_TABLE) return 'outbox';
    if (SYSTEM_TABLES.has(table)) return 'system';
    return this.retention.ruleFor(table)?.area ?? (this.retention.ruleFor(table) ? 'cache' : 'unclassified');
  }

  /** Run the maintenance job now (single-flight with the scheduler; records the run time). */
  runMaintenance(reason: MaintenanceReason = 'manual'): Promise<MaintenanceResult> {
    return this.scheduler.runNow(reason);
  }

  private async executeMaintenance(reason: MaintenanceReason): Promise<MaintenanceResult> {
    const result = await runMaintenance({ db: this.options.db, registry: this.retention, budgetBytes: this.options.budgetBytes ?? null, reason, now: this.now });
    const summary: MaintenanceSummary = {
      reason,
      finishedAt: result.finishedAt,
      removedRows: result.retention.reduce((sum, entry) => sum + entry.removed, 0) + result.hooks.reduce((sum, entry) => sum + entry.removed, 0),
      prunedRows: result.budget.prunedRows,
      failedSteps: result.errors.length,
    };
    this.options.stateKv?.setJSON(LAST_MAINTENANCE_SUMMARY_KEY, summary);
    return result;
  }

  async getStorageReport(): Promise<StorageReport> {
    const { db } = this.options;
    const size = await db.getSize();
    const byArea = emptyAreas();
    const byTable: StorageReport['sizes']['byTable'] = [];
    for (const table of await db.listTables()) {
      const area = this.areaOf(table);
      const [rows, bytes] = await Promise.all([db.count(table), db.estimateTableBytes(table)]);
      byTable.push({ table, area, rows, bytes });
      if (area !== 'unclassified') byArea[area] += bytes;
    }

    let attachmentsBytes: number | null = null;
    let mapPacksBytes: number | null = null;
    for (const area of this.areas.list()) {
      if (!area.getSizeBytes) continue;
      const bytes = await area.getSizeBytes().catch(() => 0);
      byArea[area.area] += bytes;
      if (area.area === 'attachments') attachmentsBytes = (attachmentsBytes ?? 0) + bytes;
      if (area.area === 'map-packs') mapPacksBytes = (mapPacksBytes ?? 0) + bytes;
    }

    const apiCacheBytes = this.options.apiCache?.sizeBytes() ?? 0;
    const keyValueBytes = (this.options.kvInstances?.() ?? []).reduce((sum, kv) => sum + kv.sizeEstimateBytes(), 0);
    const freeDeviceBytes = this.options.getFreeDeviceBytes ? await this.options.getFreeDeviceBytes().catch(() => null) : null;

    const snapshot = this.options.outbox ? await this.options.outbox.refresh() : null;
    const counts = snapshot?.counts;
    const unsentItems = (snapshot?.items ?? []).filter((item) => item.state !== 'dead');
    const budgetBytes = this.options.budgetBytes ?? null;

    return {
      generatedAt: this.now(),
      engine: db.kind,
      sizes: {
        databaseBytes: size.totalBytes,
        databaseFreeBytes: size.freeBytes,
        cachedDataBytes: byArea.cache + byArea['working-set'] + apiCacheBytes,
        outboxBytes: byArea.outbox,
        attachmentsBytes,
        mapPacksBytes,
        keyValueBytes,
        freeDeviceBytes,
        byArea,
        byTable,
      },
      budget: { budgetBytes, usedBytes: size.usedBytes, overBudget: budgetBytes !== null && size.usedBytes > budgetBytes },
      pending: {
        unsent: counts?.unsent ?? 0,
        pending: counts?.pending ?? 0,
        processing: counts?.processing ?? 0,
        failed: counts?.failed ?? 0,
        dead: counts?.dead ?? 0,
        stuck: counts?.stuck ?? 0,
        awaitingConfirmation: counts?.awaitingConfirmation ?? 0,
        held: counts?.held ?? 0,
        oldestUnsentAt: unsentItems.length > 0 ? Math.min(...unsentItems.map((item) => item.createdAt)) : null,
      },
      items: snapshot?.items ?? [],
      lastSyncAt: this.options.getLastSyncAt?.() ?? null,
      lastHydrationAt: this.options.getLastHydrationAt?.() ?? null,
      lastMaintenanceAt: this.scheduler.getLastRunAt(),
      lastMaintenance: this.options.stateKv?.getJSON<MaintenanceSummary>(LAST_MAINTENANCE_SUMMARY_KEY) ?? null,
    };
  }

  async getDiagnosticsSummary(): Promise<StorageDiagnostics> {
    const { items, ...rest } = await this.getStorageReport();
    const itemTypes: Record<string, number> = {};
    for (const item of items) itemTypes[item.type] = (itemTypes[item.type] ?? 0) + 1;
    return { ...rest, itemTypes };
  }

  /** "Clear cached data": drops caches and map packs; keeps the session and unsent changes. */
  async clearCachedData(): Promise<ClearCachedDataResult> {
    const { db } = this.options;
    const logger = getOfflineLogger();
    const existing = new Set(await db.listTables());
    const result: ClearCachedDataResult = { tablesCleared: [], rowsRemoved: 0, areasCleared: [], apiCacheCleared: false };

    for (const rule of this.retention.rules()) {
      const area = rule.area ?? 'cache';
      if ((area !== 'cache' && area !== 'working-set') || !existing.has(rule.table) || this.retention.isProtected(rule.table)) continue;
      result.rowsRemoved += await db.delete(rule.table);
      result.tablesCleared.push(rule.table);
    }

    if (this.options.apiCache) {
      this.options.apiCache.clear();
      result.apiCacheCleared = true;
    }

    for (const area of this.areas.list()) {
      if (!area.clearWithCachedData || !area.clear) continue;
      try {
        await area.clear();
        result.areasCleared.push(area.id);
      } catch (error) {
        logger.error({ message: 'Failed to clear storage area', context: { area: area.id, error: error instanceof Error ? error.name : typeof error } });
      }
    }

    await db.incrementalVacuum().catch(() => undefined);
    logger.info({ message: 'Cached data cleared', context: { tables: result.tablesCleared.length, rows: result.rowsRemoved, areas: result.areasCleared.length } });
    return result;
  }

  /**
   * "Clear all local data": call once without `confirmed` to get the unsent count for the warning,
   * then with `{ confirmed: true }` to sign out and wipe SQLite, MMKV app data (device preferences
   * kept) and every storage area including map packs.
   */
  async clearAllLocalData(options: { confirmed?: boolean } = {}): Promise<ClearAllLocalDataResult> {
    const { db, outbox } = this.options;
    const unsentCount = outbox ? await outbox.countUnsent(null) : 0;
    if (!options.confirmed) return { status: 'confirmation-required', unsentCount };

    const logger = getOfflineLogger();
    let signOutFailed = false;
    if (this.options.signOut) {
      try {
        await this.options.signOut();
      } catch {
        signOutFailed = true;
        logger.warn({ message: 'Sign-out failed before clearing local data; clearing anyway' });
      }
    }

    let discardedUnsent = 0;
    if (this.options.wiper) {
      const report = await this.options.wiper.wipeScope('clear-all-data', { confirmedDiscard: true });
      discardedUnsent = report.unsentWrites.discarded;
    } else if (outbox) {
      discardedUnsent = await outbox.deleteForScope(null);
    }

    const tablesCleared: string[] = [];
    for (const table of await db.listTables()) {
      if (table === SCHEMA_TABLE) continue;
      await db.delete(table);
      tablesCleared.push(table);
    }

    const areasCleared: string[] = [];
    for (const area of this.areas.list()) {
      if (!area.clear) continue;
      try {
        await area.clear();
        areasCleared.push(area.id);
      } catch {
        logger.error({ message: 'Failed to clear storage area', context: { area: area.id } });
      }
    }

    this.options.apiCache?.clear();
    await outbox?.refresh();
    await db.incrementalVacuum().catch(() => undefined);
    await db.checkpoint().catch(() => undefined);
    logger.info({ message: 'All local data cleared', context: { discardedUnsent, tables: tablesCleared.length, areas: areasCleared.length } });
    return { status: 'cleared', discardedUnsent, tablesCleared, areasCleared, signOutFailed };
  }
}

export function createStorageManager(options: StorageManagerOptions): StorageManager {
  return new StorageManager(options);
}
