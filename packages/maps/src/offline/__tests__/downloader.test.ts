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
