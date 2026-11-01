import { isAbortError, type OfflineMapsErrorCode } from './errors';
import type { OfflinePackFileStore } from './file-store';
import { createSha256, type Sha256Hasher } from './sha256';
import { fetchRange, type OfflineFetch } from './transport';

/** Bytes per Range request (and per append). */
export const DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024;
/** Hash in slices this size, yielding in between, so a 4 MB chunk does not block the JS thread. */
const HASH_SLICE_BYTES = 512 * 1024;

export interface AssetDownloadRequest {
  url: string;
  /** Relative path of the partial file (kept between attempts for resume). */
  partPath: string;
  /** Declared size from the manifest, or null when unknown. */
  expectedBytes: number | null;
  /** Lower-case hex SHA-256 from the manifest, or null (small assets without a hash). */
  sha256: string | null;
  /** Hard limit; the transfer stops (and the part is deleted) beyond it. */
  maxBytes: number;
  chunkBytes?: number;
  signal?: AbortSignal;
  /** Bytes written so far (including resumed bytes) and the expected total. */
  onProgress?: (writtenBytes: number, totalBytes: number | null) => void;
  /** Checked before every chunk: return a code to stop (part kept), e.g. `waiting-for-wifi`. */
  canContinue?: () => Promise<OfflineMapsErrorCode | null>;
}

export type AssetDownloadResult =
  | { status: 'complete'; bytes: number; sha256: string; resumedFrom: number }
  | { status: 'stopped'; code: OfflineMapsErrorCode; writtenBytes: number }
  | { status: 'failed'; code: OfflineMapsErrorCode; httpStatus?: number };

export interface DownloaderDeps {
  fileStore: OfflinePackFileStore;
  fetchImpl: OfflineFetch;
  createHasher?: () => Sha256Hasher;
  /** Lets the event loop run between hash slices (default `setTimeout(0)`). */
  yieldToEventLoop?: () => Promise<void>;
}

const defaultYield = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function hashBytes(hasher: Sha256Hasher, bytes: Uint8Array, yieldToEventLoop: () => Promise<void>): Promise<void> {
  for (let offset = 0; offset < bytes.length; offset += HASH_SLICE_BYTES) {
    hasher.update(bytes.subarray(offset, Math.min(offset + HASH_SLICE_BYTES, bytes.length)));
    if (offset + HASH_SLICE_BYTES < bytes.length) await yieldToEventLoop();
  }
}

/**
 * Downloads one asset to `partPath` with HTTP Range resume (MapLibre plan §19.5): an existing part is re-hashed and
 * continued from its size; every chunk is size-checked against the manifest and the hard limit; the finished file is
 * verified against the manifest SHA-256. On integrity or size failure the part is deleted; on network loss, abort or a
 * `canContinue` stop it is kept for the next attempt. The caller moves the verified part into place (atomic swap).
 */
export async function downloadAsset(deps: DownloaderDeps, request: AssetDownloadRequest): Promise<AssetDownloadResult> {
  const { fileStore, fetchImpl } = deps;
  const createHasher = deps.createHasher ?? createSha256;
  const yieldToEventLoop = deps.yieldToEventLoop ?? defaultYield;
  const chunkBytes = request.chunkBytes !== undefined && request.chunkBytes > 0 ? Math.floor(request.chunkBytes) : DEFAULT_CHUNK_BYTES;
  const limit = request.expectedBytes !== null ? Math.min(request.expectedBytes, request.maxBytes) : request.maxBytes;
  let hasher = createHasher();
  let total: number | null = request.expectedBytes;

  const discard = async (code: OfflineMapsErrorCode, httpStatus?: number): Promise<AssetDownloadResult> => {
    await fileStore.remove(request.partPath).catch(() => undefined);
    return httpStatus === undefined ? { status: 'failed', code } : { status: 'failed', code, httpStatus };
  };

  if (request.expectedBytes !== null && request.expectedBytes > request.maxBytes) {
    return discard('pack-too-large');
  }

  // Resume: re-hash what is already on disk.
  let offset = 0;
  try {
    const existing = (await fileStore.size(request.partPath)) ?? 0;
    if (existing > limit) {
      await fileStore.remove(request.partPath);
    } else if (existing > 0) {
      for (let position = 0; position < existing; position += chunkBytes) {
        if (request.signal?.aborted) return { status: 'stopped', code: 'cancelled', writtenBytes: position };
        const bytes = await fileStore.read(request.partPath, position, Math.min(chunkBytes, existing - position));
        await hashBytes(hasher, bytes, yieldToEventLoop);
      }
      offset = existing;
    }
  } catch {
    await fileStore.remove(request.partPath).catch(() => undefined);
    hasher = createHasher();
    offset = 0;
  }
  const resumedFrom = offset;
  request.onProgress?.(offset, total);

  const finish = async (): Promise<AssetDownloadResult> => {
    if (request.expectedBytes !== null && offset !== request.expectedBytes) {
      return discard('size-mismatch');
    }
    const digest = hasher.digestHex();
    if (request.sha256 !== null && digest !== request.sha256.toLowerCase()) {
      return discard('integrity-failed');
    }
    return { status: 'complete', bytes: offset, sha256: digest, resumedFrom };
  };

  for (;;) {
    if (total !== null && offset >= total) {
      return finish();
    }
    if (request.signal?.aborted) {
      return { status: 'stopped', code: 'cancelled', writtenBytes: offset };
    }
    const blocked = request.canContinue ? await request.canContinue() : null;
    if (blocked) {
      return { status: 'stopped', code: blocked, writtenBytes: offset };
    }

    const start = offset;
    const end = total !== null ? Math.min(start + chunkBytes, total) - 1 : start + chunkBytes - 1;
    const requested = end - start + 1;
    let response: Awaited<ReturnType<typeof fetchRange>>;
    try {
      response = await fetchRange(fetchImpl, request.url, offset, end, request.signal);
    } catch (error) {
      return { status: 'stopped', code: isAbortError(error) || request.signal?.aborted ? 'cancelled' : 'download-network-error', writtenBytes: offset };
    }

    if (response.status === 416) {
      // Nothing left past `offset`: complete when the size is unknown or already reached, otherwise start over.
      if (total === null || offset === total) {
        total = offset;
        return finish();
      }
      return discard('size-mismatch', 416);
    }
    if (response.status === 401 || response.status === 403 || response.status === 410) {
      return { status: 'failed', code: 'download-url-expired', httpStatus: response.status };
    }
    if (response.status !== 200 && response.status !== 206) {
      return { status: 'failed', code: 'download-http-error', httpStatus: response.status };
    }

    const bytes = response.bytes;
    if (response.status === 200) {
      // The server ignored Range and sent the whole file: replace whatever was there.
      if (offset > 0) {
        await fileStore.remove(request.partPath).catch(() => undefined);
        hasher = createHasher();
        offset = 0;
      }
      total = bytes.length;
    } else {
      if (response.range && response.range.start !== offset) {
        return discard('size-mismatch', 206);
      }
      if (response.range?.total !== null && response.range?.total !== undefined) {
        if (request.expectedBytes !== null && response.range.total !== request.expectedBytes) {
          return discard('size-mismatch', 206);
        }
        total = response.range.total;
      }
    }

    if (offset + bytes.length > limit || (total !== null && total > request.maxBytes)) {
      return discard(request.expectedBytes !== null && offset + bytes.length > request.expectedBytes ? 'size-mismatch' : 'pack-too-large');
    }
    if (bytes.length === 0) {
      if (total === null) {
        total = offset;
        return finish();
      }
      return { status: 'stopped', code: 'download-network-error', writtenBytes: offset };
    }

    try {
      await fileStore.append(request.partPath, bytes);
    } catch {
      return { status: 'failed', code: 'storage-error' };
    }
    await hashBytes(hasher, bytes, yieldToEventLoop);
    offset += bytes.length;
    request.onProgress?.(offset, total);

    // Unknown size and a short chunk: that was the end.
    if (total === null && bytes.length < requested) {
      total = offset;
    }
  }
}
