import { applyAppUpdate, useAppUpdates } from '@resgrid/core';
import { removeToast, showToast, useFormFactor } from '@resgrid/ui';
import { useEffect, useRef } from 'react';

import { type ShellTranslate, useShellTranslation } from '../i18n';
import { useWallAutoRestart } from './use-wall-auto-restart';
import { WALL_AUTO_RESTART_IDLE_MS } from './wall-auto-restart';

const RESULT_TOAST_MS = 6_000;

/**
 * The "Update ready" notice (inside the signed-in shell, next to the offline toast). A downloaded update applies on the
 * next cold start; this offers to restart now through a small, dismissible toast — restarting stays the member's choice,
 * and a connected voice session holds it. On a wall display the shell also restarts by itself once the screen has been
 * idle for a few minutes (useWallAutoRestart). Renders nothing.
 */
export function ShellUpdateNotice() {
  const updates = useAppUpdates();
  const { isWall } = useFormFactor();
  const { t } = useShellTranslation();
  const translate = useRef<ShellTranslate>(t);
  const toastId = useRef<string | null>(null);
  const shownFor = useRef<string | null>(null);

  useEffect(() => {
    translate.current = t;
  }, [t]);

  const ready = updates.status === 'ready' && updates.pending !== null;
  // One notice per downloaded update: dismissing it keeps it dismissed until a newer one arrives.
  const pendingKey = ready && updates.pending ? (updates.pending.updateId ?? 'embedded') : null;

  useEffect(() => {
    if (!pendingKey || shownFor.current === pendingKey) {
      return;
    }
    shownFor.current = pendingKey;
    if (toastId.current) {
      removeToast(toastId.current);
    }
    const tr = translate.current;
    const restart = async (): Promise<void> => {
      const result = await applyAppUpdate('user');
      if (result === 'failed') {
        showToast('error', translate.current('shell.update_restart_failed'), undefined, { duration: RESULT_TOAST_MS });
      }
    };
    const message = isWall ? tr('shell.update_ready_wall_message', { minutes: Math.round(WALL_AUTO_RESTART_IDLE_MS / 60_000) }) : tr('shell.update_ready_message');
    toastId.current = showToast('info', message, tr('shell.update_ready_title'), { duration: 0, onPress: () => void restart() });
  }, [isWall, pendingKey]);

  useEffect(
    () => () => {
      if (toastId.current) {
        removeToast(toastId.current);
      }
    },
    []
  );

  useWallAutoRestart(isWall && ready && updates.pending ? updates.pending.downloadedAt : null);

  return null;
}
