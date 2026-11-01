import { Mutex } from '../util/mutex';
import {
  assertIdentifier,
  type ColumnSpec,
  type Condition,
  type DbOps,
  type DbRow,
  type DbSizeInfo,
  type DurableDb,
  type IndexSpec,
  isConditionOps,
  type OrderBy,
  type SelectOptions,
  SqlNotSupportedError,
  type SqlValue,
  type TableSpec,
  type Where,
} from './types';

export interface MemoryDbSnapshot {
  version: 1;
  tables: Record<string, { spec: TableSpec; rows: DbRow[] }>;
}

/**
 * Makes the memory engine durable on web/Electron until spike S7 picks the real engine (expo-sqlite
 * OPFS or IndexedDB): `load` at open, `save` after every committed write. Do not back it with
 * localStorage for the outbox (≈5 MB, evictable — plan §8.2).
 */
export interface MemoryDbPersistence {
  load(): Promise<MemoryDbSnapshot | null>;
  save(snapshot: MemoryDbSnapshot): Promise<void>;
}

interface Table {
  spec: TableSpec;
  rows: DbRow[];
}

type State = Map<string, Table>;

const typeRank = (value: SqlValue): number => (value === null ? 0 : typeof value === 'number' ? 1 : 2);

/** SQLite-like ordering: NULL < numbers < text. */
export function compareSqlValues(a: SqlValue, b: SqlValue): number {
  const rankA = typeRank(a);
  const rankB = typeRank(b);
  if (rankA !== rankB) return rankA - rankB;
  if (a === null || b === null) return 0;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

const comparable = (value: SqlValue, bound: number | string): boolean => value !== null && typeof value === typeof bound;

function matchesCondition(value: SqlValue, condition: Condition): boolean {
  if (!isConditionOps(condition)) {
    return condition === null ? value === null : value === condition;
  }
  if (condition.eq !== undefined && (condition.eq === null ? value !== null : value !== condition.eq)) return false;
  if (condition.ne !== undefined && value === condition.ne) return false;
  if (condition.lt !== undefined && !(comparable(value, condition.lt) && (value as number | string) < condition.lt)) return false;
  if (condition.lte !== undefined && !(comparable(value, condition.lte) && (value as number | string) <= condition.lte)) return false;
  if (condition.gt !== undefined && !(comparable(value, condition.gt) && (value as number | string) > condition.gt)) return false;
  if (condition.gte !== undefined && !(comparable(value, condition.gte) && (value as number | string) >= condition.gte)) return false;
  if (condition.in !== undefined && (value === null || !condition.in.includes(value))) return false;
  if (condition.notIn !== undefined && value !== null && condition.notIn.includes(value)) return false;
  if (condition.isNull !== undefined && (value === null) !== condition.isNull) return false;
  return true;
}

export function matchesWhere(row: DbRow, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([column, condition]) => matchesCondition(row[column] ?? null, condition));
}

function sortRows(rows: DbRow[], orderBy: OrderBy[] | undefined): DbRow[] {
  if (!orderBy || orderBy.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const entry of orderBy) {
      const result = compareSqlValues(a[entry.column] ?? null, b[entry.column] ?? null);
      if (result !== 0) return entry.direction === 'desc' ? -result : result;
    }
    return 0;
  });
}

const rowBytes = (row: DbRow): number => JSON.stringify(row).length;

class MemoryOps implements DbOps {
  constructor(private readonly getState: () => State) {}

  private table(name: string): Table {
    const table = this.getState().get(name);
    if (!table) throw new Error(`no such table: ${name}`);
    return table;
  }

  private checkColumns(table: Table, row: DbRow): void {
    const known = new Set(table.spec.columns.map((column) => column.name));
    for (const key of Object.keys(row)) {
      if (!known.has(key)) throw new Error(`table ${table.spec.name} has no column named ${key}`);
    }
  }

  private conflicts(table: Table, row: DbRow, ignoreIndex: number): number {
    const keyColumns: string[][] = [];
    const primary = table.spec.columns.filter((column) => column.primaryKey).map((column) => column.name);
    if (primary.length > 0) keyColumns.push(primary);
    for (const index of table.spec.indexes ?? []) {
      if (index.unique) keyColumns.push(index.columns);
    }
    for (const columns of keyColumns) {
      if (columns.some((column) => row[column] === null || row[column] === undefined)) continue;
      const found = table.rows.findIndex((existing, index) => index !== ignoreIndex && columns.every((column) => existing[column] === row[column]));
      if (found >= 0) return found;
    }
    return -1;
  }

  async insert(name: string, row: DbRow, options?: { onConflict?: 'abort' | 'replace' | 'ignore' }): Promise<number> {
    const table = this.table(name);
    this.checkColumns(table, row);
    const full: DbRow = {};
    for (const column of table.spec.columns) {
      const value = row[column.name] ?? column.default ?? null;
      if (value === null && (column.notNull || column.primaryKey)) {
        throw new Error(`NOT NULL constraint failed: ${name}.${column.name}`);
      }
      full[column.name] = value;
    }
    const conflict = this.conflicts(table, full, -1);
    if (conflict >= 0) {
      if (options?.onConflict === 'ignore') return 0;
      if (options?.onConflict === 'replace') {
        table.rows.splice(conflict, 1);
      } else {
        throw new Error(`UNIQUE constraint failed: ${name}`);
      }
    }
    table.rows.push(full);
    return 1;
  }

  async update(name: string, where: Where, patch: DbRow): Promise<number> {
    const table = this.table(name);
    this.checkColumns(table, patch);
    let changes = 0;
    table.rows = table.rows.map((row, index) => {
      if (!matchesWhere(row, where)) return row;
      const next = { ...row, ...patch };
      for (const column of table.spec.columns) {
        if ((next[column.name] ?? null) === null && (column.notNull || column.primaryKey)) throw new Error(`NOT NULL constraint failed: ${name}.${column.name}`);
      }
      if (this.conflicts(table, next, index) >= 0) throw new Error(`UNIQUE constraint failed: ${name}`);
      changes++;
      return next;
    });
    return changes;
  }

  async delete(name: string, where?: Where): Promise<number> {
    const table = this.table(name);
    const before = table.rows.length;
    table.rows = table.rows.filter((row) => !matchesWhere(row, where));
    return before - table.rows.length;
  }

  async select<T extends DbRow = DbRow>(name: string, options: SelectOptions = {}): Promise<T[]> {
    const table = this.table(name);
    let rows = sortRows(
      table.rows.filter((row) => matchesWhere(row, options.where)),
      options.orderBy
    );
    const offset = options.offset ?? 0;
    rows = rows.slice(offset, options.limit === undefined ? undefined : offset + Math.max(0, options.limit));
    return rows.map((row) => {
      if (!options.columns || options.columns.length === 0) return { ...row } as T;
      const projected: DbRow = {};
      for (const column of options.columns) projected[column] = row[column] ?? null;
      return projected as T;
    });
  }

  async count(name: string, where?: Where): Promise<number> {
    return this.table(name).rows.filter((row) => matchesWhere(row, where)).length;
  }

  async execute(): Promise<{ changes: number }> {
    throw new SqlNotSupportedError();
  }

  async query<T extends DbRow = DbRow>(): Promise<T[]> {
    throw new SqlNotSupportedError();
  }

  async createTable(spec: TableSpec): Promise<void> {
    assertIdentifier(spec.name);
    spec.columns.forEach((column) => assertIdentifier(column.name));
    if (!this.getState().has(spec.name)) {
      this.getState().set(spec.name, { spec: { ...spec, columns: [...spec.columns], indexes: [...(spec.indexes ?? [])] }, rows: [] });
    }
  }

  async dropTable(name: string): Promise<void> {
    this.getState().delete(name);
  }

  async addColumn(name: string, column: ColumnSpec): Promise<void> {
    const table = this.table(name);
    assertIdentifier(column.name);
    if (table.spec.columns.some((existing) => existing.name === column.name)) throw new Error(`duplicate column name: ${column.name}`);
    table.spec.columns.push({ ...column, primaryKey: false });
    table.rows = table.rows.map((row) => ({ ...row, [column.name]: column.default ?? null }));
  }

  async createIndex(name: string, index: IndexSpec): Promise<void> {
    const table = this.table(name);
    assertIdentifier(index.name);
    const indexes = table.spec.indexes ?? [];
    if (!indexes.some((existing) => existing.name === index.name)) {
      table.spec.indexes = [...indexes, index];
    }
  }

  async listTables(): Promise<string[]> {
    return Array.from(this.getState().keys());
  }

  async tableColumns(name: string): Promise<string[]> {
    const table = this.getState().get(name);
    return table ? table.spec.columns.map((column) => column.name) : [];
  }
}

const cloneState = (state: State): State => {
  const copy: State = new Map();
  for (const [name, table] of state) {
    copy.set(name, { spec: { ...table.spec, columns: [...table.spec.columns], indexes: [...(table.spec.indexes ?? [])] }, rows: table.rows.map((row) => ({ ...row })) });
  }
  return copy;
};

const toSnapshot = (state: State): MemoryDbSnapshot => {
  const tables: MemoryDbSnapshot['tables'] = {};
  for (const [name, table] of state) tables[name] = { spec: table.spec, rows: table.rows };
  return { version: 1, tables };
};

/** Pure-JS engine: tests everywhere, and the web/Electron fallback until spike S7 (see types.ts). */
class MemoryDurableDb implements DurableDb {
  readonly kind = 'memory' as const;
  readonly supportsSql = false;
  private state: State = new Map();
  private readonly mutex = new Mutex();
  private readonly ops = new MemoryOps(() => this.state);

  constructor(private readonly persistence?: MemoryDbPersistence) {}

  async load(): Promise<void> {
    const snapshot = await this.persistence?.load();
    if (!snapshot) return;
    const state: State = new Map();
    for (const [name, table] of Object.entries(snapshot.tables)) state.set(name, { spec: table.spec, rows: table.rows.map((row) => ({ ...row })) });
    this.state = state;
  }

  private async persist(): Promise<void> {
    if (this.persistence) await this.persistence.save(toSnapshot(cloneState(this.state)));
  }

  private read<T>(task: (ops: MemoryOps) => Promise<T>): Promise<T> {
    return this.mutex.run(() => task(this.ops));
  }

  private write<T>(task: (ops: DbOps) => Promise<T>): Promise<T> {
    return this.mutex.run(async () => {
      const before = cloneState(this.state);
      try {
        const result = await task(this.ops);
        await this.persist();
        return result;
      } catch (error) {
        this.state = before;
        throw error;
      }
    });
  }

  insert(table: string, row: DbRow, options?: { onConflict?: 'abort' | 'replace' | 'ignore' }): Promise<number> {
    return this.write((ops) => ops.insert(table, row, options));
  }
  update(table: string, where: Where, patch: DbRow): Promise<number> {
    return this.write((ops) => ops.update(table, where, patch));
  }
  delete(table: string, where?: Where): Promise<number> {
    return this.write((ops) => ops.delete(table, where));
  }
  select<T extends DbRow = DbRow>(table: string, options?: SelectOptions): Promise<T[]> {
    return this.read((ops) => ops.select<T>(table, options));
  }
  count(table: string, where?: Where): Promise<number> {
    return this.read((ops) => ops.count(table, where));
  }
  execute(): Promise<{ changes: number }> {
    return Promise.reject(new SqlNotSupportedError());
  }
  query<T extends DbRow = DbRow>(): Promise<T[]> {
    return Promise.reject(new SqlNotSupportedError());
  }
  createTable(spec: TableSpec): Promise<void> {
    return this.write((ops) => ops.createTable(spec));
  }
  dropTable(name: string): Promise<void> {
    return this.write((ops) => ops.dropTable(name));
  }
  addColumn(table: string, column: ColumnSpec): Promise<void> {
    return this.write((ops) => ops.addColumn(table, column));
  }
  createIndex(table: string, index: IndexSpec): Promise<void> {
    return this.write((ops) => ops.createIndex(table, index));
  }
  listTables(): Promise<string[]> {
    return this.read((ops) => ops.listTables());
  }
  tableColumns(table: string): Promise<string[]> {
    return this.read((ops) => ops.tableColumns(table));
  }
  transaction<T>(fn: (tx: DbOps) => Promise<T>): Promise<T> {
    return this.write(fn);
  }
  getSize(): Promise<DbSizeInfo> {
    return this.read(async () => {
      let bytes = 0;
      for (const table of this.state.values()) for (const row of table.rows) bytes += rowBytes(row);
      return { totalBytes: bytes, usedBytes: bytes, freeBytes: 0 };
    });
  }
  estimateTableBytes(table: string): Promise<number> {
    return this.read(async () => (this.state.get(table)?.rows ?? []).reduce((sum, row) => sum + rowBytes(row), 0));
  }
  async incrementalVacuum(): Promise<void> {
    // Nothing to reclaim in memory.
  }
  async optimize(): Promise<void> {
    // No query planner statistics in memory.
  }
  async checkpoint(): Promise<void> {
    // No write-ahead log in memory.
  }
  async close(): Promise<void> {
    await this.mutex.run(() => this.persist());
  }
}

export async function createMemoryDb(options: { persistence?: MemoryDbPersistence } = {}): Promise<DurableDb> {
  const db = new MemoryDurableDb(options.persistence);
  await db.load();
  return db;
}
