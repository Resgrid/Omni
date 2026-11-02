import type { BackgroundTransfer, BackgroundTransferRequest, BackgroundTransferResult } from '../background-transfer';
import { downloadAsset } from '../downloader';
import { createMemoryPackFileStore } from '../file-store';
import { bytesOf, createFakeServer, packUrl, sha } from './helpers';

const URL_A = packUrl('a');
const PART = 'scope/tmp/a.part';
const immediate = async (): Promise<void> => undefined;

const setup = (body: Uint8Array, options: Parameters<ReturnType<typeof createFakeServer>['serveFile']>[2] = {}) => {
  const server = createFakeServer();
  server.serveFile(URL_A, body, options);
  const fileStore = createMemoryPackFileStore();
  const deps = { fileStore, fetchImpl: server.fetchImpl, yieldToEventLoop: immediate };
  return { server, fileStore, deps };
};

describe('downloadAsset', () => {
  it('downloads in Range chunks, reports progress and verifies the SHA-256', async () => {
    const body = bytesOf(1000);
    const { server, fileStore, deps } = setup(body);
    const progress: number[] = [];
    const result = await downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: 1000, sha256: sha(body), maxBytes: 10_000, chunkBytes: 300, onProgress: (written) => progress.push(written) });
    expect(result).toEqual({ status: 'complete', bytes: 1000, sha256: sha(body), resumedFrom: 0 });
    expect(server.requests.map((request) => request.range)).toEqual(['bytes=0-299', 'bytes=300-599', 'bytes=600-899', 'bytes=900-999']);
    expect(progress).toEqual([0, 300, 600, 900, 1000]);
    expect(fileStore.files.get(PART)).toEqual(body);
  });

  it('resumes from an existing partial file after the network dropped', async () => {
    const body = bytesOf(1000, 3);
    const { server, fileStore, deps } = setup(body, { failFrom: 600 });
    const first = await downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: 1000, sha256: sha(body), maxBytes: 10_000, chunkBytes: 300 });
    expect(first).toEqual({ status: 'stopped', code: 'download-network-error', writtenBytes: 600 });
    expect(fileStore.files.get(PART)?.length).toBe(600);

    server.serveFile(URL_A, body);
    server.requests.length = 0;
    const second = await downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: 1000, sha256: sha(body), maxBytes: 10_000, chunkBytes: 300 });
    expect(second).toEqual({ status: 'complete', bytes: 1000, sha256: sha(body), resumedFrom: 600 });
    expect(server.requests.map((request) => request.range)).toEqual(['bytes=600-899', 'bytes=900-999']);
  });

  it('deletes the part when the hash does not match', async () => {
    const body = bytesOf(100);
    const { fileStore, deps } = setup(body);
    const result = await downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: 100, sha256: sha(bytesOf(100, 9)), maxBytes: 1000, chunkBytes: 64 });
    expect(result).toEqual({ status: 'failed', code: 'integrity-failed' });
    expect(fileStore.files.has(PART)).toBe(false);
  });

  it('stops a file larger than the manifest says or above the hard limit', async () => {
    const { fileStore, deps } = setup(bytesOf(500));
    await expect(downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: 100, sha256: null, maxBytes: 10_000, chunkBytes: 1000 })).resolves.toEqual({ status: 'failed', code: 'size-mismatch', httpStatus: 206 });
    expect(fileStore.files.has(PART)).toBe(false);
    await expect(downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: null, sha256: null, maxBytes: 200, chunkBytes: 100 })).resolves.toEqual({ status: 'failed', code: 'pack-too-large' });
    await expect(downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: 5000, sha256: null, maxBytes: 1000, chunkBytes: 100 })).resolves.toEqual({ status: 'failed', code: 'pack-too-large' });
  });

  it('accepts a full 200 response when the server ignores Range, replacing a stale part', async () => {
    const body = bytesOf(400, 4);
    const { fileStore, deps } = setup(body, { ignoreRange: true });
    await fileStore.append(PART, bytesOf(50, 8));
    const result = await downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: 400, sha256: sha(body), maxBytes: 1000, chunkBytes: 100 });
    expect(result).toMatchObject({ status: 'complete', bytes: 400 });
    expect(fileStore.files.get(PART)).toEqual(body);
  });

  it('downloads files of unknown size until the server runs out', async () => {
    const body = bytesOf(250, 5);
    const { deps } = setup(body);
    await expect(downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: null, sha256: sha(body), maxBytes: 1000, chunkBytes: 100 })).resolves.toMatchObject({ status: 'complete', bytes: 250 });
  });

  it('completes a part that was already whole (crash before the swap)', async () => {
    const body = bytesOf(200, 6);
    const { server, fileStore, deps } = setup(body);
    await fileStore.append(PART, body);
    await expect(downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: 200, sha256: sha(body), maxBytes: 1000, chunkBytes: 64 })).resolves.toMatchObject({ status: 'complete', resumedFrom: 200 });
    expect(server.requests).toHaveLength(0);
  });

  it('keeps the part when stopped for Wi-Fi or cancelled', async () => {
    const body = bytesOf(300, 7);
    const { fileStore, deps } = setup(body);
    let calls = 0;
    const result = await downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: 300, sha256: sha(body), maxBytes: 1000, chunkBytes: 100, canContinue: async () => (++calls > 1 ? 'waiting-for-wifi' : null) });
    expect(result).toEqual({ status: 'stopped', code: 'waiting-for-wifi', writtenBytes: 100 });
    expect(fileStore.files.get(PART)?.length).toBe(100);

    const abort = new AbortController();
    abort.abort();
    await expect(downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: 300, sha256: sha(body), maxBytes: 1000, chunkBytes: 100, signal: abort.signal })).resolves.toMatchObject({
      status: 'stopped',
      code: 'cancelled',
    });
    expect(fileStore.files.get(PART)?.length).toBe(100);
  });

  it('reports expired signed URLs and HTTP errors', async () => {
    const { server, deps } = setup(bytesOf(10));
    server.files.set(URL_A, { status: 403 });
    await expect(downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: 10, sha256: null, maxBytes: 100 })).resolves.toEqual({ status: 'failed', code: 'download-url-expired', httpStatus: 403 });
    server.files.set(URL_A, { status: 503 });
    await expect(downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: 10, sha256: null, maxBytes: 100 })).resolves.toEqual({ status: 'failed', code: 'download-http-error', httpStatus: 503 });
  });
});

describe('downloadAsset with a background transfer', () => {
  type MemoryStore = ReturnType<typeof createMemoryPackFileStore>;

  /** An OS transfer stand-in: `run` decides what lands at the part path and what the transfer reports. */
  const backgroundSetup = (run: (request: BackgroundTransferRequest, fileStore: MemoryStore) => Promise<BackgroundTransferResult>) => {
    const { server, fileStore, deps } = setup(bytesOf(10, 99));
    const requests: BackgroundTransferRequest[] = [];
    const backgroundTransfer: BackgroundTransfer = {
      download: async (request) => {
        requests.push(request);
        return run(request, fileStore);
      },
    };
    return { server, fileStore, requests, deps: { ...deps, backgroundTransfer } };
  };

  /** Writes `body` at the part path (as the OS moves the finished download there) and completes. */
  const completesWith =
    (body: Uint8Array) =>
    async (request: BackgroundTransferRequest, fileStore: MemoryStore): Promise<BackgroundTransferResult> => {
      request.onProgress?.(Math.floor(body.length / 2), null);
      await fileStore.append(request.path, body);
      request.onProgress?.(body.length, body.length);
      return { status: 'complete' };
    };

  it('hands a new asset to the transfer, then checks size and SHA-256 itself', async () => {
    const body = bytesOf(1000, 11);
    const { server, fileStore, requests, deps } = backgroundSetup(completesWith(body));
    const abort = new AbortController();
    const progress: [number, number | null][] = [];
    const result = await downloadAsset(deps, {
      url: URL_A,
      partPath: PART,
      expectedBytes: 1000,
      sha256: sha(body),
      maxBytes: 10_000,
      chunkBytes: 300,
      signal: abort.signal,
      onProgress: (written, total) => progress.push([written, total]),
    });
    expect(result).toEqual({ status: 'complete', bytes: 1000, sha256: sha(body), resumedFrom: 0 });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ url: URL_A, path: PART, signal: abort.signal });
    // No in-app Range requests; an unknown total from the OS falls back to the manifest size.
    expect(server.requests).toHaveLength(0);
    expect(progress).toEqual([
      [0, 1000],
      [500, 1000],
      [1000, 1000],
      [1000, 1000],
    ]);
    expect(fileStore.files.get(PART)).toEqual(body);
  });

  it('completes an asset of unknown size and without a hash', async () => {
    const body = bytesOf(250, 12);
    const { deps } = backgroundSetup(completesWith(body));
    await expect(downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: null, sha256: null, maxBytes: 1000, chunkBytes: 100 })).resolves.toEqual({
      status: 'complete',
      bytes: 250,
      sha256: sha(body),
      resumedFrom: 0,
    });
  });

  it('deletes a transferred file whose hash or size does not match the manifest', async () => {
    const body = bytesOf(100, 13);
    const wrongHash = backgroundSetup(completesWith(body));
    await expect(downloadAsset(wrongHash.deps, { url: URL_A, partPath: PART, expectedBytes: 100, sha256: sha(bytesOf(100, 14)), maxBytes: 1000, chunkBytes: 64 })).resolves.toEqual({
      status: 'failed',
      code: 'integrity-failed',
    });
    expect(wrongHash.fileStore.files.has(PART)).toBe(false);

    const short = backgroundSetup(completesWith(body.slice(0, 60)));
    await expect(downloadAsset(short.deps, { url: URL_A, partPath: PART, expectedBytes: 100, sha256: sha(body), maxBytes: 1000, chunkBytes: 64 })).resolves.toEqual({ status: 'failed', code: 'size-mismatch' });
    expect(short.fileStore.files.has(PART)).toBe(false);
  });

  it('deletes a transferred file above the manifest size or the hard limit', async () => {
    const body = bytesOf(150, 15);
    const larger = backgroundSetup(completesWith(body));
    await expect(downloadAsset(larger.deps, { url: URL_A, partPath: PART, expectedBytes: 100, sha256: null, maxBytes: 1000 })).resolves.toEqual({ status: 'failed', code: 'size-mismatch' });
    expect(larger.fileStore.files.has(PART)).toBe(false);

    const tooLarge = backgroundSetup(completesWith(body));
    await expect(downloadAsset(tooLarge.deps, { url: URL_A, partPath: PART, expectedBytes: null, sha256: null, maxBytes: 100 })).resolves.toEqual({ status: 'failed', code: 'pack-too-large' });
    expect(tooLarge.fileStore.files.has(PART)).toBe(false);

    // Declared above the limit: refused before the transfer starts.
    const declared = backgroundSetup(completesWith(body));
    await expect(downloadAsset(declared.deps, { url: URL_A, partPath: PART, expectedBytes: 5000, sha256: null, maxBytes: 1000 })).resolves.toEqual({ status: 'failed', code: 'pack-too-large' });
    expect(declared.requests).toHaveLength(0);
  });

  it.each([['cancelled' as const], ['download-network-error' as const]])('reports a stopped transfer (%s) without touching what the OS kept', async (code) => {
    const { fileStore, deps } = backgroundSetup(async () => ({ status: 'stopped', code }));
    await expect(downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: 100, sha256: null, maxBytes: 1000 })).resolves.toEqual({ status: 'stopped', code, writtenBytes: 0 });
    expect(fileStore.files.has(PART)).toBe(false);
  });

  it('removes the part of a failed transfer and passes the code and HTTP status on', async () => {
    const expired = backgroundSetup(async (request, fileStore) => {
      await fileStore.append(request.path, bytesOf(40, 16));
      return { status: 'failed', code: 'download-url-expired', httpStatus: 403 };
    });
    await expect(downloadAsset(expired.deps, { url: URL_A, partPath: PART, expectedBytes: 100, sha256: null, maxBytes: 1000 })).resolves.toEqual({
      status: 'failed',
      code: 'download-url-expired',
      httpStatus: 403,
    });
    expect(expired.fileStore.files.has(PART)).toBe(false);

    const storage = backgroundSetup(async () => ({ status: 'failed', code: 'storage-error' }));
    const result = await downloadAsset(storage.deps, { url: URL_A, partPath: PART, expectedBytes: 100, sha256: null, maxBytes: 1000 });
    expect(result).toStrictEqual({ status: 'failed', code: 'storage-error' });
  });

  it('finishes an existing partial part with Range requests instead', async () => {
    const body = bytesOf(500, 17);
    const { server, fileStore, requests, deps } = backgroundSetup(completesWith(body));
    server.serveFile(URL_A, body);
    await fileStore.append(PART, body.slice(0, 200));
    const result = await downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: 500, sha256: sha(body), maxBytes: 1000, chunkBytes: 200 });
    expect(result).toEqual({ status: 'complete', bytes: 500, sha256: sha(body), resumedFrom: 200 });
    expect(requests).toHaveLength(0);
    expect(server.requests.map((request) => request.range)).toEqual(['bytes=200-399', 'bytes=400-499']);
  });

  it('does not start the transfer when the network policy blocks it', async () => {
    const { requests, deps } = backgroundSetup(completesWith(bytesOf(10)));
    await expect(downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: 10, sha256: null, maxBytes: 100, canContinue: async () => 'waiting-for-wifi' })).resolves.toEqual({
      status: 'stopped',
      code: 'waiting-for-wifi',
      writtenBytes: 0,
    });
    expect(requests).toHaveLength(0);
  });

  it('keeps a whole transferred file when cancelled while checking it, and completes it next time without transferring again', async () => {
    const body = bytesOf(300, 18);
    const abort = new AbortController();
    const { fileStore, requests, deps } = backgroundSetup(async (request, store) => {
      await store.append(request.path, body);
      abort.abort();
      return { status: 'complete' };
    });
    await expect(downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: 300, sha256: sha(body), maxBytes: 1000, chunkBytes: 100, signal: abort.signal })).resolves.toEqual({
      status: 'stopped',
      code: 'cancelled',
      writtenBytes: 0,
    });
    expect(fileStore.files.get(PART)).toEqual(body);

    await expect(downloadAsset(deps, { url: URL_A, partPath: PART, expectedBytes: 300, sha256: sha(body), maxBytes: 1000, chunkBytes: 100 })).resolves.toEqual({
      status: 'complete',
      bytes: 300,
      sha256: sha(body),
      resumedFrom: 300,
    });
    expect(requests).toHaveLength(1);
  });

  it('reports a storage error when the transferred file cannot be read back', async () => {
    const body = bytesOf(100, 19);
    const { fileStore, deps } = backgroundSetup(completesWith(body));
    const unreadable: MemoryStore = { ...fileStore, read: () => Promise.reject(new Error('NotReadableError')) };
    await expect(downloadAsset({ ...deps, fileStore: unreadable }, { url: URL_A, partPath: PART, expectedBytes: 100, sha256: sha(body), maxBytes: 1000 })).resolves.toEqual({
      status: 'failed',
      code: 'storage-error',
    });
    expect(fileStore.files.has(PART)).toBe(false);
  });
});
