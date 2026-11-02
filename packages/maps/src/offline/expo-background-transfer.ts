import { Directory, DownloadTask, File, Paths } from 'expo-file-system';

import { type BackgroundTransfer, isExpiredUrlStatus } from './background-transfer';
import { OFFLINE_PACKS_DIRECTORY } from './expo-file-store';
import { normalizePackPath } from './file-store';
import type { OfflineMapsKv } from './manager';
import { fetchRange, type OfflineFetch } from './transport';

/** Paused transfers by part path (OS resume data), so a transfer stopped before the app quit continues next time. */
export const BACKGROUND_TRANSFER_RESUME_KEY = 'offline-maps.background-resume';

type SavedTransfers = Record<string, ReturnType<DownloadTask['savable']>>;

export interface ExpoBackgroundTransferOptions {
  directoryName?: string;
  /** Where paused transfers are remembered (device storage; wiped with the packs' scope folder anyway). */
  kv?: OfflineMapsKv | null;
  /** Probes a failed URL for its status (expired signature vs. network), with a one-byte Range request. */
  fetchImpl: OfflineFetch;
}

/**
 * iOS/Android background transfers on expo-file-system's `DownloadTask` (SDK 58): on iOS a background URLSession, so a
 * response-area pack keeps downloading with the app suspended or the screen locked; Android ignores the session type and
 * the transfer runs while the app process lives (the in-app Range resume covers the rest). A cancel pauses the task and
 * keeps its resume data; the next attempt resumes from it when the URL is the same signed URL.
 */
export function createExpoBackgroundTransfer(options: ExpoBackgroundTransferOptions): BackgroundTransfer {
  const root = new Directory(Paths.document, options.directoryName ?? OFFLINE_PACKS_DIRECTORY);
  const readSaved = (): SavedTransfers => {
    try {
      const raw = options.kv?.getString(BACKGROUND_TRANSFER_RESUME_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as SavedTransfers) : {};
    } catch {
      return {};
    }
  };
  const writeSaved = (saved: SavedTransfers): void => {
    try {
      if (Object.keys(saved).length === 0) options.kv?.delete(BACKGROUND_TRANSFER_RESUME_KEY);
      else options.kv?.set(BACKGROUND_TRANSFER_RESUME_KEY, JSON.stringify(saved));
    } catch {
      // Resume data is a convenience: losing it only restarts the transfer.
    }
  };
  const forget = (path: string): void => {
    const saved = readSaved();
    if (path in saved) {
      delete saved[path];
      writeSaved(saved);
    }
  };

  return {
    download: async ({ url, path, signal, onProgress }) => {
      const destination = new File(root, normalizePackPath(path));
      const parent = destination.parentDirectory;
      if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
      if (destination.exists) destination.delete();

      const taskOptions = {
        sessionType: 'background' as const,
        onProgress: ({ bytesWritten, totalBytes }: { bytesWritten: number; totalBytes: number }) => onProgress?.(bytesWritten, totalBytes >= 0 ? totalBytes : null),
      };
      const saved = readSaved()[path];
      let task: DownloadTask;
      let resumed = false;
      if (saved && saved.url === url && saved.fileUri === destination.uri) {
        try {
          task = DownloadTask.fromSavable(saved, taskOptions);
          resumed = true;
        } catch {
          task = new DownloadTask(url, destination, taskOptions);
        }
      } else {
        task = new DownloadTask(url, destination, taskOptions);
      }

      let pausing: Promise<void> | null = null;
      const onAbort = () => {
        if (task.state === 'active') pausing = task.pauseAsync().catch(() => undefined);
      };
      signal?.addEventListener('abort', onAbort);
      try {
        // Cancelled before it started: the saved resume data stays for the next attempt.
        if (signal?.aborted) return { status: 'stopped', code: 'cancelled' };
        forget(path);
        const file = resumed ? await task.resumeAsync() : await task.downloadAsync();
        if (file === null) {
          // Paused (cancelled by the manager, or the Wi-Fi went): keep the OS resume data.
          await pausing;
          try {
            const state = task.savable();
            writeSaved({ ...readSaved(), [path]: state });
          } catch {
            // Paused before any data: nothing to keep.
          }
          return { status: 'stopped', code: 'cancelled' };
        }
        return { status: 'complete' };
      } catch {
        if (signal?.aborted) return { status: 'stopped', code: 'cancelled' };
        if (destination.exists) destination.delete();
        // Tell an expired signature (refetch the manifest) from a dropped connection (try again later).
        try {
          const probe = await fetchRange(options.fetchImpl, url, 0, 0, signal);
          if (isExpiredUrlStatus(probe.status)) return { status: 'failed', code: 'download-url-expired', httpStatus: probe.status };
          if (probe.status >= 400) return { status: 'failed', code: 'download-http-error', httpStatus: probe.status };
        } catch {
          // No answer at all: offline.
        }
        return { status: 'stopped', code: 'download-network-error' };
      } finally {
        signal?.removeEventListener('abort', onAbort);
        try {
          task.release();
        } catch {
          // Already released.
        }
      }
    },
  };
}
