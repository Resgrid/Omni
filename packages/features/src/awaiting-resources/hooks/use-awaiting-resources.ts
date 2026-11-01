import { type AwaitingActionOutcome, useAwaitingResourcesStore } from '@resgrid/data';
import { useIsRunCardConditionsEnabled } from '@resgrid/features/runcards';
import { useTranslation } from '@resgrid/i18n';
import { OutstandingRequirementsAlertKind } from '@resgrid/models';
import { useRealtimeEvent } from '@resgrid/realtime';
import { useToast } from '@resgrid/ui';
import { useCallback, useEffect } from 'react';

/** How long the informational "dispatched automatically" toast stays up. */
export const AUTO_DISPATCH_TOAST_MS = 10000;

/**
 * Awaiting resources is part of conditional run cards: the variant ships run cards and the department has
 * Dispatch.RunCards and Dispatch.RunCardConditions on. Off means no request, no state, no UI.
 */
export const useIsAwaitingResourcesEnabled = (): boolean => useIsRunCardConditionsEnabled();

/**
 * Keeps the awaiting-resources list live for the signed-in shell (mount once, e.g. through `AwaitingResourcesHost`):
 * loads the list and the response code catalog, refreshes on every `outstandingRequirementsUpdated` push and after an
 * eventing hub rejoin, raises unit-available alerts and announces automatic dispatches. Turning the flags off clears it.
 */
export function useAwaitingResourcesSync(enabledOverride?: boolean): void {
  const { t } = useTranslation();
  const toast = useToast();
  const flagEnabled = useIsAwaitingResourcesEnabled();
  const enabled = enabledOverride ?? flagEnabled;

  useEffect(() => {
    const store = useAwaitingResourcesStore.getState();
    if (!enabled) {
      store.disable();
      return;
    }
    void store.fetchAwaitingCalls();
    void store.fetchResponseCodes();
  }, [enabled]);

  useRealtimeEvent(
    'outstandingRequirementsUpdated',
    (id, payload) => {
      const alert = useAwaitingResourcesStore.getState().handleOutstandingRequirementsUpdated(id, payload);
      if (alert?.kind === OutstandingRequirementsAlertKind.AutoDispatched) {
        toast.info(alert.message || t('awaiting_resources.auto_dispatched_fallback'), t('awaiting_resources.auto_dispatched_title'), { duration: AUTO_DISPATCH_TOAST_MS });
      }
    },
    enabled
  );

  useRealtimeEvent(
    'eventingHubJoined',
    (info) => {
      // The hub replays nothing: after an outage the list may be stale.
      if (info.rejoin) void useAwaitingResourcesStore.getState().fetchAwaitingCalls({ bypassCache: true });
    },
    enabled
  );
}

/** Dispatch-to-call and dismiss with the outcome toasts every surface shows (server message when it sent one). */
export function useAwaitingResourceActions(): {
  dispatchUnit: (callId: number, unitId: number) => Promise<boolean>;
  dismissRequirement: (callId: number, requirementId: number, note?: string) => Promise<boolean>;
} {
  const { t } = useTranslation();
  const toast = useToast();

  const report = useCallback(
    (outcome: AwaitingActionOutcome, successKey: string, errorKey: string): boolean => {
      if (outcome.ok) toast.success(outcome.message || t(successKey));
      else toast.error(outcome.message || t(errorKey));
      return outcome.ok;
    },
    [t, toast]
  );

  const dispatchUnit = useCallback(
    async (callId: number, unitId: number) => report(await useAwaitingResourcesStore.getState().dispatchUnit(callId, unitId), 'awaiting_resources.dispatch_success', 'awaiting_resources.dispatch_error'),
    [report]
  );

  const dismissRequirement = useCallback(
    async (callId: number, requirementId: number, note?: string) =>
      report(await useAwaitingResourcesStore.getState().dismissRequirement(callId, requirementId, note?.trim() || undefined), 'awaiting_resources.dismiss_success', 'awaiting_resources.dismiss_error'),
    [report]
  );

  return { dispatchUnit, dismissRequirement };
}
