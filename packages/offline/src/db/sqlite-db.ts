import { openDatabaseAsync } from 'expo-sqlite';

import { getOfflineLogger } from '../util/logger';
import { Mutex } from '../util/mutex';
import { columnDefinition, compileLimit, compileOrderBy, compileWhere, createIndexSql, createTableSql, quoteId } from './sql';
import type { ColumnSpec, DbOps, DbRow, DbSizeInfo, DurableDb, IndexSpec, SelectOptions, SqlValue, TableSpec, Where } from './types';

/** The database file every variant uses inside its own app sandbox. Frozen once released. */
export const OFFLINE_DB_NAME = 'resgrid-offline.db';

/** The expo-sqlite connection surface used here (also what the Node test fake implements). */
export interface SqliteConnection {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
  closeAsync(): Promise<void>;
}

export interface SqliteDbOptions {
  name?: string;
  directory?: string;
  /** NORMAL survives app kills in WAL mode (the outbox requirement); FULL also survives power loss. */
  synchronous?: 'NORMAL' | 'FULL';
}

class SqliteOps implements DbOps {
  constructor(private readonly conn: SqliteConnection) {}

  async insert(table: string, row: DbRow, options?: { onConflict?: 'abort' | 'replace' | 'ignore' }): Promise<number> {
    const columns = Object.keys(row);
    const verb = options?.onConflict === 'replace' ? 'INSERT OR REPLACE' : options?.onConflict === 'ignore' ? 'INSERT OR IGNORE' : 'INSERT';
    const sql = columns.length === 0 ? `${verb} INTO ${quoteId(table)} DEFAULT VALUES` : `${verb} INTO ${quoteId(table)} (${columns.map(quoteId).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    const result = await this.conn.runAsync(
      sql,
      columns.map((column) => row[column])
    );
    return result.changes;
  }

  async update(table: string, where: Where, patch: DbRow): Promise<number> {
    const columns = Object.keys(patch);
    if (columns.length === 0) return 0;
    const compiled = compileWhere(where);
    const result = await this.conn.runAsync(`UPDATE ${quoteId(table)} SET ${columns.map((column) => `${quoteId(column)} = ?`).join(', ')}${compiled.sql}`, [...columns.map((column) => patch[column]), ...compiled.params]);
    return result.changes;
  }

  async delete(table: string, where?: Where): Promise<number> {
    const compiled = compileWhere(where);
    const result = await this.conn.runAsync(`DELETE FROM ${quoteId(table)}${compiled.sql}`, compiled.params);
    return result.changes;
  }

  select<T extends DbRow = DbRow>(table: string, options: SelectOptions = {}): Promise<T[]> {
    const compiled = compileWhere(options.where);
    const columns = options.columns && options.columns.length > 0 ? options.columns.map(quoteId).join(', ') : '*';
    return this.conn.getAllAsync<T>(`SELECT ${columns} FROM ${quoteId(table)}${compiled.sql}${compileOrderBy(options.orderBy)}${compileLimit(options.limit, options.offset)}`, compiled.params);
  }

  async count(table: string, where?: Where): Promise<number> {
    const compiled = compileWhere(where);
    const rows = await this.conn.getAllAsync<{ c: number }>(`SELECT COUNT(*) AS c FROM ${quoteId(table)}${compiled.sql}`, compiled.params);
    return Number(rows[0]?.c ?? 0);
  }

  async execute(sql: string, params: SqlValue[] = []): Promise<{ changes: number }> {
    if (params.length === 0) {
      await this.conn.execAsync(sql);
      return { changes: 0 };
    }
    const result = await this.conn.runAsync(sql, params);
    return { changes: result.changes };
  }

  query<T extends DbRow = DbRow>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.conn.getAllAsync<T>(sql, params);
  }

  async createTable(spec: TableSpec): Promise<void> {
    for (const statement of createTableSql(spec)) {
      await this.conn.execAsync(statement);
    }
  }

  async dropTable(name: string): Promise<void> {
    await this.conn.execAsync(`DROP TABLE IF EXISTS ${quoteId(name)}`);
  }

  async addColumn(table: string, column: ColumnSpec): Promise<void> {
    // SQLite cannot add a PRIMARY KEY column; NOT NULL needs a default.
    await this.conn.execAsync(`ALTER TABLE ${quoteId(table)} ADD COLUMN ${columnDefinition({ ...column, primaryKey: false })}`);
  }

  async createIndex(table: string, index: IndexSpec): Promise<void> {
    await this.conn.execAsync(createIndexSql(table, index));
  }

  async listTables(): Promise<string[]> {
    const rows = await this.conn.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'", []);
    return rows.map((row) => row.name);
  }

  async tableColumns(table: string): Promise<string[]> {
    const rows = await this.conn.getAllAsync<{ name: string }>(`PRAGMA table_info(${quoteId(table)})`, []);
    return rows.map((row) => row.name);
  }

  async pragmaNumber(name: string): Promise<number> {
    const rows = await this.conn.getAllAsync<Record<string, number>>(`PRAGMA ${name}`, []);
    const first = rows[0];
    return first ? Number(Object.values(first)[0] ?? 0) : 0;
  }
}

/** expo-sqlite implementation. One connection; every statement and transaction is serialized. */
export class SqliteDurableDb implements DurableDb {
  readonly kind = 'sqlite' as const;
  readonly supportsSql = true;
  private readonly mutex = new Mutex();
  private readonly ops: SqliteOps;

  private constructor(private readonly conn: SqliteConnection) {
    this.ops = new SqliteOps(conn);
  }

  /**
   * Prepares a connection: `auto_vacuum = INCREMENTAL` on a brand-new file (it can only be set before
   * the first table exists), WAL journaling, then the synchronous level.
   */
  static async fromConnection(conn: SqliteConnection, options: SqliteDbOptions = {}): Promise<SqliteDurableDb> {
    const tables = await conn.getAllAsync<{ c: number }>("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table'", []);
    if (Number(tables[0]?.c ?? 0) === 0) {
      await conn.execAsync('PRAGMA auto_vacuum = INCREMENTAL');
    }
    await conn.execAsync('PRAGMA journal_mode = WAL');
    await conn.execAsync(`PRAGMA synchronous = ${options.synchronous ?? 'NORMAL'}`);
    return new SqliteDurableDb(conn);
  }

  private run<T>(task: (ops: SqliteOps) => Promise<T>): Promise<T> {
    return this.mutex.run(() => task(this.ops));
  }

  insert(table: string, row: DbRow, options?: { onConflict?: 'abort' | 'replace' | 'ignore' }): Promise<number> {
    return this.run((ops) => ops.insert(table, row, options));
  }
  update(table: string, where: Where, patch: DbRow): Promise<number> {
    return this.run((ops) => ops.update(table, where, patch));
  }
  delete(table: string, where?: Where): Promise<number> {
    return this.run((ops) => ops.delete(table, where));
  }
  select<T extends DbRow = DbRow>(table: string, options?: SelectOptions): Promise<T[]> {
    return this.run((ops) => ops.select<T>(table, options));
  }
  count(table: string, where?: Where): Promise<number> {
    return this.run((ops) => ops.count(table, where));
  }
  execute(sql: string, params?: SqlValue[]): Promise<{ changes: number }> {
    return this.run((ops) => ops.execute(sql, params));
  }
  query<T extends DbRow = DbRow>(sql: string, params?: SqlValue[]): Promise<T[]> {
    return this.run((ops) => ops.query<T>(sql, params));
  }
  createTable(spec: TableSpec): Promise<void> {
    return this.run((ops) => ops.createTable(spec));
  }
  dropTable(name: string): Promise<void> {
    return this.run((ops) => ops.dropTable(name));
  }
  addColumn(table: string, column: ColumnSpec): Promise<void> {
    return this.run((ops) => ops.addColumn(table, column));
  }
  createIndex(table: string, index: IndexSpec): Promise<void> {
    return this.run((ops) => ops.createIndex(table, index));
  }
  listTables(): Promise<string[]> {
    return this.run((ops) => ops.listTables());
  }
  tableColumns(table: string): Promise<string[]> {
    return this.run((ops) => ops.tableColumns(table));
  }

  transaction<T>(fn: (tx: DbOps) => Promise<T>): Promise<T> {
    return this.mutex.run(async () => {
      await this.conn.execAsync('BEGIN IMMEDIATE');
      try {
        const result = await fn(this.ops);
        await this.conn.execAsync('COMMIT');
        return result;
      } catch (error) {
        await this.conn.execAsync('ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
  }

  getSize(): Promise<DbSizeInfo> {
    return this.run(async (ops) => {
      const pageSize = await ops.pragmaNumber('page_size');
      const pageCount = await ops.pragmaNumber('page_count');
      const freelist = await ops.pragmaNumber('freelist_count');
      return { totalBytes: pageSize * pageCount, usedBytes: pageSize * (pageCount - freelist), freeBytes: pageSize * freelist };
    });
  }

  estimateTableBytes(table: string): Promise<number> {
    return this.run(async (ops) => {
      try {
        const rows = await this.conn.getAllAsync<{ bytes: number | null }>('SELECT SUM(pgsize) AS bytes FROM dbstat WHERE name = ?', [table]);
        return Number(rows[0]?.bytes ?? 0);
      } catch {
        // dbstat is not compiled into every SQLite build: estimate from column lengths.
        const columns = await ops.tableColumns(table);
        if (columns.length === 0) return 0;
        const expression = columns.map((column) => `COALESCE(LENGTH(${quoteId(column)}), 0)`).join(' + ');
        const rows = await this.conn.getAllAsync<{ bytes: number | null; c: number }>(`SELECT SUM(${expression}) AS bytes, COUNT(*) AS c FROM ${quoteId(table)}`, []);
        return Number(rows[0]?.bytes ?? 0) + Number(rows[0]?.c ?? 0) * 16;
      }
    });
  }

  incrementalVacuum(): Promise<void> {
    return this.run(() => this.conn.execAsync('PRAGMA incremental_vacuum'));
  }

  optimize(): Promise<void> {
    return this.run(() => this.conn.execAsync('PRAGMA optimize'));
  }

  checkpoint(): Promise<void> {
    return this.run(() => this.conn.execAsync('PRAGMA wal_checkpoint(TRUNCATE)'));
  }

  close(): Promise<void> {
    return this.run(() => this.conn.closeAsync());
  }
}

/** Open (or create) the offline database with expo-sqlite. */
export async function createSqliteDb(options: SqliteDbOptions = {}): Promise<DurableDb> {
  const conn = await openDatabaseAsync(options.name ?? OFFLINE_DB_NAME, undefined, options.directory);
  const db = await SqliteDurableDb.fromConnection(conn as unknown as SqliteConnection, options);
  getOfflineLogger().debug({ message: 'Offline database opened', context: { engine: 'sqlite' } });
  return db;
}
