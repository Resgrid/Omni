import { useAuthStore } from '@resgrid/auth';
import { logger } from '@resgrid/core';
import type { ClearAllLocalDataResult, ClearCachedDataResult, OutboxSnapshot, StorageDiagnostics, StorageReport } from '@resgrid/offline';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { getStorageSyncServices } from '../runtime';

/** The outbox's live snapshot (counts and items, no payloads), or null before offline storage is bound. */
export const useOutboxSnapshot = (): OutboxSnapshot | null => {
  const outbox = getStorageSyncServices()?.outbox ?? null;
  const subscribe = useCallback((listener: () => void) => (outbox ? outbox.subscribe(() => listener()) : () => undefined), [outbox]);
  const read = useCallback((): OutboxSnapshot | null => (outbox ? outbox.getSnapshot() : null), [outbox]);
  return useSyncExternalStore(subscribe, read, read);
};

export type SyncNowOutcome = 'synced' | 'partial' | 'failed';

export interface StorageSync {
  available: boolean;
  report: StorageReport | null;
  loading: boolean;
  /** A report that could not be built (the screen still offers its actions). */
  failed: boolean;
  refresh: () => Promise<void>;
  retry: (id: string) => Promise<boolean>;
  retryAll: () => Promise<number>;
  discard: (id: string) => Promise<boolean>;
  confirm: (id: string) => Promise<boolean>;
  syncNow: () => Promise<SyncNowOutcome>;
  clearCachedData: () => Promise<ClearCachedDataResult | null>;
  /** The unsent count for the "Clear all local data" warning (nothing is deleted). */
  prepareClearAll: () => Promise<number>;
  /** Wipes everything (after the warning) and signs out. */
  clearAllLocalData: () => Promise<ClearAllLocalDataResult | null>;
  diagnostics: () => Promise<StorageDiagnostics | null>;
}

/**
 * Settings → Advanced → Storage & sync (plan §8.2a): the storage report, kept current from the outbox's live snapshot, and
 * every action the screen offers. Never logs record content: failures log their error type only.
 */
export const useStorageSync = (): StorageSync => {
  const services = getStorageSyncServices();
  const snapshot = useOutboxSnapshot();
  const [report, setReport] = useState<StorageReport | null>(null);
  const [loading, setLoading] = useState(services !== null);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const refresh = useCallback(async () => {
    if (!services) {
      return;
    }
    setLoading(true);
    try {
      const next = await services.storage.getStorageReport();
      if (mounted.current) {
        setReport(next);
        setFailed(false);
      }
    } catch (error) {
      logger.warn({ message: 'Storage report could not be built', context: { errorType: error instanceof Error ? error.name : typeof error } });
      if (mounted.current) {
        setFailed(true);
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, [services]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The pending list follows the outbox as it drains or fails, without rebuilding the whole report.
  const live: StorageReport | null =
    report && snapshot
      ? {
          ...report,
          items: snapshot.items,
          pending: {
            ...report.pending,
            unsent: snapshot.counts.unsent,
            pending: snapshot.counts.pending,
            processing: snapshot.counts.processing,
            failed: snapshot.counts.failed,
            dead: snapshot.counts.dead,
            stuck: snapshot.counts.stuck,
            awaitingConfirmation: snapshot.counts.awaitingConfirmation,
            held: snapshot.counts.held,
          },
        }
      : report;

  const outboxAction = useCallback(
    async <T>(action: (outbox: NonNullable<NonNullable<typeof services>['outbox']>) => Promise<T>, fallback: T): Promise<T> => {
      const outbox = services?.outbox;
      if (!outbox) {
        return fallback;
      }
      try {
        return await action(outbox);
      } finally {
        void refresh();
      }
    },
    [refresh, services]
  );

  const retry = useCallback((id: string) => outboxAction((outbox) => outbox.retry(id), false), [outboxAction]);
  const retryAll = useCallback(() => outboxAction((outbox) => outbox.retryAll(), 0), [outboxAction]);
  const discard = useCallback((id: string) => outboxAction((outbox) => outbox.discard(id, { confirmed: true }), false), [outboxAction]);
  const confirm = useCallback((id: string) => outboxAction((outbox) => outbox.confirmOnlineAuth(id), false), [outboxAction]);

  const syncNow = useCallback(async (): Promise<SyncNowOutcome> => {
    if (!services) {
      return 'failed';
    }
    try {
      const result = services.sync ? await services.sync.onReconnect() : null;
      // The reconnect sequence drains the outbox when the shell wired it; otherwise drain here.
      if (services.outbox && !result?.completed.includes('drainOutbox')) {
        await services.outbox.drain();
      }
      return !result || result.ok ? 'synced' : result.abortedAt ? 'failed' : 'partial';
    } catch (error) {
      logger.warn({ message: 'Sync now failed', context: { errorType: error instanceof Error ? error.name : typeof error } });
      return 'failed';
    } finally {
      void refresh();
    }
  }, [refresh, services]);

  const clearCachedData = useCallback(async () => {
    if (!services) {
      return null;
    }
    try {
      return await services.storage.clearCachedData();
    } finally {
      void refresh();
    }
  }, [refresh, services]);

  const prepareClearAll = useCallback(async () => {
    if (!services) {
      return 0;
    }
    const result = await services.storage.clearAllLocalData();
    return result.status === 'confirmation-required' ? result.unsentCount : 0;
  }, [services]);

  const clearAllLocalData = useCallback(async () => {
    if (!services) {
      return null;
    }
    const result = await services.storage.clearAllLocalData({ confirmed: true });
    // The wipe signs out on the server first when the shell wired it; the local session always ends here too.
    const auth = useAuthStore.getState();
    if (auth.status === 'signedIn' || auth.accessToken) {
      await auth.logout('Local data cleared', 'logout');
    }
    return result;
  }, [services]);

  const diagnostics = useCallback(async () => (services ? services.storage.getDiagnosticsSummary() : null), [services]);

  return { available: services !== null, report: live, loading, failed, refresh, retry, retryAll, discard, confirm, syncNow, clearCachedData, prepareClearAll, clearAllLocalData, diagnostics };
};
