import { isAllowedPackUrl, parseOfflineManifest, toManifestSnapshot } from '../manifest';
import { OFFLINE_PACK_BYTES_CEILING } from '../size-guard';
import { OfflineMapPackKind } from '../types';
import { bytesOf, packEntry, packUrl, sha } from './helpers';

const MB = 1024 * 1024;
const style = (name: string) => ({ Url: `https://api.resgrid.test/api/v4/Mapping/GetStyle/${name}?sig=1`, Version: '3' });

/** The plan §19.3 example, filled in. */
const planManifest = () => ({
  ManifestVersion: '2026-11-02T10:15:00Z#7f3a',
  Attribution: 'Protomaps © OpenStreetMap',
  Policy: { WifiOnly: true, RefreshHours: 24, StaleDays: 7, PreferLocalInAo: false, AmbientCacheMaxBytes: 268435456 },
  Styles: { Day: style('day'), Night: style('night'), Glyphs: { Url: 'https://api.resgrid.test/glyphs.zip?sig=1', Version: '2' } },
  Packs: [packEntry({ id: 'cell-1', body: bytesOf(100) }), packEntry({ id: 'map-4', kind: 3, body: bytesOf(50, 2), name: 'Station 4 pre-plan', layerId: 'layer-9' })],
  DepartmentData: { Url: 'https://api.resgrid.test/api/v4/Mapping/GetDepartmentData?sig=1', Version: 'd5', SizeBytes: 412345 },
  Sprite: {
    Version: 's1',
    Files: [
      { Name: 'sprite.json', Url: 'https://api.resgrid.test/sprite.json?sig=1' },
      { Name: 'sprite.png', Url: 'https://api.resgrid.test/sprite.png?sig=1' },
      { Name: '../evil.json', Url: 'https://api.resgrid.test/evil?sig=1' },
    ],
  },
  IndoorFloors: [
    {
      FloorId: 'f1',
      ImageUrl: 'https://api.resgrid.test/floor1.jpg?sig=1',
      Corners: [
        [-121.5, 38.5],
        [-121.4, 38.5],
        [-121.4, 38.4],
        [-121.5, 38.4],
      ],
      Version: '1',
    },
  ],
});

describe('parseOfflineManifest', () => {
  it('normalizes the plan manifest into downloadable assets', () => {
    const result = parseOfflineManifest(planManifest());
    if (!result.ok) throw new Error(result.code);
    const { manifest } = result;
    expect(manifest.version).toBe('2026-11-02T10:15:00Z#7f3a');
    expect(manifest.policy).toMatchObject({
      wifiOnly: true,
      refreshHours: 24,
      staleDays: 7,
      preferLocalInAo: false,
      ambientCacheMaxBytes: 268435456,
      maxPackBytes: OFFLINE_PACK_BYTES_CEILING,
      responseAreaMaxBytes: 500 * MB,
    });
    expect(manifest.assets.map((asset) => asset.assetId)).toEqual(['department-data', 'sprite:sprite.json', 'sprite:sprite.png', 'style:day', 'style:night', 'pack:cell-1', 'pack:map-4', 'floor:f1']);
    const basemap = manifest.assets.find((asset) => asset.assetId === 'pack:cell-1');
    expect(basemap).toMatchObject({
      kind: 'basemap',
      packKind: OfflineMapPackKind.Basemap,
      sha256: sha(bytesOf(100)),
      sizeBytes: 100,
      fileExtension: 'pmtiles',
      pinned: true,
      bounds: [-121.9, 38.4, -121.5, 38.8],
      maxZoom: 15,
    });
    expect(manifest.assets.find((asset) => asset.assetId === 'pack:map-4')).toMatchObject({ kind: 'custom-map', customMapLayerId: 'layer-9', pinned: false });
    expect(manifest.assets.find((asset) => asset.assetId === 'floor:f1')).toMatchObject({ kind: 'indoor-floor', fileExtension: 'jpg', floorId: 'f1' });
    expect(manifest.invalidEntries).toBe(1); // the sprite file with an unsafe name
  });

  it('tolerates a minimal manifest from an early server phase', () => {
    const result = parseOfflineManifest({ ManifestVersion: 7 });
    expect(result).toEqual({ ok: true, manifest: expect.objectContaining({ version: '7', assets: [], pending: [], rejected: [], attribution: 'Protomaps © OpenStreetMap' }) });
  });

  it('unwraps the v4 envelope and treats not_found (HTTP 200) as no manifest', () => {
    expect(parseOfflineManifest({ Data: { ManifestVersion: 'a' }, Status: 'success' })).toMatchObject({ ok: true, manifest: { version: 'a' } });
    expect(parseOfflineManifest({ Data: null, Status: 'not_found' })).toEqual({ ok: false, code: 'manifest-not-found' });
  });

  it('rejects documents without a manifest version', () => {
    expect(parseOfflineManifest({ Packs: [] })).toEqual({ ok: false, code: 'manifest-invalid' });
    expect(parseOfflineManifest('nope')).toEqual({ ok: false, code: 'manifest-invalid' });
  });

  it('drops malformed packs, keeps building ones pending and refuses unverifiable or unsafe files', () => {
    const result = parseOfflineManifest({
      ManifestVersion: 'v',
      Packs: [
        { Kind: 0 },
        packEntry({ id: 'building', body: bytesOf(1), status: 1, url: null }),
        packEntry({ id: 'failed', body: bytesOf(1), status: 3 }),
        packEntry({ id: 'nohash', body: bytesOf(1), sha256: null }),
        packEntry({ id: 'http', body: bytesOf(1), url: 'http://api.resgrid.test/pack' }),
        packEntry({ id: 'provider', body: bytesOf(1), url: 'https://build.protomaps.com/20261101.pmtiles' }),
        packEntry({ id: 'kind9', kind: 9, body: bytesOf(1) }),
        packEntry({ id: 'ok', body: bytesOf(3) }),
      ],
    });
    if (!result.ok) throw new Error(result.code);
    expect(result.manifest.invalidEntries).toBe(1);
    expect(result.manifest.pending).toEqual([expect.objectContaining({ assetId: 'pack:building', state: 'building' }), expect.objectContaining({ assetId: 'pack:failed', state: 'failed' })]);
    expect(result.manifest.rejected.map((entry) => [entry.assetId, entry.code])).toEqual([
      ['pack:nohash', 'missing-hash'],
      ['pack:http', 'unsafe-url'],
      ['pack:provider', 'unsafe-url'],
      ['pack:kind9', 'unsupported-kind'],
    ]);
    expect(result.manifest.assets.map((asset) => asset.assetId)).toEqual(['pack:ok']);
  });

  it('clamps server limits to the client ceiling', () => {
    const result = parseOfflineManifest({ ManifestVersion: 'v', Policy: { MaxPackBytes: 5 * 1024 * MB, ResponseAreaMaxBytes: 4 * 1024 * MB, RefreshHours: -1 } });
    if (!result.ok) throw new Error(result.code);
    expect(result.manifest.policy.maxPackBytes).toBe(OFFLINE_PACK_BYTES_CEILING);
    expect(result.manifest.policy.responseAreaMaxBytes).toBe(OFFLINE_PACK_BYTES_CEILING);
    expect(result.manifest.policy.refreshHours).toBe(24);
  });

  it('persists snapshots without signed URLs', () => {
    const result = parseOfflineManifest(planManifest());
    if (!result.ok) throw new Error(result.code);
    const text = JSON.stringify(toManifestSnapshot(result.manifest, 1));
    expect(text).not.toContain('sig=');
    expect(text).not.toContain('https://');
  });

  it('allows only https pack URLs that are not public tile providers', () => {
    expect(isAllowedPackUrl(packUrl('a'))).toBe(true);
    expect(isAllowedPackUrl('https://tiles.mapbox.com/x')).toBe(false);
    expect(isAllowedPackUrl('http://localhost:5000/pack', true)).toBe(true);
    expect(isAllowedPackUrl('http://localhost:5000/pack', false)).toBe(false);
    expect(isAllowedPackUrl(null)).toBe(false);
  });
});
