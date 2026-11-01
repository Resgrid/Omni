import { applySchema, type DbRow, type DurableDb, normalizeServer, type SchemaModule, type Where } from '@resgrid/offline';

import { sha256Hex } from './sha256';
import type { FloorCorners, OfflineAssetKind, OfflineMapPackKind, OfflineMapPackRecord, OfflinePackRegistry, OfflinePackScope, PackBounds } from './types';

/** Registry table (plan §19.5 `offline_map_packs`). Name and columns are on-disk identity once released. */
export const OFFLINE_MAP_PACKS_TABLE = 'offline_map_packs';

/**
 * Retention (plan §8.2a, §19.5): a row lives exactly as long as its file. Rows go when the manifest drops or replaces
 * the item, on "Delete", on logout / department / server switch (D17, wipe table + store reset), when the file is
 * missing, when they belong to another scope, and when the LRU budget evicts an unpinned pack. Applied by the
 * `maps.offline-packs` retention hook (`registerOfflineMapPacks`), never by age alone — offline data must survive a
 * long time without network.
 */
export const offlineMapPacksSchemaModule: SchemaModule = {
  module: 'maps.offline-packs',
  version: 1,
  tables: [
    {
      name: OFFLINE_MAP_PACKS_TABLE,
      columns: [
        { name: 'id', type: 'TEXT', primaryKey: true },
        { name: 'scopeKey', type: 'TEXT', notNull: true },
        { name: 'packId', type: 'TEXT', notNull: true },
        { name: 'assetKind', type: 'TEXT', notNull: true },
        { name: 'kind', type: 'INTEGER' },
        { name: 'name', type: 'TEXT' },
        { name: 'packKey', type: 'TEXT', notNull: true },
        { name: 'version', type: 'TEXT', notNull: true },
        { name: 'sha256', type: 'TEXT', notNull: true },
        { name: 'bytes', type: 'INTEGER', notNull: true },
        { name: 'path', type: 'TEXT', notNull: true },
        { name: 'bounds', type: 'TEXT' },
        { name: 'minZoom', type: 'REAL', notNull: true },
        { name: 'maxZoom', type: 'REAL', notNull: true },
        { name: 'pinned', type: 'INTEGER', notNull: true, default: 0 },
        { name: 'lastUsedAt', type: 'INTEGER' },
        { name: 'downloadedAt', type: 'INTEGER', notNull: true },
        { name: 'customMapLayerId', type: 'TEXT' },
        { name: 'floorId', type: 'TEXT' },
        { name: 'corners', type: 'TEXT' },
        { name: 'manifestVersion', type: 'TEXT' },
      ],
      indexes: [{ name: 'offline_map_packs_scope', columns: ['scopeKey'] }],
    },
  ],
};

/**
 * Stable, non-reversible id of a scope (server + department + user): the registry key and the per-scope folder name.
 * The raw user id is never written to the table or the file system.
 */
export const offlinePackScopeKey = (scope: OfflinePackScope): string => sha256Hex(`${normalizeServer(scope.serverUrl)}|${scope.departmentId.trim()}|${scope.userId.trim()}`).slice(0, 24);

export interface DbOfflinePackRegistryOptions {
  db: DurableDb;
  /** Relative path → absolute `file://` URI (the file store's `uriFor`). */
  resolvePath: (relativePath: string) => string;
}

export interface DbOfflinePackRegistry extends OfflinePackRegistry {
  /** Creates/migrates the table (idempotent). */
  init(): Promise<void>;
  /** Stored relative path of a record (for deleting its file). */
  relativePathOf(scope: OfflinePackScope, packId: string): Promise<string | null>;
  /** Inserts or replaces a row whose file lives at `relativePath`. */
  put(scope: OfflinePackScope, record: OfflineMapPackRecord, relativePath: string): Promise<void>;
  /** Scope keys that have rows. */
  scopeKeys(): Promise<string[]>;
  /** All rows of a scope key with their relative paths (retention). */
  rowsForScopeKey(scopeKey: string): Promise<{ packId: string; relativePath: string; bytes: number; pinned: boolean; lastUsedAt: number | null; downloadedAt: number }[]>;
  removeByScopeKey(scopeKey: string, packId?: string): Promise<number>;
}

const parseJson = <T>(value: unknown): T | null => {
  if (typeof value !== 'string' || !value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const numberOr = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/** The pack registry on the offline database (`@resgrid/offline` DurableDb; SQLite on native). */
export function createDbOfflinePackRegistry({ db, resolvePath }: DbOfflinePackRegistryOptions): DbOfflinePackRegistry {
  let ready: Promise<void> | null = null;
  const init = (): Promise<void> => {
    ready ??= applySchema(db, [offlineMapPacksSchemaModule]).then(() => undefined);
    return ready;
  };

  const rowId = (scopeKey: string, packId: string): string => `${scopeKey}:${packId}`;

  const toRecord = (row: DbRow): OfflineMapPackRecord => ({
    packId: String(row.packId),
    kind: typeof row.kind === 'number' ? (row.kind as OfflineMapPackKind) : null,
    assetKind: String(row.assetKind) as OfflineAssetKind,
    name: textOrNull(row.name),
    key: String(row.packKey),
    version: String(row.version),
    sha256: String(row.sha256),
    bytes: numberOr(row.bytes, 0),
    path: resolvePath(String(row.path)),
    bounds: parseJson<PackBounds>(row.bounds),
    minZoom: numberOr(row.minZoom, 0),
    maxZoom: numberOr(row.maxZoom, 15),
    pinned: row.pinned === 1,
    lastUsedAt: typeof row.lastUsedAt === 'number' ? row.lastUsedAt : null,
    downloadedAt: numberOr(row.downloadedAt, 0),
    customMapLayerId: textOrNull(row.customMapLayerId),
    floorId: textOrNull(row.floorId),
    corners: parseJson<FloorCorners>(row.corners),
    manifestVersion: textOrNull(row.manifestVersion),
  });

  const put = async (scope: OfflinePackScope, record: OfflineMapPackRecord, relativePath: string): Promise<void> => {
    await init();
    const scopeKey = offlinePackScopeKey(scope);
    await db.insert(
      OFFLINE_MAP_PACKS_TABLE,
      {
        id: rowId(scopeKey, record.packId),
        scopeKey,
        packId: record.packId,
        assetKind: record.assetKind ?? 'basemap',
        kind: record.kind,
        name: record.name ?? null,
        packKey: record.key,
        version: record.version,
        sha256: record.sha256,
        bytes: record.bytes,
        path: relativePath,
        bounds: record.bounds ? JSON.stringify(record.bounds) : null,
        minZoom: record.minZoom,
        maxZoom: record.maxZoom,
        pinned: record.pinned ? 1 : 0,
        lastUsedAt: record.lastUsedAt,
        downloadedAt: record.downloadedAt,
        customMapLayerId: record.customMapLayerId ?? null,
        floorId: record.floorId ?? null,
        corners: record.corners ? JSON.stringify(record.corners) : null,
        manifestVersion: record.manifestVersion ?? null,
      },
      { onConflict: 'replace' }
    );
  };

  return {
    init,
    put,
    async list(scope, kind) {
      await init();
      const where: Where = kind === undefined ? { scopeKey: offlinePackScopeKey(scope) } : { scopeKey: offlinePackScopeKey(scope), kind: kind as number };
      const rows = await db.select(OFFLINE_MAP_PACKS_TABLE, { where, orderBy: [{ column: 'downloadedAt' }] });
      return rows.map(toRecord);
    },
    async get(scope, packId) {
      await init();
      const rows = await db.select(OFFLINE_MAP_PACKS_TABLE, { where: { id: rowId(offlinePackScopeKey(scope), packId) }, limit: 1 });
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async relativePathOf(scope, packId) {
      await init();
      const rows = await db.select(OFFLINE_MAP_PACKS_TABLE, { where: { id: rowId(offlinePackScopeKey(scope), packId) }, columns: ['path'], limit: 1 });
      return rows[0] ? String(rows[0].path) : null;
    },
    /** `record.path` must be relative here (use `put` with an explicit relative path from the manager). */
    async upsert(scope, record) {
      await put(scope, record, record.path);
    },
    async remove(scope, packId) {
      await init();
      await db.delete(OFFLINE_MAP_PACKS_TABLE, { id: rowId(offlinePackScopeKey(scope), packId) });
    },
    async markUsed(scope, packId, at) {
      await init();
      await db.update(OFFLINE_MAP_PACKS_TABLE, { id: rowId(offlinePackScopeKey(scope), packId) }, { lastUsedAt: at });
    },
    async totalBytes(scope) {
      await init();
      const rows = await db.select(OFFLINE_MAP_PACKS_TABLE, { where: { scopeKey: offlinePackScopeKey(scope) }, columns: ['bytes'] });
      return rows.reduce((sum, row) => sum + numberOr(row.bytes, 0), 0);
    },
    async wipe(scope) {
      await init();
      await db.delete(OFFLINE_MAP_PACKS_TABLE, scope ? { scopeKey: offlinePackScopeKey(scope) } : undefined);
    },
    async scopeKeys() {
      await init();
      const rows = await db.select(OFFLINE_MAP_PACKS_TABLE, { columns: ['scopeKey'] });
      return [...new Set(rows.map((row) => String(row.scopeKey)))];
    },
    async rowsForScopeKey(scopeKey) {
      await init();
      const rows = await db.select(OFFLINE_MAP_PACKS_TABLE, { where: { scopeKey }, columns: ['packId', 'path', 'bytes', 'pinned', 'lastUsedAt', 'downloadedAt'] });
      return rows.map((row) => ({
        packId: String(row.packId),
        relativePath: String(row.path),
        bytes: numberOr(row.bytes, 0),
        pinned: row.pinned === 1,
        lastUsedAt: typeof row.lastUsedAt === 'number' ? row.lastUsedAt : null,
        downloadedAt: numberOr(row.downloadedAt, 0),
      }));
    },
    async removeByScopeKey(scopeKey, packId) {
      await init();
      return db.delete(OFFLINE_MAP_PACKS_TABLE, packId === undefined ? { scopeKey } : { id: rowId(scopeKey, packId) });
    },
  };
}
