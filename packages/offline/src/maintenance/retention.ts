import type { DurableDb, Where } from '../db/types';
import { getOfflineLogger } from '../util/logger';

export type StorageArea = 'outbox' | 'cache' | 'working-set' | 'attachments' | 'map-packs' | 'system';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Plan §8.2a defaults. */
export const RETENTION_DEFAULTS = {
  outboxDead: { maxAgeMs: 14 * DAY_MS, maxRows: 200 },
  outboxForeignHoldMs: 7 * DAY_MS,
  outboxDropRecords: { maxAgeMs: 30 * DAY_MS, maxRows: 100 },
  attachmentOrphanMaxAgeMs: DAY_MS,
} as const;

/**
 * Every table declares how long its rows live (plan §8.2a; a table without a rule fails review —
 * see `findTablesWithoutRetention`).
 */
export interface RetentionRule {
  table: string;
  area?: StorageArea;
  maxAgeMs?: number;
  maxRows?: number;
  /** Rows live until the server acknowledges them (and are deleted then); never pruned by age or budget. */
  until?: 'acknowledged';
  /** Column holding the row's time (ms since epoch); default `createdAt`. */
  timeColumn?: string;
  /** Column used to delete individual rows; default `id`. */
  keyColumn?: string;
  /** Only rows matching this filter are subject to the rule. */
  where?: Where;
  /** Oldest rows may be removed to meet the storage budget. Default: true for `cache`, false otherwise. */
  prunableForBudget?: boolean;
}

/** Custom retention that a declarative rule cannot express (e.g. the outbox's dead-letter and foreign-session rules). */
export interface RetentionHook {
  id: string;
  apply(context: { now: number }): Promise<number>;
}

/** Tables whose rows are unsent writes: only `until: 'acknowledged'` is allowed (never age/row/budget pruning). */
const PROTECTED_TABLES = new Set<string>(['outbox']);
/** Bookkeeping tables exempt from needing a rule. */
const EXEMPT_TABLES = new Set<string>(['_resgrid_schema']);

export interface RetentionRegistry {
  register(rule: RetentionRule): () => void;
  registerHook(hook: RetentionHook): () => void;
  rules(): RetentionRule[];
  hooks(): RetentionHook[];
  ruleFor(table: string): RetentionRule | undefined;
  /** Mark a table holding unsent writes (rules for it may only be `until: 'acknowledged'`). */
  protectTable(table: string): void;
  isProtected(table: string): boolean;
  clear(): void;
}

export function createRetentionRegistry(): RetentionRegistry {
  const rules = new Map<string, RetentionRule>();
  const hooks = new Map<string, RetentionHook>();
  const protectedTables = new Set(PROTECTED_TABLES);

  return {
    register(rule) {
      if (protectedTables.has(rule.table) || rule.area === 'outbox') {
        if (rule.maxAgeMs !== undefined || rule.maxRows !== undefined || rule.prunableForBudget) {
          throw new Error(`Table "${rule.table}" holds unsent writes; only { until: 'acknowledged' } retention is allowed (use a retention hook for dead letters).`);
        }
      }
      if (rule.until === 'acknowledged' && rule.prunableForBudget) {
        throw new Error(`Table "${rule.table}" keeps rows until acknowledged; it cannot be pruned for the storage budget.`);
      }
      rules.set(rule.table, rule);
      return () => {
        if (rules.get(rule.table) === rule) rules.delete(rule.table);
      };
    },
    registerHook(hook) {
      hooks.set(hook.id, hook);
      return () => {
        if (hooks.get(hook.id) === hook) hooks.delete(hook.id);
      };
    },
    rules: () => Array.from(rules.values()),
    hooks: () => Array.from(hooks.values()),
    ruleFor: (table) => rules.get(table),
    protectTable: (table) => protectedTables.add(table),
    isProtected: (table) => protectedTables.has(table),
    clear() {
      rules.clear();
      hooks.clear();
    },
  };
}

export const defaultRetentionRegistry = createRetentionRegistry();

/** Declare a table's retention next to its schema (plan §8.2a). */
export const registerRetention = (rule: RetentionRule): (() => void) => defaultRetentionRegistry.register(rule);
export const registerRetentionHook = (hook: RetentionHook): (() => void) => defaultRetentionRegistry.registerHook(hook);

export const isBudgetPrunable = (rule: RetentionRule, registry: RetentionRegistry): boolean =>
  !registry.isProtected(rule.table) && rule.area !== 'outbox' && rule.until !== 'acknowledged' && (rule.prunableForBudget ?? (rule.area ?? 'cache') === 'cache');

/** Tables in the database with no retention rule (for a review/CI assertion). */
export async function findTablesWithoutRetention(db: DurableDb, registry: RetentionRegistry = defaultRetentionRegistry): Promise<string[]> {
  const tables = await db.listTables();
  return tables.filter((table) => !EXEMPT_TABLES.has(table) && !registry.ruleFor(table));
}

const BATCH = 500;

async function deleteKeys(db: DurableDb, table: string, keyColumn: string, keys: (string | number | null)[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < keys.length; i += BATCH) {
    removed += await db.delete(table, { [keyColumn]: { in: keys.slice(i, i + BATCH) } });
  }
  return removed;
}

/** Apply one declarative rule. Returns the number of rows removed. */
export async function applyRetentionRule(db: DurableDb, rule: RetentionRule, now: number, registry: RetentionRegistry = defaultRetentionRegistry): Promise<number> {
  if (rule.until === 'acknowledged' || registry.isProtected(rule.table)) return 0;
  const timeColumn = rule.timeColumn ?? 'createdAt';
  const keyColumn = rule.keyColumn ?? 'id';
  let removed = 0;

  if (rule.maxAgeMs !== undefined) {
    removed += await db.delete(rule.table, { ...rule.where, [timeColumn]: { lt: now - rule.maxAgeMs } });
  }

  if (rule.maxRows !== undefined) {
    const total = await db.count(rule.table, rule.where);
    if (total > rule.maxRows) {
      const overflow = await db.select(rule.table, { where: rule.where, columns: [keyColumn], orderBy: [{ column: timeColumn, direction: 'desc' }], offset: rule.maxRows });
      removed += await deleteKeys(
        db,
        rule.table,
        keyColumn,
        overflow.map((row) => row[keyColumn] ?? null)
      );
    }
  }

  if (removed > 0) {
    getOfflineLogger().info({ message: 'Retention removed rows', context: { table: rule.table, removed } });
  }
  return removed;
}

/** Remove the oldest `count` rows of a budget-prunable table. */
export async function pruneOldest(db: DurableDb, rule: RetentionRule, count: number): Promise<number> {
  const timeColumn = rule.timeColumn ?? 'createdAt';
  const keyColumn = rule.keyColumn ?? 'id';
  const oldest = await db.select(rule.table, { where: rule.where, columns: [keyColumn], orderBy: [{ column: timeColumn }], limit: count });
  return deleteKeys(
    db,
    rule.table,
    keyColumn,
    oldest.map((row) => row[keyColumn] ?? null)
  );
}

/** Time of a table's oldest row (subject to the rule's filter), or null when empty. */
export async function oldestRowTime(db: DurableDb, rule: RetentionRule): Promise<number | null> {
  const timeColumn = rule.timeColumn ?? 'createdAt';
  const rows = await db.select(rule.table, { where: rule.where, columns: [timeColumn], orderBy: [{ column: timeColumn }], limit: 1 });
  const value = rows[0]?.[timeColumn];
  return value === undefined || value === null ? null : Number(value);
}
