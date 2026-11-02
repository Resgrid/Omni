// The pack manager's P8b behaviour: glyph archives, the DepartmentData bundle, per-device incident/corridor packs,
// automatic sync under the department's policy, the hydration step and the pending-pack recheck.
import { createMemoryDb, type DurableDb } from '@resgrid/offline';
import { gzipSync, strToU8, zipSync } from 'fflate';

import { createMemoryPackFileStore } from '../file-store';
import { createOfflineMapsHydrationStep, OfflineMapsHydrationError } from '../hydration';
import { createMemoryOfflineMapsKv, createOfflinePackManager, isDeferredOfflineMapsResult, OFFLINE_PENDING_RECHECK_MS, type OfflinePackManagerOptions } from '../manager';
import type { OfflineNetworkState } from '../network';
import { createOfflineMapOptions } from '../offline-options';
import type { OfflinePackFocus } from '../pack-selection';
import { OFFLINE_MAP_PACKS_TABLE, offlinePackScopeKey } from '../registry';
import type { OfflinePackScope, PackBounds } from '../types';
import { API_BASE, bytesOf, createFakeServer, MANIFEST_URL, packEntry, packUrl, sha } from './helpers';

const GB = 1024 * 1024 * 1024;
const SCOPE: OfflinePackScope = { serverUrl: 'https://api.resgrid.test/api/v4', departmentId: '12', userId: 'user-1' };
const KEY = offlinePackScopeKey(SCOPE);
const START = Date.UTC(2026, 10, 1, 8, 0, 0);

// Core's routes (MappingController): styles and glyphs through GetOfflineAsset, the bundle through GetOfflineDepartmentData.
const STYLE_URL = 'https://api.resgrid.test/api/v4/Mapping/GetOfflineAsset/day.json?d=12&e=1&sig=a';
const GLYPHS_URL = 'https://api.resgrid.test/api/v4/Mapping/GetOfflineAsset/glyphs.zip?d=12&e=1&sig=b';
const DEPT_URL = 'https://api.resgrid.test/api/v4/Mapping/GetOfflineDepartmentData?d=12&e=1&sig=c';

const STYLE = strToU8(
  JSON.stringify({
    version: 8,
    glyphs: '{glyphs}/{fontstack}/{range}.pbf',
    sources: { protomaps: { type: 'vector', url: '{basemap}' } },
    layers: [
      { id: 'water', type: 'fill', source: 'protomaps', 'source-layer': 'water' },
      { id: 'places', type: 'symbol', source: 'protomaps', 'source-layer': 'places', layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'] } },
    ],
  })
);
const GLYPH_0 = bytesOf(200, 11);
const GLYPHS = zipSync({ 'fonts/Noto Sans Regular/0-255.pbf': GLYPH_0, 'fonts/Noto Sans Regular/256-511.pbf': bytesOf(100, 12), 'fonts/OFL.txt': strToU8('licence') });
const BUNDLE = {
  layers: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-121.5, 38.5] }, properties: { layerId: 'l1', layerName: 'Hydrants' } }] },
  stations: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-121.4, 38.6] }, properties: { groupId: 3, name: 'Station 3', kind: 'station' } }] },
};
const DEPT = gzipSync(strToU8(JSON.stringify(BUNDLE)));

const AREA = bytesOf(300, 1);
const NEAR = bytesOf(220, 2);
const FAR = bytesOf(210, 3);
const CORRIDOR = bytesOf(230, 4);
// z10 cells (≈ 0.35°): one inside the response area, one next to a call, one far away, one on the route.
const NEAR_CELL: PackBounds = [-121.2890625, 38.272688535980954, -120.9375, 38.54816542304657];
const FAR_CELL: PackBounds = [-118.125, 34.016241889667015, -117.7734375, 34.30714385628804];
const ROUTE_CELL: PackBounds = [-120.9375, 38.272688535980954, -120.5859375, 38.54816542304657];

const pack = (id: string, kind: number, body: Uint8Array, bounds: PackBounds, extra: Record<string, unknown> = {}) => ({ ...packEntry({ id, kind, body, name: `Cell ${id}` }), Bounds: bounds, ...extra });

/** Core's manifest, in the v4 envelope it sends. */
const coreManifest = (overrides: Record<string, unknown> = {}, packs?: unknown[]) => ({
  Data: {
    ManifestVersion: 'v1#abc',
    Attribution: 'Protomaps © OpenStreetMap',
    Policy: { WifiOnly: true, ManualOnly: false, RefreshHours: 24, StaleDays: 7, PreferLocalInAo: false, AmbientCacheMaxBytes: 268435456, MaxPackBytes: 2147483648, ResponseAreaMaxBytes: 524288000 },
    Styles: { Day: { Url: STYLE_URL, Version: '1', Sha256: sha(STYLE), SizeBytes: STYLE.length }, Night: null, Glyphs: { Url: GLYPHS_URL, Version: '1', Sha256: sha(GLYPHS), SizeBytes: GLYPHS.length } },
    DepartmentData: { Url: DEPT_URL, Version: 'd1', Sha256: sha(DEPT), SizeBytes: DEPT.length },
    Packs: packs ?? [
      pack('area', 0, AREA, [-121.9, 38.4, -121.5, 38.8]),
      pack('near', 1, NEAR, NEAR_CELL, { Name: 'Call 26-14' }),
      pack('far', 1, FAR, FAR_CELL, { Name: 'Call 26-15' }),
      pack('route', 2, CORRIDOR, ROUTE_CELL, { Name: 'Route North' }),
    ],
    Sprite: null,
    IndoorFloors: [],
    ...overrides,
  },
  Status: 'success',
});

async function setup(options: Partial<OfflinePackManagerOptions> = {}) {
  const db: DurableDb = await createMemoryDb();
  const server = createFakeServer();
  server.serveJson(MANIFEST_URL, coreManifest());
  server.serveFile(STYLE_URL, STYLE);
  server.serveFile(GLYPHS_URL, GLYPHS);
  server.serveFile(DEPT_URL, DEPT);
  server.serveFile(packUrl('area'), AREA);
  server.serveFile(packUrl('near'), NEAR);
  server.serveFile(packUrl('far'), FAR);
  server.serveFile(packUrl('route'), CORRIDOR);
  const fileStore = createMemoryPackFileStore({ disk: { freeBytes: 32 * GB, totalBytes: 64 * GB } });
  let now = START;
  let network: OfflineNetworkState = { isConnected: true, isUnmetered: true, isExpensive: false };
  const timers: { callback: () => void; ms: number }[] = [];
  const manager = createOfflinePackManager({
    db,
    fileStore,
    getScope: () => SCOPE,
    getApiBaseUrl: () => API_BASE,
    fetchImpl: server.fetchImpl,
    network: { getState: async () => network },
    kv: createMemoryOfflineMapsKv(),
    chunkBytes: 4096,
    platformSupported: true,
    progressIntervalMs: 0,
    now: () => now,
    setTimer: (callback, ms) => timers.push({ callback, ms }),
    clearTimer: () => {
      timers.length = 0;
    },
    ...options,
  });
  await manager.init();
  manager.updateConfig({ OfflineMapsAvailable: true, OfflineManifestUrl: MANIFEST_URL });
  return {
    db,
    server,
    fileStore,
    manager,
    timers,
    advance: (ms: number) => {
      now += ms;
    },
    setNetwork: (next: OfflineNetworkState) => {
      network = next;
    },
  };
}

const rowIds = async (db: DurableDb): Promise<string[]> => (await db.select(OFFLINE_MAP_PACKS_TABLE)).map((row) => String(row.packId)).sort();
const packRequests = (server: ReturnType<typeof createFakeServer>) => server.requests.filter((request) => request.url !== MANIFEST_URL);

describe('glyphs and department data', () => {
  it('extracts the glyph archive into a local directory and keeps the labels in the composed style', async () => {
    const { manager, db, fileStore } = await setup();
    await expect(manager.download()).resolves.toEqual({ ok: true });
    expect(await rowIds(db)).toEqual(['department-data', 'pack:area', 'pack:far', 'pack:near', 'pack:route', 'style:day', 'style:glyphs']);

    const glyphFiles = [...fileStore.files.keys()].filter((key) => key.includes('/glyphs-')).sort();
    expect(glyphFiles).toHaveLength(2);
    expect(glyphFiles[0]).toMatch(new RegExp(`^${KEY}/files/glyphs-[0-9a-f]+/Noto Sans Regular/0-255\\.pbf$`));
    expect(fileStore.files.get(glyphFiles[0])).toEqual(GLYPH_0);
    expect([...fileStore.files.keys()].filter((key) => key.startsWith(`${KEY}/tmp`))).toEqual([]);
    expect([...fileStore.files.keys()].some((key) => key.endsWith('.zip'))).toBe(false);

    const installed = manager.getInstalledSet();
    expect(installed?.glyphsPath).toMatch(/^file:\/\/\/memory\/offline-maps\/.+\/files\/glyphs-[0-9a-f]+$/);
    expect(installed?.departmentData).toEqual(BUNDLE);
    expect(manager.getState().packs.find((entry) => entry.packId === 'style:glyphs')).toMatchObject({ kind: 'glyphs', state: 'installed' });

    const style = createOfflineMapOptions({ installed, isOnline: false })?.getStyle('light') as unknown as { glyphs: string; layers: { id: string }[]; sources: Record<string, { type: string }> };
    expect(style.glyphs).toBe(`${installed?.glyphsPath}/{fontstack}/{range}.pbf`);
    expect(style.layers.map((layer) => layer.id)).toEqual(expect.arrayContaining(['places::0', 'water::0']));
    expect(style.sources['offline-dept-layers']).toMatchObject({ type: 'geojson' });
    expect(style.sources['offline-dept-stations']).toMatchObject({ type: 'geojson' });

    // Retention keeps the extracted directory; a stale staging folder goes.
    await fileStore.append(`${KEY}/tmp/glyphs-old/X/0-255.pbf`, bytesOf(5));
    expect(await manager.applyRetention()).toBe(1);
    expect([...fileStore.files.keys()].filter((key) => key.includes('/files/glyphs-'))).toHaveLength(2);
    expect(await rowIds(db)).toContain('style:glyphs');
  });

  it('reports an archive without glyphs, installs the rest and leaves no staging files', async () => {
    const empty = zipSync({ 'fonts/OFL.txt': strToU8('licence only') });
    const { manager, server, db, fileStore } = await setup();
    server.serveJson(MANIFEST_URL, coreManifest({ Styles: { Day: null, Night: null, Glyphs: { Url: GLYPHS_URL, Version: '2', Sha256: sha(empty), SizeBytes: empty.length } } }));
    server.serveFile(GLYPHS_URL, empty);
    await expect(manager.download()).resolves.toEqual({ ok: false, code: 'archive-invalid' });
    expect(await rowIds(db)).not.toContain('style:glyphs');
    expect(await rowIds(db)).toContain('pack:area');
    expect([...fileStore.files.keys()].filter((key) => key.startsWith(`${KEY}/tmp`))).toEqual([]);
    // Without glyphs the composed style drops its text layers instead of failing.
    const style = createOfflineMapOptions({ installed: manager.getInstalledSet(), isOnline: false })?.getStyle('light') as unknown as { layers: { id: string }[] };
    expect(style.layers.map((layer) => layer.id)).not.toContain('places');
  });
});

describe('incident and corridor packs per device (§19.7)', () => {
  it('keeps the cells near the active call and along the route, and drops them when the focus changes', async () => {
    let current: OfflinePackFocus = {
      incidentPoints: [[-121.1, 38.4]],
      corridorLines: [
        [
          [-121.0, 38.4],
          [-120.7, 38.45],
        ],
      ],
    };
    const selected = await setup({ packSelection: { policy: { incidents: true, corridors: true }, getFocus: () => current } });

    await expect(selected.manager.autoSync()).resolves.toEqual({ ok: true });
    expect(await rowIds(selected.db)).toEqual(['department-data', 'pack:area', 'pack:near', 'pack:route', 'style:day', 'style:glyphs']);
    expect(selected.manager.getState().packs.map((entry) => entry.packId)).not.toContain('pack:far');
    expect(selected.manager.getState().updateAvailable).toBe(false);

    // The call closed and the route ended: both go on the next sync (no new download).
    current = { incidentPoints: [], corridorLines: [] };
    selected.advance(5 * 60 * 1000);
    await expect(selected.manager.refreshSelection()).resolves.toEqual({ ok: true });
    expect(await rowIds(selected.db)).toEqual(['department-data', 'pack:area', 'style:day', 'style:glyphs']);
  });

  it('downloads no extra packs where the policy has none (Dispatch, BigBoard) and drops a call the manifest no longer lists', async () => {
    const none = await setup({ packSelection: { policy: { incidents: false, corridors: false }, getFocus: () => ({ incidentPoints: [[-121.1, 38.4]], corridorLines: [] }) } });
    await none.manager.autoSync();
    expect(await rowIds(none.db)).toEqual(['department-data', 'pack:area', 'style:day', 'style:glyphs']);

    const unit = await setup({ packSelection: { policy: { incidents: true, corridors: false }, getFocus: () => ({ incidentPoints: [[-121.1, 38.4]], corridorLines: [] }) } });
    await unit.manager.autoSync();
    expect(await rowIds(unit.db)).toContain('pack:near');
    unit.server.serveJson(MANIFEST_URL, coreManifest({ ManifestVersion: 'v1#def' }, [pack('area', 0, AREA, [-121.9, 38.4, -121.5, 38.8])]));
    unit.advance(25 * 60 * 60 * 1000);
    await unit.manager.autoSync();
    expect(await rowIds(unit.db)).not.toContain('pack:near');
  });
});

describe('automatic sync and hydration', () => {
  it('downloads automatically unless the policy is manual, and not again after the member deleted the maps', async () => {
    const manual = await setup();
    manual.server.serveJson(MANIFEST_URL, coreManifest({ Policy: { WifiOnly: false, ManualOnly: true } }));
    await expect(manual.manager.autoSync()).resolves.toEqual({ ok: true });
    expect(packRequests(manual.server)).toHaveLength(0);
    expect(manual.manager.getState()).toMatchObject({ isInstalled: false, updateAvailable: true });
    await expect(manual.manager.isHydrationCurrent()).resolves.toBe(true);

    const { manager, db, server } = await setup();
    await expect(manager.isHydrationCurrent()).resolves.toBe(false);
    await expect(manager.autoSync()).resolves.toEqual({ ok: true });
    await expect(manager.isHydrationCurrent()).resolves.toBe(true);

    await manager.deleteAll();
    server.requests.length = 0;
    await expect(manager.autoSync()).resolves.toEqual({ ok: true });
    expect(packRequests(server)).toHaveLength(0);
    await expect(manager.isHydrationCurrent()).resolves.toBe(true);

    // An explicit download resumes automatic downloads for this account.
    await manager.download();
    expect(await rowIds(db)).toContain('pack:area');
  });

  it('waits for Wi-Fi without failing the step and is not field ready meanwhile', async () => {
    const { manager, setNetwork } = await setup();
    setNetwork({ isConnected: true, isUnmetered: false, isExpensive: true });
    const result = await manager.autoSync();
    expect(result).toEqual({ ok: false, code: 'waiting-for-wifi' });
    expect(isDeferredOfflineMapsResult(result)).toBe(true);
    await expect(manager.isHydrationCurrent()).resolves.toBe(false);

    const step = createOfflineMapsHydrationStep(manager);
    await expect(step.run({ reportProgress: jest.fn(), isCancelled: () => false })).resolves.toBeUndefined();
    setNetwork({ isConnected: true, isUnmetered: true, isExpensive: false });
    const progress: number[] = [];
    await step.run({ reportProgress: (fraction) => progress.push(fraction), isCancelled: () => false });
    expect(progress.length).toBeGreaterThan(1);
    expect(progress[progress.length - 1]).toBe(1);
    await expect(step.isCurrent()).resolves.toBe(true);
    expect(step).toMatchObject({ id: 'maps.offline-packs', required: true });
  });

  it('fails the hydration step on a real failure, with the code as the error name', async () => {
    const { manager, server } = await setup();
    server.serveFile(packUrl('area'), bytesOf(AREA.length, 77));
    const step = createOfflineMapsHydrationStep(manager);
    await expect(step.run({ reportProgress: jest.fn(), isCancelled: () => false })).rejects.toEqual(expect.objectContaining({ name: 'integrity-failed' }));
    await expect(step.run({ reportProgress: jest.fn(), isCancelled: () => false })).rejects.toBeInstanceOf(OfflineMapsHydrationError);
  });

  it('refetches only when stale, sooner while wanted packs build, and rechecks on a timer until they are ready', async () => {
    const focus: OfflinePackFocus = { incidentPoints: [[-121.1, 38.4]], corridorLines: [] };
    const building = [pack('area', 0, AREA, [-121.9, 38.4, -121.5, 38.8]), { ...pack('near', 1, NEAR, NEAR_CELL), Status: 1, DownloadUrl: null, Sha256: null, SizeBytes: null }];
    const { manager, server, db, timers, advance } = await setup({ packSelection: { policy: { incidents: true, corridors: false }, getFocus: () => focus } });
    server.serveJson(MANIFEST_URL, coreManifest({}, building));
    await manager.autoSync();
    expect(await rowIds(db)).not.toContain('pack:near');
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(OFFLINE_PENDING_RECHECK_MS);

    // Fresh manifest: no refetch.
    const manifestCalls = () => server.requestsFor(MANIFEST_URL).length;
    const before = manifestCalls();
    await manager.refreshIfStale();
    expect(manifestCalls()).toBe(before);

    // The pack was built: the timer's recheck refetches and downloads it.
    server.serveJson(MANIFEST_URL, coreManifest({}, [pack('area', 0, AREA, [-121.9, 38.4, -121.5, 38.8]), pack('near', 1, NEAR, NEAR_CELL)]));
    advance(OFFLINE_PENDING_RECHECK_MS);
    const recheck = timers.shift();
    recheck?.callback();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await manager.autoSync();
    expect(await rowIds(db)).toContain('pack:near');
    expect(timers).toHaveLength(0);
  });
});
