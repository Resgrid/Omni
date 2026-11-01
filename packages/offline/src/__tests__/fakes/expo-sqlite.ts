// expo-sqlite fake on Node's built-in SQLite (node:sqlite, in-memory). Databases are kept by name so
// reopening one simulates an app restart. Every executed statement is logged for PRAGMA assertions.
import type * as NodeSqliteModule from 'node:sqlite';

type NodeSqlite = typeof NodeSqliteModule;
type DatabaseSync = NodeSqliteModule.DatabaseSync;
type BindValue = string | number | null;

const loadNodeSqlite = (): NodeSqlite | undefined => {
  try {
    return process.getBuiltinModule('node:sqlite');
  } catch {
    return undefined;
  }
};

const nodeSqlite = loadNodeSqlite();
export const isNodeSqliteAvailable = nodeSqlite !== undefined;

const databases = new Map<string, DatabaseSync>();
export const sqliteLog: string[] = [];
let failPattern: RegExp | null = null;

export function __resetSqliteFake(): void {
  for (const db of databases.values()) db.close();
  databases.clear();
  sqliteLog.length = 0;
  failPattern = null;
}

/** Make the next statement matching `pattern` throw (to test failure handling). */
export function __failNextStatement(pattern: RegExp): void {
  failPattern = pattern;
}

const check = (sql: string): void => {
  sqliteLog.push(sql);
  if (failPattern && failPattern.test(sql)) {
    failPattern = null;
    throw new Error(`Injected failure: ${sql}`);
  }
};

const plain = <T>(row: unknown): T => ({ ...(row as Record<string, unknown>) }) as T;

export class FakeSQLiteDatabase {
  constructor(
    readonly databasePath: string,
    private readonly db: DatabaseSync
  ) {}

  async execAsync(source: string): Promise<void> {
    check(source);
    this.db.exec(source);
  }

  async runAsync(source: string, params: BindValue[] = []): Promise<{ changes: number; lastInsertRowId: number }> {
    check(source);
    const result = this.db.prepare(source).run(...params);
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }

  async getAllAsync<T>(source: string, params: BindValue[] = []): Promise<T[]> {
    check(source);
    return this.db
      .prepare(source)
      .all(...params)
      .map((row) => plain<T>(row));
  }

  async getFirstAsync<T>(source: string, params: BindValue[] = []): Promise<T | null> {
    const rows = await this.getAllAsync<T>(source, params);
    return rows[0] ?? null;
  }

  async closeAsync(): Promise<void> {
    // Keep the in-memory database so a reopen sees the same "file".
  }
}

export async function openDatabaseAsync(databaseName: string): Promise<FakeSQLiteDatabase> {
  if (!nodeSqlite) throw new Error('node:sqlite is not available in this Node version');
  let db = databases.get(databaseName);
  if (!db) {
    db = new nodeSqlite.DatabaseSync(':memory:');
    databases.set(databaseName, db);
  }
  return new FakeSQLiteDatabase(databaseName, db);
}
