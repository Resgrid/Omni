import type { OfflineMapsErrorCode } from './errors';

/**
 * Background transfers (MapLibre plan §19.5 "background continuation"): a whole-file download the OS keeps running while
 * the app is suspended — on iOS a background URLSession (expo-file-system `DownloadTask`). The downloader hands it a
 * fresh part file and verifies size and SHA-256 itself afterwards, exactly as for its own Range transfers; a stopped
 * transfer keeps its OS resume data for the next attempt. Platforms without one use the in-app Range downloader.
 */
export interface BackgroundTransferRequest {
  url: string;
  /** Part file path relative to the pack store root (it must not exist yet). */
  path: string;
  signal?: AbortSignal;
  onProgress?: (writtenBytes: number, totalBytes: number | null) => void;
}

export type BackgroundTransferResult =
  { status: 'complete' } | { status: 'stopped'; code: Extract<OfflineMapsErrorCode, 'cancelled' | 'download-network-error'> } | { status: 'failed'; code: OfflineMapsErrorCode; httpStatus?: number };

export interface BackgroundTransfer {
  download(request: BackgroundTransferRequest): Promise<BackgroundTransferResult>;
}

/** Expired or refused signed URLs: the manager refetches the manifest once (plan §19.3). */
export const isExpiredUrlStatus = (status: number): boolean => status === 401 || status === 403 || status === 410;
