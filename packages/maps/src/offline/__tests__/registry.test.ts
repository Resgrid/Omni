import { createMemoryDb } from '@resgrid/offline';

import { createDbOfflinePackRegistry, OFFLINE_MAP_PACKS_TABLE, offlinePackScopeKey } from '../registry';
import { OfflineMapPackKind, type OfflineMapPackRecord } from '../types';

const scope = { serverUrl: 'https://API.resgrid.test/api/v4/', departmentId: '12', userId: 'user-1' };
const other = { serverUrl: 'https://api.resgrid.test', departmentId: '12', userId: 'user-2' };

const record = (packId: string, overrides: Partial<OfflineMapPackRecord> = {}): OfflineMapPackRecord => ({
  packId,
  kind: OfflineMapPackKind.Basemap,
  assetKind: 'basemap',
  name: 'Cell',
  key: packId,
  version: 'v1',
  sha256: 'abc',
  bytes: 100,
  path: 'ignored',
  bounds: [-1, -1, 1, 1],
  minZoom: 0,
  maxZoom: 15,
  pinned: true,
  lastUsedAt: null,
  downloadedAt: 5,
  ...overrides,
});

describe('createDbOfflinePackRegistry', () => {
  it('stores rows per scope with relative paths resolved at read time', async () => {
    const db = await createMemoryDb();
    let root = 'file:///old-sandbox';
    const registry = createDbOfflinePackRegistry({ db, resolvePath: (path) => `${root}/${path}` });
    await registry.put(scope, record('pack:a'), 'k/files/a.pmtiles');
    await registry.put(scope, record('style:day', { kind: null, assetKind: 'style', bytes: 10, pinned: false }), 'k/files/s.json');
    await registry.put(other, record('pack:a'), 'k2/files/a.pmtiles');

    expect(await registry.list(scope)).toHaveLength(2);
    expect(await registry.list(scope, OfflineMapPackKind.Basemap)).toHaveLength(1);
    root = 'file:///new-sandbox';
    await expect(registry.get(scope, 'pack:a')).resolves.toMatchObject({ path: 'file:///new-sandbox/k/files/a.pmtiles', bounds: [-1, -1, 1, 1], pinned: true, assetKind: 'basemap' });
    await expect(registry.get(scope, 'style:day')).resolves.toMatchObject({ kind: null, pinned: false });
    await expect(registry.relativePathOf(scope, 'pack:a')).resolves.toBe('k/files/a.pmtiles');
    await expect(registry.totalBytes(scope)).resolves.toBe(110);

    await registry.markUsed(scope, 'pack:a', 99);
    await expect(registry.get(scope, 'pack:a')).resolves.toMatchObject({ lastUsedAt: 99 });

    await registry.remove(scope, 'style:day');
    await expect(registry.get(scope, 'style:day')).resolves.toBeNull();
    expect((await registry.scopeKeys()).sort()).toEqual([offlinePackScopeKey(scope), offlinePackScopeKey(other)].sort());

    await registry.wipe(scope);
    expect(await registry.list(scope)).toHaveLength(0);
    expect(await registry.list(other)).toHaveLength(1);
    await registry.wipe();
    expect(await db.count(OFFLINE_MAP_PACKS_TABLE)).toBe(0);
  });

  it('keys scopes by a hash: normalized server, department and user, never the raw user id', async () => {
    expect(offlinePackScopeKey(scope)).toBe(offlinePackScopeKey({ serverUrl: 'https://api.resgrid.test', departmentId: '12', userId: 'user-1' }));
    expect(offlinePackScopeKey(scope)).not.toBe(offlinePackScopeKey(other));
    expect(offlinePackScopeKey(scope)).not.toContain('user-1');
    const db = await createMemoryDb();
    const registry = createDbOfflinePackRegistry({ db, resolvePath: (path) => path });
    await registry.put(scope, record('pack:a'), 'x');
    expect(JSON.stringify(await db.select(OFFLINE_MAP_PACKS_TABLE))).not.toContain('user-1');
  });
});
