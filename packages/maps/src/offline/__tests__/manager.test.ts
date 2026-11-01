import { createMemoryDb, createResetRegistry, createRetentionRegistry, createStorageAreaRegistry, type DurableDb, findTablesWithoutRetention } from '@resgrid/offline';

import { createMemoryPackFileStore } from '../file-store';
import { createMemoryOfflineMapsKv, createOfflinePackManager, OFFLINE_MAPS_WIFI_ONLY_KEY, type OfflineMapsState, type OfflinePackManagerOptions } from '../manager';
import type { OfflineNetworkState } from '../network';
import { createOfflineMapOptions } from '../offline-options';
import { registerOfflineMapPacks } from '../registration';
import { OFFLINE_MAP_PACKS_TABLE, offlinePackScopeKey } from '../registry';
import type { OfflineFetch } from '../transport';
import type { OfflinePackScope } from '../types';
import { API_BASE, bytesOf, createFakeServer, MANIFEST_URL, packEntry, packUrl, sha } from './helpers';

const MB = 1024 * 1024;
const GB = 1024 * MB;
const USER_1: OfflinePackScope = { serverUrl: 'https://api.resgrid.test/api/v4', departmentId: '12', userId: 'user-1' };
const USER_2: OfflinePackScope = { serverUrl: 'https://api.resgrid.test/api/v4', departmentId: '12', userId: 'user-2' };
const KEY_1 = offlinePackScopeKey(USER_1);

const CELL_1 = bytesOf(300, 1);
const CELL_2 = bytesOf(260, 2);
const CUSTOM = bytesOf(150, 3);
const DEPT = new TextEncoder().encode(JSON.stringify({ pois: { type: 'FeatureCollection', features: [] } }));
const STYLE = new TextEncoder().encode(JSON.stringify({ version: 8, sources: { protomaps: { type: 'vector', url: '{basemap}' } }, layers: [{ id: 'water', type: 'fill', source: 'protomaps', 'source-layer': 'water' }] }));
const DEPT_URL = 'https://api.resgrid.test/api/v4/Mapping/GetDepartmentData?sig=1';
const STYLE_URL = 'https://api.resgrid.test/api/v4/Mapping/GetStyle/offline-day?sig=1';

const manifest = (overrides: Record<string, unknown> = {}, packs?: unknown[]) => ({
  ManifestVersion: 'm1',
  Policy: { WifiOnly: true, RefreshHours: 24, StaleDays: 7 },
  Styles: { Day: { Url: STYLE_URL, Version: '1', Sha256: sha(STYLE), SizeBytes: STYLE.length } },
  DepartmentData: { Url: DEPT_URL, Version: 'd1', Sha256: sha(DEPT), SizeBytes: DEPT.length },
  Packs: packs ?? [packEntry({ id: 'cell-1', body: CELL_1 }), packEntry({ id: 'cell-2', body: CELL_2 }), packEntry({ id: 'map-1', kind: 3, body: CUSTOM, layerId: 'L1', name: 'Pre-plan' })],
  ...overrides,
});

interface Setup {
  db: DurableDb;
  server: ReturnType<typeof createFakeServer>;
  fileStore: ReturnType<typeof createMemoryPackFileStore>;
  manager: ReturnType<typeof createOfflinePackManager>;
  kv: ReturnType<typeof createMemoryOfflineMapsKv>;
  ambient: jest.Mock;
  states: OfflineMapsState[];
  setScope(scope: OfflinePackScope | null): void;
  setNetwork(network: OfflineNetworkState): void;
}

async function setup(options: Partial<OfflinePackManagerOptions> & { fetchWrapper?: (inner: OfflineFetch) => OfflineFetch } = {}): Promise<Setup> {
  const db = await createMemoryDb();
  const server = createFakeServer();
  server.serveJson(MANIFEST_URL, manifest());
  server.serveFile(packUrl('cell-1'), CELL_1);
  server.serveFile(packUrl('cell-2'), CELL_2);
  server.serveFile(packUrl('map-1'), CUSTOM);
  server.serveFile(DEPT_URL, DEPT);
  server.serveFile(STYLE_URL, STYLE);
  const fileStore = createMemoryPackFileStore({ disk: { freeBytes: 32 * GB, totalBytes: 64 * GB } });
  const kv = createMemoryOfflineMapsKv();
  const ambient = jest.fn();
  let scope: OfflinePackScope | null = USER_1;
  let network: OfflineNetworkState = { isConnected: true, isUnmetered: true, isExpensive: false };
  const { fetchWrapper, ...rest } = options;
  const manager = createOfflinePackManager({
    db,
    fileStore,
    getScope: () => scope,
    getApiBaseUrl: () => API_BASE,
    fetchImpl: fetchWrapper ? fetchWrapper(server.fetchImpl) : server.fetchImpl,
    network: { getState: async () => network },
    kv,
    applyAmbientCacheSize: ambient,
    chunkBytes: 64,
    platformSupported: true,
    allowLocalHttp: false,
    progressIntervalMs: 0,
    ...rest,
  });
  const states: OfflineMapsState[] = [];
  manager.subscribe(() => states.push(manager.getState()));
  await manager.init();
  manager.updateConfig({ OfflineMapsAvailable: true, OfflineManifestUrl: MANIFEST_URL, AmbientCacheMaxBytes: 100 * MB });
  return {
    db,
    server,
    fileStore,
    manager,
    kv,
    ambient,
    states,
    setScope: (next) => {
      scope = next;
    },
    setNetwork: (next) => {
      network = next;
    },
  };
}

const keysUnder = (fileStore: Setup['fileStore'], prefix: string): string[] => [...fileStore.files.keys()].filter((key) => key.startsWith(prefix)).sort();
const rowsOf = (db: DurableDb) => db.select(OFFLINE_MAP_PACKS_TABLE);

describe('OfflinePackManager', () => {
  it('stays off when the department does not offer offline maps, and on unsupported platforms', async () => {
    const { manager, server } = await setup();
    manager.updateConfig({ OfflineMapsAvailable: false, OfflineManifestUrl: MANIFEST_URL });
    expect(manager.getState().availability).toBe('disabled');
    await expect(manager.download()).resolves.toEqual({ ok: false, code: 'disabled' });
    await expect(manager.refreshManifest()).resolves.toEqual({ ok: false, code: 'disabled' });
    expect(server.requests).toHaveLength(0);

    const web = await setup({ fileStore: null });
    expect(web.manager.getState().availability).toBe('unsupported');
    await expect(web.manager.download()).resolves.toEqual({ ok: false, code: 'unsupported-platform' });
  });

  it('refreshes the manifest, applies the ambient cache budget and reports what is missing', async () => {
    const { manager, ambient } = await setup();
    expect(ambient).toHaveBeenCalledWith(100 * MB);
    await expect(manager.refreshManifest()).resolves.toEqual({ ok: true });
    const state = manager.getState();
    expect(state).toMatchObject({ availability: 'available', status: 'idle', manifestVersion: 'm1', isInstalled: false, updateAvailable: true, wifiOnly: true });
    expect(state.totalBytes).toBe(CELL_1.length + CELL_2.length + CUSTOM.length + DEPT.length + STYLE.length);
    expect(state.packs.map((pack) => [pack.packId, pack.state])).toEqual([
      ['department-data', 'not-downloaded'],
      ['style:day', 'not-downloaded'],
      ['pack:cell-1', 'not-downloaded'],
      ['pack:cell-2', 'not-downloaded'],
      ['pack:map-1', 'not-downloaded'],
    ]);
  });

  it('downloads, verifies and installs everything, then serves the local pmtiles style', async () => {
    const { manager, db, fileStore, states } = await setup();
    await expect(manager.download()).resolves.toEqual({ ok: true });
    const state = manager.getState();
    expect(state).toMatchObject({ status: 'idle', isInstalled: true, updateAvailable: false, error: null, progress: null });
    expect(state.installedBytes).toBe(state.totalBytes);
    expect(states.some((entry) => entry.status === 'downloading' && entry.progress !== null && entry.progress.fraction > 0 && entry.progress.fraction < 1)).toBe(true);

    expect(keysUnder(fileStore, `${KEY_1}/tmp`)).toEqual([]);
    expect(keysUnder(fileStore, `${KEY_1}/files`)).toHaveLength(5);
    const rows = await rowsOf(db);
    expect(rows).toHaveLength(5);
    expect(JSON.stringify(rows)).not.toContain('user-1');
    expect(JSON.stringify(rows)).not.toContain('sig=');

    const installed = manager.getInstalledSet();
    expect(installed?.basemapPacks.map((pack) => pack.packId).sort()).toEqual(['pack:cell-1', 'pack:cell-2']);
    expect(installed?.customMapPacks.map((pack) => pack.customMapLayerId)).toEqual(['L1']);
    expect(installed?.templates.light).toMatchObject({ version: 8 });
    expect(installed?.departmentDataPath).toMatch(/^file:\/\/\/memory\/offline-maps\/.+\.json$/);

    // A refresh that changes nothing keeps the installed revision (maps do not restyle).
    await manager.refreshManifest();
    expect(manager.getInstalledSet()?.revision).toBe(installed?.revision);

    const options = createOfflineMapOptions({ installed, isOnline: false });
    const style = JSON.stringify(options?.getStyle('light'));
    expect(style).toContain(`pmtiles://file:///memory/offline-maps/${KEY_1}/files/`);
    expect(style).toContain('offline-custom-L1');
  });

  it('waits for Wi-Fi when Wi-Fi only is on, and downloads on cellular once the user allows it', async () => {
    const { manager, kv, setNetwork } = await setup();
    setNetwork({ isConnected: true, isUnmetered: false, isExpensive: true });
    await expect(manager.download()).resolves.toEqual({ ok: false, code: 'waiting-for-wifi' });
    expect(manager.getState()).toMatchObject({ status: 'waiting-for-wifi', error: 'waiting-for-wifi', isInstalled: false });

    manager.setWifiOnly(false);
    expect(kv.getBoolean(OFFLINE_MAPS_WIFI_ONLY_KEY)).toBe(false);
    await expect(manager.download()).resolves.toEqual({ ok: true });
    expect(manager.getState().isInstalled).toBe(true);

    setNetwork({ isConnected: false, isUnmetered: false, isExpensive: false });
    await manager.deleteAll();
    await expect(manager.download()).resolves.toEqual({ ok: false, code: 'offline' });
  });

  it('resumes an interrupted pack from where it stopped', async () => {
    const { manager, server, fileStore } = await setup();
    server.serveFile(packUrl('cell-1'), CELL_1, { failFrom: 128 });
    await expect(manager.download()).resolves.toEqual({ ok: false, code: 'download-network-error' });
    expect(manager.getState().status).toBe('paused');
    const parts = keysUnder(fileStore, `${KEY_1}/tmp`);
    expect(parts).toHaveLength(1);
    expect(fileStore.files.get(parts[0])?.length).toBe(128);

    server.serveFile(packUrl('cell-1'), CELL_1);
    server.requests.length = 0;
    await expect(manager.download()).resolves.toEqual({ ok: true });
    expect(server.requestsFor(packUrl('cell-1'))[0]?.range).toBe('bytes=128-191');
    expect(server.requestsFor(DEPT_URL)).toHaveLength(0);
  });

  it('discards a pack that fails verification, installs the rest and reports it', async () => {
    const { manager, server, db, fileStore } = await setup();
    server.serveFile(packUrl('cell-2'), bytesOf(CELL_2.length, 99));
    await expect(manager.download()).resolves.toEqual({ ok: false, code: 'integrity-failed' });
    expect(manager.getState()).toMatchObject({ status: 'error', error: 'integrity-failed', isInstalled: true, updateAvailable: true });
    const ids = (await rowsOf(db)).map((row) => row.packId).sort();
    expect(ids).toEqual(['department-data', 'pack:cell-1', 'pack:map-1', 'style:day']);
    expect(keysUnder(fileStore, `${KEY_1}/tmp`)).toEqual([]);
  });

  it('updates only what changed when the manifest version changes and drops removed items', async () => {
    const { manager, server, db, fileStore } = await setup();
    await manager.download();
    const before = keysUnder(fileStore, `${KEY_1}/files`);
    const newCell = bytesOf(320, 7);
    server.serveJson(MANIFEST_URL, manifest({ ManifestVersion: 'm2' }, [packEntry({ id: 'cell-1', body: newCell, version: 'v2', url: packUrl('cell-1', 's2') }), packEntry({ id: 'cell-2', body: CELL_2 })]));
    server.serveFile(packUrl('cell-1', 's2'), newCell);
    server.requests.length = 0;

    await manager.refreshManifest();
    expect(manager.getState()).toMatchObject({ manifestVersion: 'm2', updateAvailable: true, pendingBytes: newCell.length });
    await expect(manager.download()).resolves.toEqual({ ok: true });
    expect(server.requests.filter((request) => request.url !== MANIFEST_URL).map((request) => request.url)).toEqual(Array(5).fill(packUrl('cell-1', 's2')));

    const rows = await rowsOf(db);
    expect(rows.map((row) => row.packId).sort()).toEqual(['department-data', 'pack:cell-1', 'pack:cell-2', 'style:day']);
    expect(rows.find((row) => row.packId === 'pack:cell-1')).toMatchObject({ version: 'v2', sha256: sha(newCell), manifestVersion: 'm2' });
    const after = keysUnder(fileStore, `${KEY_1}/files`);
    expect(after).toHaveLength(4);
    expect(after.filter((key) => !before.includes(key))).toHaveLength(1);
    expect(manager.getState()).toMatchObject({ updateAvailable: false, isInstalled: true });
  });

  it('refuses a response area over the limit without deleting the installed base map', async () => {
    const { manager, server, db } = await setup();
    await manager.download();
    server.serveJson(MANIFEST_URL, manifest({ ManifestVersion: 'm3', Policy: { ResponseAreaMaxBytes: 100 } }));
    await manager.refreshManifest();
    await expect(manager.download()).resolves.toEqual({ ok: false, code: 'response-area-too-large' });
    expect((await rowsOf(db)).map((row) => row.packId)).toEqual(expect.arrayContaining(['pack:cell-1', 'pack:cell-2']));
    expect(manager.getState().packs.find((pack) => pack.packId === 'pack:cell-1')).toMatchObject({ state: 'rejected', code: 'response-area-too-large' });
  });

  it('refuses a download that would leave less than 10 % of the device free', async () => {
    const { manager, fileStore } = await setup();
    fileStore.setDisk({ freeBytes: 6_500, totalBytes: 64_000 });
    await expect(manager.download()).resolves.toEqual({ ok: false, code: 'insufficient-storage' });
  });

  it('refreshes an expired signed download link once and retries', async () => {
    let manifestCalls = 0;
    const { manager, server } = await setup({
      fetchWrapper: (inner) => async (url, init) => {
        if (url === MANIFEST_URL) {
          manifestCalls += 1;
          server.serveJson(MANIFEST_URL, manifestCalls === 1 ? manifest() : manifest({}, [packEntry({ id: 'cell-1', body: CELL_1, url: packUrl('cell-1', 's2') }), packEntry({ id: 'cell-2', body: CELL_2 })]));
        }
        return inner(url, init);
      },
    });
    server.files.set(packUrl('cell-1'), { status: 403 });
    server.serveFile(packUrl('cell-1', 's2'), CELL_1);
    await expect(manager.download()).resolves.toEqual({ ok: true });
    expect(manifestCalls).toBe(2);
    expect(manager.getState().isInstalled).toBe(true);
  });

  it('needs a session', async () => {
    const { manager, setScope } = await setup();
    setScope(null);
    await expect(manager.download()).resolves.toEqual({ ok: false, code: 'no-session' });
  });

  it('deletes packs on request and wipes everything (rows, files, summary) on logout', async () => {
    const { manager, db, fileStore } = await setup();
    await manager.download();
    await manager.deleteAll();
    expect(fileStore.files.size).toBe(0);
    expect(await rowsOf(db)).toHaveLength(0);
    expect(manager.getState()).toMatchObject({ isInstalled: false, installedBytes: 0, updateAvailable: true, manifestVersion: 'm1' });
    expect(manager.getInstalledSet()).toBeNull();

    await manager.download();
    await manager.wipe();
    expect(fileStore.files.size).toBe(0);
    expect(await rowsOf(db)).toHaveLength(0);
    expect(manager.getState()).toMatchObject({ isInstalled: false, manifestVersion: null, packs: [] });
  });

  describe('retention', () => {
    it('removes another account’s packs', async () => {
      const { manager, db, fileStore, setScope } = await setup();
      await manager.download();
      setScope(USER_2);
      const removed = await manager.applyRetention();
      expect(removed).toBeGreaterThan(0);
      expect(fileStore.files.size).toBe(0);
      expect(await rowsOf(db)).toHaveLength(0);
    });

    it('removes orphan files, stale partial downloads and rows whose file is gone', async () => {
      const { manager, db, fileStore } = await setup();
      await manager.download();
      await fileStore.append(`${KEY_1}/files/orphan.pmtiles`, bytesOf(10));
      await fileStore.append(`${KEY_1}/tmp/abandoned.part`, bytesOf(10));
      const custom = (await rowsOf(db)).find((row) => row.packId === 'pack:map-1');
      await fileStore.remove(String(custom?.path));

      expect(await manager.applyRetention()).toBe(3);
      expect(fileStore.files.has(`${KEY_1}/files/orphan.pmtiles`)).toBe(false);
      expect(fileStore.files.has(`${KEY_1}/tmp/abandoned.part`)).toBe(false);
      expect((await rowsOf(db)).map((row) => row.packId)).not.toContain('pack:map-1');
      expect(manager.getState().packs.find((pack) => pack.packId === 'pack:map-1')?.state).toBe('not-downloaded');
    });

    it('evicts unpinned packs, least recently used first, above the device budget', async () => {
      const { manager, db } = await setup({ budgetBytes: 800 });
      await manager.download();
      expect(await manager.applyRetention()).toBe(1);
      const ids = (await rowsOf(db)).map((row) => row.packId);
      expect(ids).not.toContain('pack:map-1');
      expect(ids).toEqual(expect.arrayContaining(['pack:cell-1', 'pack:cell-2', 'department-data', 'style:day']));
    });

    it('removes packs when the department turns offline maps off', async () => {
      const { manager, db, fileStore } = await setup();
      await manager.download();
      manager.updateConfig({ OfflineMapsAvailable: false });
      await manager.applyRetention();
      expect(await rowsOf(db)).toHaveLength(0);
      expect(keysUnder(fileStore, KEY_1)).toEqual([]);
    });
  });

  it('registers retention, wipe and the Storage & sync area with @resgrid/offline', async () => {
    const { manager, db, fileStore } = await setup();
    const reset = createResetRegistry();
    const retention = createRetentionRegistry();
    const areas = createStorageAreaRegistry();
    const dispose = registerOfflineMapPacks(manager, { reset, retention, areas });
    await manager.download();

    expect(retention.ruleFor(OFFLINE_MAP_PACKS_TABLE)).toMatchObject({ area: 'map-packs', prunableForBudget: false });
    expect(await findTablesWithoutRetention(db, retention)).toEqual([]);
    expect(retention.hooks().map((hook) => hook.id)).toEqual(['maps.offline-packs']);
    expect(reset.getWipeTables()).toEqual([OFFLINE_MAP_PACKS_TABLE]);
    expect(reset.getPreservedKeys('any')).toContain(OFFLINE_MAPS_WIFI_ONLY_KEY);
    const area = areas.list()[0];
    expect(area).toMatchObject({ id: 'maps.offline-packs', area: 'map-packs', clearWithCachedData: true });
    await expect(area.getSizeBytes?.()).resolves.toBe(manager.getState().installedBytes);

    await reset.getStoreResets().get('maps.offline-packs')?.('logout');
    expect(fileStore.files.size).toBe(0);
    expect(await rowsOf(db)).toHaveLength(0);

    dispose();
    expect(retention.ruleFor(OFFLINE_MAP_PACKS_TABLE)).toBeUndefined();
    expect(areas.list()).toHaveLength(0);
    expect(reset.getStoreResets().size).toBe(0);
  });
});
