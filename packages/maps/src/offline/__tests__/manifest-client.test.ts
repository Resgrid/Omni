import { parseOfflineManifest } from '../manifest';
import { fetchOfflineManifest, resolveOfflineMapsAvailability } from '../manifest-client';
import { evaluateManifestSizes, wouldExhaustStorage } from '../size-guard';
import { API_BASE, bytesOf, createFakeServer, MANIFEST_URL, packEntry } from './helpers';

const MB = 1024 * 1024;
const config = { OfflineMapsAvailable: true, OfflineManifestUrl: MANIFEST_URL };

describe('resolveOfflineMapsAvailability', () => {
  it('needs OfflineMapsAvailable === true, a manifest URL and a supported platform', () => {
    expect(resolveOfflineMapsAvailability(config, true)).toBe('available');
    expect(resolveOfflineMapsAvailability(config, false)).toBe('unsupported');
    expect(resolveOfflineMapsAvailability({ OfflineMapsAvailable: false, OfflineManifestUrl: MANIFEST_URL }, true)).toBe('disabled');
    expect(resolveOfflineMapsAvailability({ OfflineManifestUrl: MANIFEST_URL }, true)).toBe('disabled');
    expect(resolveOfflineMapsAvailability({ OfflineMapsAvailable: true, OfflineManifestUrl: '  ' }, true)).toBe('disabled');
    expect(resolveOfflineMapsAvailability(null, true)).toBe('disabled');
  });
});

describe('fetchOfflineManifest', () => {
  it('fetches the signed manifest from the Resgrid server', async () => {
    const server = createFakeServer();
    server.serveJson(MANIFEST_URL, { ManifestVersion: 'v1', Packs: [packEntry({ id: 'a', body: bytesOf(10) })] });
    const result = await fetchOfflineManifest({ config, apiBaseUrl: API_BASE, fetchImpl: server.fetchImpl });
    expect(result).toMatchObject({ ok: true, manifest: { version: 'v1', assets: [expect.objectContaining({ assetId: 'pack:a' })] } });
    expect(server.requests).toEqual([{ url: MANIFEST_URL, range: null }]);
  });

  it('stays off when the department does not offer offline maps', async () => {
    const server = createFakeServer();
    await expect(fetchOfflineManifest({ config: { OfflineMapsAvailable: false, OfflineManifestUrl: MANIFEST_URL }, apiBaseUrl: API_BASE, fetchImpl: server.fetchImpl })).resolves.toEqual({ ok: false, code: 'disabled' });
    await expect(fetchOfflineManifest({ config: { OfflineMapsAvailable: true }, apiBaseUrl: API_BASE, fetchImpl: server.fetchImpl })).resolves.toEqual({ ok: false, code: 'manifest-url-missing' });
    expect(server.requests).toHaveLength(0);
  });

  it('never fetches a manifest outside the Resgrid API origin or over http', async () => {
    const server = createFakeServer();
    const untrusted = ['https://evil.example.com/Mapping/GetOfflineManifest', 'http://api.resgrid.test/api/v4/Mapping/GetOfflineManifest', 'https://build.protomaps.com/manifest.json'];
    for (const url of untrusted) {
      await expect(fetchOfflineManifest({ config: { OfflineMapsAvailable: true, OfflineManifestUrl: url }, apiBaseUrl: API_BASE, fetchImpl: server.fetchImpl })).resolves.toEqual({
        ok: false,
        code: 'manifest-url-untrusted',
      });
    }
    await expect(fetchOfflineManifest({ config, apiBaseUrl: '', fetchImpl: server.fetchImpl })).resolves.toEqual({ ok: false, code: 'manifest-url-untrusted' });
    expect(server.requests).toHaveLength(0);
  });

  it('maps transport failures to codes', async () => {
    const server = createFakeServer();
    server.files.set(MANIFEST_URL, { status: 403 });
    await expect(fetchOfflineManifest({ config, apiBaseUrl: API_BASE, fetchImpl: server.fetchImpl })).resolves.toEqual({ ok: false, code: 'manifest-url-expired', httpStatus: 403 });
    server.files.set(MANIFEST_URL, { status: 500 });
    await expect(fetchOfflineManifest({ config, apiBaseUrl: API_BASE, fetchImpl: server.fetchImpl })).resolves.toEqual({ ok: false, code: 'manifest-http-error', httpStatus: 500 });
    server.files.set(MANIFEST_URL, { body: new Uint8Array(0) });
    await expect(fetchOfflineManifest({ config, apiBaseUrl: API_BASE, fetchImpl: server.fetchImpl })).resolves.toEqual({ ok: false, code: 'manifest-invalid' });
    server.files.delete(MANIFEST_URL);
    await expect(fetchOfflineManifest({ config, apiBaseUrl: API_BASE, fetchImpl: server.fetchImpl })).resolves.toEqual({ ok: false, code: 'manifest-not-found', httpStatus: 404 });
    const failing = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(fetchOfflineManifest({ config, apiBaseUrl: API_BASE, fetchImpl: failing })).resolves.toEqual({ ok: false, code: 'manifest-network-error' });
  });
});

describe('size guard', () => {
  const manifestWith = (packs: ReturnType<typeof packEntry>[], policy: Record<string, number> = {}) => {
    const result = parseOfflineManifest({ ManifestVersion: 'v', Policy: policy, Packs: packs });
    if (!result.ok) throw new Error(result.code);
    return result.manifest;
  };

  it('refuses a pack above the manifest maximum', () => {
    const evaluation = evaluateManifestSizes(manifestWith([packEntry({ id: 'small', body: bytesOf(10) }), packEntry({ id: 'big', body: bytesOf(10), sizeBytes: 20 * MB })], { MaxPackBytes: 10 * MB }));
    expect(evaluation.allowed.map((asset) => asset.assetId)).toEqual(['pack:small']);
    expect(evaluation.rejected).toEqual([{ assetId: 'pack:big', code: 'pack-too-large' }]);
  });

  it('refuses every base pack when the response area exceeds its limit, keeping other items', () => {
    const evaluation = evaluateManifestSizes(
      manifestWith([
        packEntry({ id: 'c1', body: bytesOf(1), sizeBytes: 300 * MB }),
        packEntry({ id: 'c2', body: bytesOf(1), sizeBytes: 300 * MB }),
        packEntry({ id: 'custom', kind: 3, body: bytesOf(1), sizeBytes: 10 * MB }),
      ])
    );
    expect(evaluation.responseAreaExceeded).toBe(true);
    expect(evaluation.responseAreaBytes).toBe(600 * MB);
    expect(evaluation.allowed.map((asset) => asset.assetId)).toEqual(['pack:custom']);
    expect(evaluation.rejected.map((entry) => entry.code)).toEqual(['response-area-too-large', 'response-area-too-large']);
  });

  it('warns before leaving less than 10 % of the device free', () => {
    expect(wouldExhaustStorage(50, { freeBytes: 100, totalBytes: 1000 })).toBe(true);
    expect(wouldExhaustStorage(50, { freeBytes: 500, totalBytes: 1000 })).toBe(false);
    expect(wouldExhaustStorage(50, null)).toBe(false);
  });
});
