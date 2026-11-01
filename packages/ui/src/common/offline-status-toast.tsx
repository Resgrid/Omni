import { type FC, useEffect, useRef } from 'react';

import { useToastStore } from '../toast/store';
import { useTranslation } from '../utils/i18n';

export const OFFLINE_TOAST_DURATION_MS = 6000;

export interface OfflineStatusToastProps {
  /** No connection or the network is unreachable. */
  isOffline: boolean;
  /** Queued writes not yet synced (outbox items that are not completed). */
  pendingCount: number;
  /** Opens the pending-sync screen; when given, pending-sync toasts are pressable. */
  onOpenQueue?: () => void;
  durationMs?: number;
}

/**
 * Publishes network and pending-sync state through the global toast system without taking up layout
 * space above the navigator (IC baseline, made props-driven: the app shell feeds it from the offline
 * store and supplies navigation). Pending-sync toasts open the queue; manual sync stays on that screen.
 */
export const OfflineStatusToast: FC<OfflineStatusToastProps> = ({ isOffline, pendingCount, onOpenQueue, durationMs = OFFLINE_TOAST_DURATION_MS }) => {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.showToast);
  const removeToast = useToastStore((state) => state.removeToast);
  const activeToastIdRef = useRef<string | null>(null);
  // Held in a ref so a new callback identity on every parent render does not re-post the toast.
  const onOpenQueueRef = useRef(onOpenQueue);
  useEffect(() => {
    onOpenQueueRef.current = onOpenQueue;
  }, [onOpenQueue]);
  const hasQueueAction = onOpenQueue !== undefined;

  useEffect(() => {
    if (activeToastIdRef.current) {
      removeToast(activeToastIdRef.current);
      activeToastIdRef.current = null;
    }

    const openQueue = hasQueueAction ? () => onOpenQueueRef.current?.() : undefined;

    if (isOffline) {
      activeToastIdRef.current = showToast(
        'warning',
        pendingCount > 0 ? t('settings.view_sync_queue', { defaultValue: 'View sync queue' }) : t('offline.offline_message', { defaultValue: 'You are offline' }),
        pendingCount > 0 ? t('offline.offline_with_pending', { count: pendingCount, defaultValue: 'Offline — {{count}} pending' }) : undefined,
        { duration: durationMs, onPress: pendingCount > 0 ? openQueue : undefined }
      );
    } else if (pendingCount > 0) {
      activeToastIdRef.current = showToast('info', t('settings.view_sync_queue', { defaultValue: 'View sync queue' }), t('offline.pending_count', { count: pendingCount, defaultValue: '{{count}} pending' }), {
        duration: durationMs,
        onPress: openQueue,
      });
    }
  }, [durationMs, hasQueueAction, isOffline, pendingCount, removeToast, showToast, t]);

  useEffect(
    () => () => {
      if (activeToastIdRef.current) {
        removeToast(activeToastIdRef.current);
      }
    },
    [removeToast]
  );

  return null;
};
