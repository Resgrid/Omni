/**
 * DurableDb — the queue/large-collection store (plan §8.2: SQLite, owner decision).
 *
 * The interface is structured (insert/update/delete/select with simple filters) plus raw SQL
 * (`execute`/`query`) where the engine is SQLite. Everything @resgrid/offline itself stores uses only
 * the structured operations, so the same code runs on:
 * - `createSqliteDb()` — expo-sqlite (iOS/Android; web too if spike S7 adopts OPFS);
 * - `createMemoryDb()` — pure JS, for tests and the web/Electron fallback until S7 decides between
 *   expo-sqlite web (OPFS, needs COOP/COEP) and IndexedDB. A persistence adapter can make it durable
 *   (`MemoryDbPersistence`); without one it lives for the page session only.
 */

export type SqlValue = string | number | null;
export type DbRow = Record<string, SqlValue>;

export type ColumnType = 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB';

export interface ColumnSpec {
  name: string;
  type: ColumnType;
  primaryKey?: boolean;
  notNull?: boolean;
  default?: SqlValue;
}

export interface IndexSpec {
  name: string;
  columns: string[];
  unique?: boolean;
}

export interface TableSpec {
  name: string;
  columns: ColumnSpec[];
  indexes?: IndexSpec[];
}

export interface ConditionOps {
  eq?: SqlValue;
  /** Null-safe inequality (`IS NOT`). */
  ne?: SqlValue;
  lt?: number | string;
  lte?: number | string;
  gt?: number | string;
  gte?: number | string;
  in?: SqlValue[];
  /** Null-safe: a NULL column is "not in" any list. */
  notIn?: SqlValue[];
  isNull?: boolean;
}

/** A bare value means equality (NULL means IS NULL). All conditions are AND-ed. */
export type Condition = SqlValue | ConditionOps;
export type Where = Record<string, Condition>;

export interface OrderBy {
  column: string;
  direction?: 'asc' | 'desc';
}

export interface SelectOptions {
  where?: Where;
  orderBy?: OrderBy[];
  limit?: number;
  offset?: number;
  columns?: string[];
}

export type ConflictPolicy = 'abort' | 'replace' | 'ignore';

export interface DbOps {
  /** Returns the number of rows written (0 when ignored on conflict). */
  insert(table: string, row: DbRow, options?: { onConflict?: ConflictPolicy }): Promise<number>;
  update(table: string, where: Where, patch: DbRow): Promise<number>;
  delete(table: string, where?: Where): Promise<number>;
  select<T extends DbRow = DbRow>(table: string, options?: SelectOptions): Promise<T[]>;
  count(table: string, where?: Where): Promise<number>;
  /** Raw SQL — SQLite engines only (`supportsSql`); the memory engine throws `SqlNotSupportedError`. */
  execute(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  query<T extends DbRow = DbRow>(sql: string, params?: SqlValue[]): Promise<T[]>;
  createTable(spec: TableSpec): Promise<void>;
  dropTable(name: string): Promise<void>;
  addColumn(table: string, column: ColumnSpec): Promise<void>;
  createIndex(table: string, index: IndexSpec): Promise<void>;
  listTables(): Promise<string[]>;
  tableColumns(table: string): Promise<string[]>;
}

export interface DbSizeInfo {
  /** File size (SQLite pages incl. free pages) or estimate. */
  totalBytes: number;
  /** Bytes holding data (total minus free pages) — what the storage budget is measured against. */
  usedBytes: number;
  /** Free pages `PRAGMA incremental_vacuum` can return to the OS. */
  freeBytes: number;
}

export interface DurableDb extends DbOps {
  readonly kind: 'sqlite' | 'memory';
  readonly supportsSql: boolean;
  /** Atomic: everything inside commits or nothing does. Use `tx`, not the outer db, inside. */
  transaction<T>(fn: (tx: DbOps) => Promise<T>): Promise<T>;
  getSize(): Promise<DbSizeInfo>;
  estimateTableBytes(table: string): Promise<number>;
  incrementalVacuum(): Promise<void>;
  optimize(): Promise<void>;
  checkpoint(): Promise<void>;
  close(): Promise<void>;
}

/** A versioned group of tables owned by one module (outbox, api cache, a feature's collections). */
export interface SchemaModule {
  module: string;
  /** Current version of the module's schema; forward-only. */
  version: number;
  /** The tables at `version` — used for fresh installs and to rebuild after a failed migration. */
  tables: TableSpec[];
  /** Steps from older versions; each runs in its own transaction. */
  migrations?: Migration[];
  /**
   * Rows survive a failed migration (snapshot → rebuild at the latest spec → reinsert). Set for tables
   * holding unsent writes (the outbox); caches are simply rebuilt and re-hydrated from the server.
   */
  preserveRowsOnFailure?: boolean;
}

export interface Migration {
  toVersion: number;
  name: string;
  up(tx: DbOps): Promise<void>;
}

export type SchemaStatus = 'created' | 'current' | 'migrated' | 'rebuilt' | 'rebuilt-preserved' | 'newer-than-app';

export interface SchemaResult {
  module: string;
  status: SchemaStatus;
  fromVersion: number | null;
  toVersion: number;
  /** Rows carried over by a preserving rebuild, and rows that could not be. */
  preservedRows?: number;
  lostRows?: number;
  failedMigration?: string;
}

export class SqlNotSupportedError extends Error {
  constructor() {
    super('Raw SQL is not available on this storage engine (memory fallback). Use the structured operations.');
    this.name = 'SqlNotSupportedError';
  }
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Table/column/index names are interpolated into SQL, so only plain identifiers are accepted. */
export function assertIdentifier(name: string): string {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Invalid identifier "${name}".`);
  }
  return name;
}

export function isConditionOps(condition: Condition): condition is ConditionOps {
  return condition !== null && typeof condition === 'object';
}
