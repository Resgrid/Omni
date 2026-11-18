import { useCapability } from '@resgrid/config';
import { type RecurringOccurrenceAction, recurringOccurrenceKey, type RecurringOccurrenceOutcome, useRecurringCallAlertsStore, useRecurringCallsStore } from '@resgrid/data';
import { CallConfirmDialog } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import type { RecurringCallOccurrenceInput } from '@resgrid/models';
import { notificationSoundService } from '@resgrid/notifications';
import { useRealtimeEvent } from '@resgrid/realtime';
import { useToast } from '@resgrid/ui';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/** At most one foreground refresh per this interval (app switching bursts). */
export const ALERTS_FOREGROUND_REFRESH_MS = 10000;

/** Recurring calls are a desk module: the variant ships them (`capabilities.calls.recurringCalls`). Off means no request, no state, no UI. */
export const useIsRecurringCallsEnabled = (): boolean => useCapability('calls').recurringCalls;

/**
 * Keeps the recurring call alerts live for the signed-in shell (mount once, through `RecurringCallAlertsHost`): loads them,
 * reads them again on every `recurringCallAlertsUpdated` push, after an eventing hub rejoin and when the app comes back to
 * the foreground, and announces new alerts with a toast and the notification sound. Off clears the store.
 */
export function useRecurringCallAlertsSync(enabledOverride?: boolean): void {
  const { t } = useTranslation();
  const toast = useToast();
  const capability = useIsRecurringCallsEnabled();
  const enabled = enabledOverride ?? capability;
  const lastNewAt = useRecurringCallAlertsStore((state) => state.lastNewAt);
  const announcedAt = useRef(lastNewAt);

  useEffect(() => {
    const store = useRecurringCallAlertsStore.getState();

    if (!enabled) {
      store.disable();

      return;
    }

    void store.fetchAlerts();
  }, [enabled]);

  useRealtimeEvent('recurringCallAlertsUpdated', () => void useRecurringCallAlertsStore.getState().fetchAlerts({ bypassCache: true }), enabled);

  useRealtimeEvent(
    'eventingHubJoined',
    (info) => {
      // The hub replays nothing: after an outage the list may be stale.
      if (info.rejoin) void useRecurringCallAlertsStore.getState().fetchAlerts({ bypassCache: true });
    },
    enabled
  );

  useEffect(() => {
    if (!enabled) return undefined;
    let lastRefresh = Date.now();
    let trailing: ReturnType<typeof setTimeout> | null = null;

    const cancelTrailing = () => {
      if (trailing !== null) clearTimeout(trailing);
      trailing = null;
    };

    const refresh = () => {
      cancelTrailing();
      lastRefresh = Date.now();
      void useRecurringCallAlertsStore.getState().fetchAlerts({ bypassCache: true });
    };

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        cancelTrailing();

        return;
      }

      // Back within the interval: one refresh when it ends, so a return during an app-switching burst is not lost.
      const wait = ALERTS_FOREGROUND_REFRESH_MS - (Date.now() - lastRefresh);

      if (wait <= 0) refresh();
      else if (trailing === null) trailing = setTimeout(refresh, wait);
    });

    return () => {
      cancelTrailing();
      subscription.remove();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || lastNewAt === 0 || lastNewAt === announcedAt.current) return;
    const count = useRecurringCallAlertsStore.getState().newAlertIds.length;

    // Seen in the meantime (the alerts screen marked them): nothing to announce.
    if (count === 0) return;
    announcedAt.current = lastNewAt;

    toast.warning(t('recurring_calls.alerts.new_toast', { count }), t('recurring_calls.alerts.title'));
    void notificationSoundService.playForNotification({ kind: 'recurringCallAlert' });
  }, [enabled, lastNewAt, t, toast]);
}

const callLabel = (outcome: RecurringOccurrenceOutcome): string => outcome.callNumber || (outcome.callId ? String(outcome.callId) : '');

export interface OccurrenceActionControls {
  /** Runs an action and reports how it went; sending asks first (it pages people). */
  request: (action: RecurringOccurrenceAction, occurrence: RecurringCallOccurrenceInput) => void;
  /** The occurrences and schedules writes are running for. */
  busyKeys: readonly string[];
  /** Render once in the screen that uses the hook. */
  dialogs: React.ReactNode;
}

/**
 * The occurrence actions every surface offers (calendar, alerts, schedule detail) with the same outcome toasts: Send now
 * (asks first; Dispatched, or Held when nobody could be sent), Create call (scheduled when still to come, pending when
 * due), Skip and Restore.
 */
export function useOccurrenceActions(onDone?: (action: RecurringOccurrenceAction, outcome: RecurringOccurrenceOutcome) => void): OccurrenceActionControls {
  const { t } = useTranslation();
  const toast = useToast();
  const busyKeys = useRecurringCallsStore((state) => state.busyKeys);
  const [confirm, setConfirm] = useState<RecurringCallOccurrenceInput | null>(null);

  const report = useCallback(
    (action: RecurringOccurrenceAction, outcome: RecurringOccurrenceOutcome) => {
      const call = callLabel(outcome);

      if (action === 'dispatch' && outcome.ok && outcome.outcome === 'Held') toast.warning(t('recurring_calls.occurrence.held', { call }));
      else if (action === 'dispatch' && outcome.ok) toast.success(t('recurring_calls.occurrence.dispatched', { call }));
      else if (action === 'create' && outcome.ok) toast.success(t('recurring_calls.occurrence.created', { call }));
      else if (action === 'skip' && outcome.ok) toast.success(t('recurring_calls.occurrence.skipped'));
      else if (action === 'restore' && outcome.ok) toast.success(t('recurring_calls.occurrence.restored'));
      else toast.error(outcome.error ? t(outcome.error.messageKey) : t('recurring_calls.occurrence.failed'), t('recurring_calls.occurrence.failed_title'));
    },
    [t, toast]
  );

  const run = useCallback(
    async (action: RecurringOccurrenceAction, occurrence: RecurringCallOccurrenceInput) => {
      // An action already running on this occurrence reports for itself; a second press says nothing twice.
      if (useRecurringCallsStore.getState().busyKeys.includes(recurringOccurrenceKey(occurrence))) return;
      const outcome = await useRecurringCallsStore.getState().runOccurrenceAction(action, occurrence);
      report(action, outcome);
      onDone?.(action, outcome);
    },
    [onDone, report]
  );

  const request = useCallback(
    (action: RecurringOccurrenceAction, occurrence: RecurringCallOccurrenceInput) => {
      if (action === 'dispatch') setConfirm(occurrence);
      else void run(action, occurrence);
    },
    [run]
  );

  const dialogs = (
    <CallConfirmDialog
      isOpen={confirm !== null}
      title={t('recurring_calls.occurrence.send_now')}
      message={t('recurring_calls.occurrence.send_now_confirm')}
      confirmLabel={t('recurring_calls.occurrence.send_now')}
      cancelLabel={t('common.cancel')}
      onConfirm={() => {
        const occurrence = confirm;
        setConfirm(null);

        if (occurrence) void run('dispatch', occurrence);
      }}
      onCancel={() => setConfirm(null)}
      testID="occurrence-send-confirm"
    />
  );

  return { request, busyKeys, dialogs };
}
