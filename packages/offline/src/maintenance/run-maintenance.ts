import type { DbSizeInfo, DurableDb } from '../db/types';
import { type Clock, systemClock } from '../util/ids';
import { getOfflineLogger } from '../util/logger';
import { applyRetentionRule, defaultRetentionRegistry, isBudgetPrunable, oldestRowTime, pruneOldest, type RetentionRegistry } from './retention';

export type MaintenanceReason = 'startup' | 'foreground' | 'after-sync' | 'manual';

export interface MaintenanceResult {
  reason: MaintenanceReason;
  startedAt: number;
  finishedAt: number;
  retention: { table: string; removed: number }[];
  hooks: { id: string; removed: number }[];
  budget: { budgetBytes: number | null; usedBytesBefore: number; usedBytesAfter: number; prunedRows: number; overBudget: boolean };
  vacuumed: boolean;
  optimized: boolean;
  checkpointed: boolean;
  sizeBefore: DbSizeInfo;
  sizeAfter: DbSizeInfo;
  /** Step names that failed (no details: diagnostics stay content-free). */
  errors: string[];
}

export interface RunMaintenanceOptions {
  db: DurableDb;
  registry?: RetentionRegistry;
  /** Per-variant SQLite budget (manifest `offline.storageBudgetMb`), excluding map packs. */
  budgetBytes?: number | null;
  reason?: MaintenanceReason;
  now?: Clock;
  /** Rows removed per budget-pruning step. */
  pruneBatchSize?: number;
}

const tableSet = async (db: DurableDb): Promise<Set<string>> => new Set(await db.listTables());

/**
 * The maintenance job (plan §8.2a): retention rules and hooks → storage budget (oldest cached rows
 * first; unsent writes never) → `PRAGMA incremental_vacuum` → `PRAGMA optimize` → WAL checkpoint.
 * Never throws: a failing step is recorded and the rest still run.
 */
export async function runMaintenance(options: RunMaintenanceOptions): Promise<MaintenanceResult> {
  const { db } = options;
  const registry = options.registry ?? defaultRetentionRegistry;
  const now = options.now ?? systemClock;
  const logger = getOfflineLogger();
  const startedAt = now();
  const errors: string[] = [];
  const zero: DbSizeInfo = { totalBytes: 0, usedBytes: 0, freeBytes: 0 };

  const attempt = async <T>(step: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      errors.push(step);
      logger.error({ message: 'Maintenance step failed', context: { step, error: error instanceof Error ? error.name : typeof error } });
      return fallback;
    }
  };

  const sizeBefore = await attempt('size', () => db.getSize(), zero);
  const tables = await attempt('list-tables', () => tableSet(db), new Set<string>());

  const retention: MaintenanceResult['retention'] = [];
  for (const rule of registry.rules()) {
    if (!tables.has(rule.table)) continue;
    const removed = await attempt(`retention:${rule.table}`, () => applyRetentionRule(db, rule, now(), registry), 0);
    retention.push({ table: rule.table, removed });
  }

  const hooks: MaintenanceResult['hooks'] = [];
  for (const hook of registry.hooks()) {
    const removed = await attempt(`hook:${hook.id}`, () => hook.apply({ now: now() }), 0);
    hooks.push({ id: hook.id, removed });
  }

  const budgetBytes = options.budgetBytes ?? null;
  const usedBefore = (await attempt('size', () => db.getSize(), sizeBefore)).usedBytes;
  let used = usedBefore;
  let prunedRows = 0;
  if (budgetBytes !== null && used > budgetBytes) {
    const candidates = registry.rules().filter((rule) => tables.has(rule.table) && isBudgetPrunable(rule, registry));
    const batch = options.pruneBatchSize ?? 100;
    for (let step = 0; step < 10_000 && used > budgetBytes; step++) {
      let oldest: { ruleIndex: number; time: number } | null = null;
      for (let i = 0; i < candidates.length; i++) {
        const time = await attempt(`budget-scan:${candidates[i].table}`, () => oldestRowTime(db, candidates[i]), null);
        if (time !== null && (oldest === null || time < oldest.time)) oldest = { ruleIndex: i, time };
      }
      if (oldest === null) break;
      const rule = candidates[oldest.ruleIndex];
      const removed = await attempt(`budget-prune:${rule.table}`, () => pruneOldest(db, rule, batch), 0);
      if (removed === 0) break;
      prunedRows += removed;
      used = (await attempt('size', () => db.getSize(), { ...zero, usedBytes: used })).usedBytes;
    }
    if (prunedRows > 0) {
      logger.warn({ message: 'Storage budget exceeded; pruned oldest cached rows', context: { prunedRows, budgetBytes, usedBefore, usedAfter: used } });
    }
  }

  const vacuumed = await attempt(
    'incremental-vacuum',
    async () => {
      await db.incrementalVacuum();
      return true;
    },
    false
  );
  const optimized = await attempt(
    'optimize',
    async () => {
      await db.optimize();
      return true;
    },
    false
  );
  const checkpointed = await attempt(
    'checkpoint',
    async () => {
      await db.checkpoint();
      return true;
    },
    false
  );
  const sizeAfter = await attempt('size', () => db.getSize(), sizeBefore);

  const result: MaintenanceResult = {
    reason: options.reason ?? 'manual',
    startedAt,
    finishedAt: now(),
    retention,
    hooks,
    budget: { budgetBytes, usedBytesBefore: usedBefore, usedBytesAfter: sizeAfter.usedBytes, prunedRows, overBudget: budgetBytes !== null && sizeAfter.usedBytes > budgetBytes },
    vacuumed,
    optimized,
    checkpointed,
    sizeBefore,
    sizeAfter,
    errors,
  };
  logger.info({
    message: 'Storage maintenance finished',
    context: { reason: result.reason, removed: retention.reduce((sum, entry) => sum + entry.removed, 0) + hooks.reduce((sum, entry) => sum + entry.removed, 0), prunedRows, errors: errors.length },
  });
  return result;
}
