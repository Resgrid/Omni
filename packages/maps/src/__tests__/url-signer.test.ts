import type { SignedMapResourceUrl } from '@resgrid/models';

import { CONFIG_SIGNATURE_REFRESH_MARGIN_MS, createMapUrlSigner, isSignedMapUrl, mapConfigRefreshAt, refreshTimeFor, signatureExpiry, stripSignature } from '../provider/url-signer';

const API = 'https://api.example.org/api/v4';
const TILE = `${API}/Mapping/GetCustomMapMercatorTile/L1/{z}/{x}/{y}`;
const IMAGE = `${API}/Mapping/GetCustomMapLayerImage/L2`;
const FLOOR = `${API}/Mapping/GetIndoorMapFloorImage/F1`;
const HOUR = 60 * 60 * 1000;

/** Core's signature: `?d=7&e=<unix seconds>&sig=…` appended to the URL (MapResourceUrls.Sign). */
const signedAt = (url: string, expiresMs: number, sig = 'abc'): string => `${url}${url.includes('?') ? '&' : '?'}d=7&e=${Math.floor(expiresMs / 1000)}&sig=${sig}`;

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('signed URL helpers', () => {
  it('reads the expiry, recognises signed URLs and strips the signature without touching {z}/{x}/{y}', () => {
    const signed = signedAt(`${TILE}?style=day`, 1_900_000_000_000);
    expect(signatureExpiry(signed)).toBe(1_900_000_000_000);
    expect(signatureExpiry(TILE)).toBeNull();
    expect(isSignedMapUrl(signed)).toBe(true);
    expect(isSignedMapUrl(`${TILE}?sig=only`)).toBe(false);
    expect(stripSignature(signed)).toBe(`${TILE}?style=day`);
    expect(stripSignature(signedAt(TILE, 1_900_000_000_000))).toBe(TILE);
  });

  it('times the department config refresh before its first signed map URL expires', () => {
    const now = 1_000_000_000_000;
    const config = {
      MapLibreStyleUrlDay: signedAt(`${API}/Mapping/GetStyle?night=false`, now + 24 * HOUR),
      MapLibreStyleUrlNight: signedAt(`${API}/Mapping/GetStyle?night=true`, now + 23 * HOUR),
      StaticMapUrlTemplate: signedAt(`${API}/Mapping/GetStaticMap?lat={lat}&lon={lon}`, now + 24 * HOUR),
      OfflineManifestUrl: null,
      MapUrl: 'https://tiles.example.org/{z}/{x}/{y}.png',
      TrafficRefreshSeconds: 300,
    };
    expect(mapConfigRefreshAt(config)).toBe(now + 23 * HOUR - CONFIG_SIGNATURE_REFRESH_MARGIN_MS);
    // Already expired: due (in the past).
    expect(mapConfigRefreshAt({ OfflineManifestUrl: signedAt(`${API}/Mapping/GetOfflineManifest`, now - 60_000) })).toBe(now - 60_000 - CONFIG_SIGNATURE_REFRESH_MARGIN_MS);
    // Nothing signed (older servers), or no config.
    expect(mapConfigRefreshAt({ MapUrl: config.MapUrl })).toBeNull();
    expect(mapConfigRefreshAt(null)).toBeNull();
  });

  it('renews after 80% of the remaining lifetime, at least a minute before expiry', () => {
    const now = 1_000_000_000_000;
    expect(refreshTimeFor(signedAt(IMAGE, now + 24 * HOUR), now)).toBe(now + 0.8 * 24 * HOUR);
    expect(refreshTimeFor(signedAt(IMAGE, now + 2 * 60 * 1000), now)).toBe(now + 60 * 1000);
    // No readable expiry: Core's minimum lifetime (1 h).
    expect(refreshTimeFor(IMAGE, now)).toBe(now + 0.8 * HOUR);
  });
});

describe('createMapUrlSigner', () => {
  let now = 1_000_000_000_000;
  const clock = () => now;
  const echo = (expires: number) => jest.fn(async (urls: string[]): Promise<SignedMapResourceUrl[]> => urls.map((url) => ({ Url: url, SignedUrl: url.includes('L2') ? null : signedAt(url, expires) })));

  beforeEach(() => {
    now = 1_000_000_000_000;
  });

  it('signs every URL asked for in one tick with one request and caches them until shortly before expiry', async () => {
    const batch = echo(now + 24 * HOUR);
    const signer = createMapUrlSigner(batch, { now: clock });
    const [tile, floor, again] = await Promise.all([signer.sign(TILE), signer.sign(FLOOR), signer.sign(TILE)]);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toEqual([TILE, FLOOR]);
    expect(tile.url).toBe(signedAt(TILE, now + 24 * HOUR));
    expect(again).toEqual(tile);
    expect(floor.url).toBe(signedAt(FLOOR, now + 24 * HOUR));
    expect(signer.peek(TILE)?.url).toBe(tile.url);

    // Fresh: no new request. Past the renewal time: signed again.
    await signer.sign(TILE);
    expect(batch).toHaveBeenCalledTimes(1);
    now += 20 * HOUR;
    expect(signer.peek(TILE)).toBeNull();
    await signer.sign(TILE);
    expect(batch).toHaveBeenCalledTimes(2);
  });

  it('resolves null (never the unsigned URL) when the server refuses, fails, or answers for another origin', async () => {
    const refused = createMapUrlSigner(echo(now + HOUR), { now: clock, refusedRetryMs: 1000 });
    expect((await refused.sign(IMAGE)).url).toBeNull();

    const onError = jest.fn();
    const failing = jest.fn(async (): Promise<SignedMapResourceUrl[]> => {
      throw new Error('offline');
    });
    const offline = createMapUrlSigner(failing, { now: clock, failureRetryMs: 30_000, onError });
    const entry = await offline.sign(TILE);
    expect(entry).toEqual({ url: null, refreshAt: now + 30_000 });
    expect(onError).toHaveBeenCalledTimes(1);
    // Remembered until the retry time, then tried again.
    await offline.sign(TILE);
    expect(failing).toHaveBeenCalledTimes(1);
    now += 30_001;
    await offline.sign(TILE);
    expect(failing).toHaveBeenCalledTimes(2);

    const foreign = createMapUrlSigner(async (urls) => urls.map((url) => ({ Url: url, SignedUrl: `https://evil.example.com/x?e=1900000000&sig=1` })), { now: clock });
    expect((await foreign.sign(TILE)).url).toBeNull();

    const missing = createMapUrlSigner(async () => [], { now: clock });
    expect((await missing.sign(TILE)).url).toBeNull();
  });

  it('uses a server-signed URL while it is fresh and re-signs the bare URL once it is stale', async () => {
    const batch = echo(now + 48 * HOUR);
    const signer = createMapUrlSigner(batch, { now: clock });
    const fromLayer = signedAt(TILE, now + 10 * HOUR, 'server');
    expect((await signer.sign(fromLayer)).url).toBe(fromLayer);
    expect(batch).not.toHaveBeenCalled();
    now += 9.5 * HOUR;
    const renewed = await signer.sign(fromLayer);
    expect(batch.mock.calls[0][0]).toEqual([TILE]);
    expect(renewed.url).toBe(signedAt(TILE, now + 38.5 * HOUR));
    expect(signer.peek(fromLayer)?.url).toBe(renewed.url);
  });

  it('splits more than 200 URLs into several requests and works without an API context', async () => {
    const batch = echo(now + HOUR);
    const signer = createMapUrlSigner(batch, { now: clock });
    const urls = Array.from({ length: 205 }, (_, index) => `${API}/Mapping/GetIndoorMapFloorImage/F${index}`);
    const results = await Promise.all(urls.map((url) => signer.sign(url)));
    expect(batch).toHaveBeenCalledTimes(2);
    expect(batch.mock.calls.map((call) => call[0].length)).toEqual([200, 5]);
    expect(results.every((result) => result.url !== null)).toBe(true);

    const noContext = createMapUrlSigner(null, { now: clock });
    expect((await noContext.sign(TILE)).url).toBeNull();
    const preSigned = signedAt(TILE, now + 10 * HOUR);
    expect((await noContext.sign(preSigned)).url).toBe(preSigned);
    expect((await noContext.sign('  ')).url).toBeNull();
  });

  it('forgets every signature on clear (department or server switch), including a request still in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const batch = jest.fn(async (urls: string[]) => {
      await gate;
      return urls.map((url) => ({ Url: url, SignedUrl: signedAt(url, now + HOUR) }));
    });
    const signer = createMapUrlSigner(batch, { now: clock });
    const pending = signer.sign(TILE);
    await flush();
    signer.clear();
    release();
    expect((await pending).url).not.toBeNull();
    expect(signer.peek(TILE)).toBeNull();
  });
});
