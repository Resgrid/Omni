import { type Clock, systemClock } from '../util/ids';
import { getOfflineLogger } from '../util/logger';
import type { DbOps, DbRow, DurableDb, SchemaModule, SchemaResult, TableSpec } from './types';

/** Per-module schema versions. Part of the frozen on-disk identity once released. */
export const SCHEMA_TABLE = '_resgrid_schema';

const schemaTable: TableSpec = {
  name: SCHEMA_TABLE,
  columns: [
    { name: 'module', type: 'TEXT', primaryKey: true },
    { name: 'version', type: 'INTEGER', notNull: true },
    { name: 'updatedAt', type: 'INTEGER', notNull: true },
  ],
};

export interface ApplySchemaOptions {
  now?: Clock;
  /** Called after a module's tables were rebuilt so its owner can re-hydrate from the server. */
  onRebuilt?: (result: SchemaResult) => void;
}

const setVersion = (tx: DbOps, module: string, version: number, now: Clock): Promise<number> => tx.insert(SCHEMA_TABLE, { module, version, updatedAt: now() }, { onConflict: 'replace' });

async function ensureTables(tx: DbOps, tables: TableSpec[]): Promise<void> {
  for (const table of tables) {
    await tx.createTable(table);
    const existing = new Set(await tx.tableColumns(table.name));
    for (const column of table.columns) {
      if (!existing.has(column.name)) {
        await tx.addColumn(table.name, column);
      }
    }
    for (const index of table.indexes ?? []) {
      await tx.createIndex(table.name, index);
    }
  }
}

function validateModule(module: SchemaModule): void {
  const names = new Set<string>();
  for (const table of module.tables) {
    if (names.has(table.name)) throw new Error(`Schema module "${module.module}" declares table "${table.name}" twice.`);
    names.add(table.name);
  }
  for (const migration of module.migrations ?? []) {
    if (migration.toVersion > module.version) {
      throw new Error(`Schema module "${module.module}" has migration "${migration.name}" beyond its version ${module.version}.`);
    }
  }
}

async function rebuild(db: DurableDb, module: SchemaModule, fromVersion: number, failedMigration: string, now: Clock): Promise<SchemaResult> {
  if (!module.preserveRowsOnFailure) {
    await db.transaction(async (tx) => {
      for (const table of module.tables) await tx.dropTable(table.name);
      await ensureTables(tx, module.tables);
      await setVersion(tx, module.module, module.version, now);
    });
    return { module: module.module, status: 'rebuilt', fromVersion, toVersion: module.version, failedMigration };
  }

  // Unsent writes: copy every row out, rebuild at the latest spec, copy back what still fits.
  const existingTables = new Set(await db.listTables());
  const snapshot = new Map<string, DbRow[]>();
  for (const table of module.tables) {
    if (existingTables.has(table.name)) snapshot.set(table.name, await db.select(table.name));
  }

  let preservedRows = 0;
  let lostRows = 0;
  await db.transaction(async (tx) => {
    for (const table of module.tables) await tx.dropTable(table.name);
    await ensureTables(tx, module.tables);
    for (const table of module.tables) {
      const columns = new Set(table.columns.map((column) => column.name));
      for (const row of snapshot.get(table.name) ?? []) {
        const fitted: DbRow = {};
        for (const [key, value] of Object.entries(row)) {
          if (columns.has(key)) fitted[key] = value;
        }
        try {
          preservedRows += await tx.insert(table.name, fitted, { onConflict: 'ignore' });
        } catch {
          lostRows++;
        }
      }
    }
    await setVersion(tx, module.module, module.version, now);
  });
  return { module: module.module, status: 'rebuilt-preserved', fromVersion, toVersion: module.version, failedMigration, preservedRows, lostRows };
}

/**
 * Bring each module's tables to its declared version. Forward-only: a database written by a newer
 * build is left alone. A failing migration never blocks the app: preserving modules (the outbox) are
 * migrated first and keep their rows; cache modules are dropped and rebuilt for re-hydration.
 */
export async function applySchema(db: DurableDb, modules: SchemaModule[], options: ApplySchemaOptions = {}): Promise<SchemaResult[]> {
  const now = options.now ?? systemClock;
  const logger = getOfflineLogger();
  await db.createTable(schemaTable);

  const ordered = [...modules].sort((a, b) => Number(Boolean(b.preserveRowsOnFailure)) - Number(Boolean(a.preserveRowsOnFailure)));
  const results: SchemaResult[] = [];

  for (const module of ordered) {
    validateModule(module);
    const row = (await db.select(SCHEMA_TABLE, { where: { module: module.module } }))[0];
    const stored = row ? Number(row.version) : null;

    if (stored === null) {
      await db.transaction(async (tx) => {
        await ensureTables(tx, module.tables);
        await setVersion(tx, module.module, module.version, now);
      });
      results.push({ module: module.module, status: 'created', fromVersion: null, toVersion: module.version });
      continue;
    }

    if (stored >= module.version) {
      await db.transaction((tx) => ensureTables(tx, module.tables));
      if (stored > module.version) {
        logger.warn({ message: 'Database schema is newer than this build; leaving it unchanged', context: { module: module.module, stored, declared: module.version } });
      }
      results.push({ module: module.module, status: stored > module.version ? 'newer-than-app' : 'current', fromVersion: stored, toVersion: stored });
      continue;
    }

    const pending = (module.migrations ?? []).filter((migration) => migration.toVersion > stored).sort((a, b) => a.toVersion - b.toVersion);
    let current = stored;
    let failed: string | null = null;
    for (const migration of pending) {
      try {
        await db.transaction(async (tx) => {
          await migration.up(tx);
          await setVersion(tx, module.module, migration.toVersion, now);
        });
        current = migration.toVersion;
      } catch (error) {
        failed = migration.name;
        logger.error({
          message: 'Schema migration failed; rebuilding module tables',
          context: { module: module.module, migration: migration.name, fromVersion: current, error: error instanceof Error ? error.name : typeof error },
        });
        break;
      }
    }

    if (failed !== null) {
      const result = await rebuild(db, module, stored, failed, now);
      results.push(result);
      options.onRebuilt?.(result);
      continue;
    }

    // Additive changes without an explicit migration (new table, new nullable column) are applied here.
    await db.transaction(async (tx) => {
      await ensureTables(tx, module.tables);
      await setVersion(tx, module.module, module.version, now);
    });
    results.push({ module: module.module, status: 'migrated', fromVersion: stored, toVersion: module.version });
  }

  return results;
}

export async function getSchemaVersion(db: DurableDb, module: string): Promise<number | null> {
  const tables = await db.listTables();
  if (!tables.includes(SCHEMA_TABLE)) return null;
  const row = (await db.select(SCHEMA_TABLE, { where: { module } }))[0];
  return row ? Number(row.version) : null;
}
