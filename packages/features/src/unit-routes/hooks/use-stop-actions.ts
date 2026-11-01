import { useRoutesStore, type WriteResult } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { useToast } from '@resgrid/ui';
import { useCallback, useState } from 'react';

export interface StopActions {
  checkIn: (routeInstanceStopId: string) => Promise<void>;
  checkOut: (routeInstanceStopId: string) => Promise<void>;
  skip: (routeInstanceStopId: string, reason: string) => Promise<void>;
  /** The stop whose write is in flight (buttons disable while it runs). */
  busyStopId: string | null;
}

/**
 * Stop check-in, check-out and skip (offline-capable: the routes store queues them in the outbox, ordered per stop, with
 * the crew's last known position — never 0,0). Tells the crew when a write is held for reconnect, refused, or cannot be
 * made because the device has no position yet.
 */
export function useStopActions(): StopActions {
  const { t } = useTranslation();
  const toast = useToast();
  const [busyStopId, setBusyStopId] = useState<string | null>(null);

  const run = useCallback(
    async (routeInstanceStopId: string, write: () => Promise<WriteResult>, successKey: string) => {
      setBusyStopId(routeInstanceStopId);
      try {
        const result = await write();
        if (result.outcome === 'queued') toast.info(t('unit_routes.queued_offline'));
        else if (result.outcome === 'rejected') toast.error(t('unit_routes.action_rejected'));
        else toast.success(t(successKey));
      } catch {
        // The only synchronous refusal: no position fix to send with a check-in/out.
        toast.error(t('unit_routes.position_required'));
      } finally {
        setBusyStopId(null);
      }
    },
    [t, toast]
  );

  const checkIn = useCallback((id: string) => run(id, () => useRoutesStore.getState().checkIn(id), 'unit_routes.checked_in'), [run]);
  const checkOut = useCallback((id: string) => run(id, () => useRoutesStore.getState().checkOut(id), 'unit_routes.checked_out'), [run]);
  const skip = useCallback((id: string, reason: string) => run(id, () => useRoutesStore.getState().skip(id, reason), 'unit_routes.stop_skipped'), [run]);

  return { checkIn, checkOut, skip, busyStopId };
}
