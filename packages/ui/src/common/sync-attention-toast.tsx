import { type FC, useEffect, useRef } from 'react';

import { useToastStore } from '../toast/store';
import { useSettledFlag } from '../use-settled-flag';
import { useTranslation } from '../utils/i18n';

/**
 * How long a sync state must hold before the user is shown it. A queued write normally sends within a second or two
 * and a connectivity blip heals as fast; telling the user about either only makes the top of the screen flash.
 */
export const SYNC_NOTICE_DELAY_MS = 5000;

export interface SyncAttentionToastProps {
  /**
   * Queued changes the outbox cannot finish on its own: refused by the server, or waiting for the user to confirm
   * sending them. Routine state (offline, changes waiting to send) is not counted: the app bar shows that.
   */
  attentionCount: number;
  /** Opens the pending-changes screen; when given, the toast is pressable. */
  onOpenQueue?: () => void;
  delayMs?: number;
}

/**
 * The one sync toast: posted only when queued changes need the user, and kept until it is tapped or dismissed. It is
 * posted again only when more changes need attention than the user was last told about, and it goes when none do.
 */
export const SyncAttentionToast: FC<SyncAttentionToastProps> = ({ attentionCount, onOpenQueue, delayMs = SYNC_NOTICE_DELAY_MS }) => {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.showToast);
  const removeToast = useToastStore((state) => state.removeToast);
  const isSettled = useSettledFlag(attentionCount > 0, { delayMs });
  const activeToastId = useRef<string | null>(null);
  const notifiedCount = useRef(0);
  // Held in a ref so a new callback identity on every parent render does not re-post the toast.
  const onOpenQueueRef = useRef(onOpenQueue);

  useEffect(() => {
    onOpenQueueRef.current = onOpenQueue;
  }, [onOpenQueue]);

  const hasQueueAction = onOpenQueue !== undefined;

  useEffect(() => {
    if (attentionCount <= 0) {
      notifiedCount.current = 0;

      if (activeToastId.current) {
        removeToast(activeToastId.current);
        activeToastId.current = null;
      }

      return;
    }

    if (!isSettled) {
      return;
    }

    if (attentionCount <= notifiedCount.current) {
      // Fewer than before (the user is resolving them): lower the mark so a new one is announced, and leave the toast.
      notifiedCount.current = attentionCount;

      return;
    }

    if (activeToastId.current) {
      removeToast(activeToastId.current);
    }

    notifiedCount.current = attentionCount;
    activeToastId.current = showToast(
      'error',
      hasQueueAction
        ? t('app.sync_attention_message_review', { defaultValue: 'Some changes could not be sent and need your attention. Tap to review them.' })
        : t('app.sync_attention_message', { defaultValue: 'Some changes could not be sent and need your attention.' }),
      t('app.sync_attention_title', { defaultValue: 'Changes not sent' }),
      { duration: 0, onPress: hasQueueAction ? () => onOpenQueueRef.current?.() : undefined }
    );
  }, [attentionCount, hasQueueAction, isSettled, removeToast, showToast, t]);

  useEffect(
    () => () => {
      if (activeToastId.current) {
        removeToast(activeToastId.current);
      }
    },
    [removeToast]
  );

  return null;
};
