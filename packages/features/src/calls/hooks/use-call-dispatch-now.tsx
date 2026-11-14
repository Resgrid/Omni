import { buildDispatchList } from '@resgrid/api';
import { useCallQueueActionsStore, useCallsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { DispatchedEventResultData } from '@resgrid/models';
import { useToast } from '@resgrid/ui';
import React, { useCallback, useMemo, useState } from 'react';

import { CallConfirmDialog } from '../components/call-confirm-dialog';
import { DispatchSelectionModal } from '../components/dispatch-selection';
import { dispatchesToSelection, type DispatchSelection, EMPTY_DISPATCH_SELECTION, selectionSize, shownDispatchLists } from '../lib/dispatch-selection';
import { useDispatchRecipients, useNewCallFieldPolicy } from './use-call-form-data';

interface PickerTarget {
  callId: string;
  initialSelection: DispatchSelection;
  /** Recipients already proposed on the call; null when they could not be read. */
  proposedCount: number | null;
  /** Where the call is, so the picker ranks who is closest (Dispatch's nearest-unit board). */
  location: CallPoint | null;
}

type CallPoint = { latitude: number; longitude: number };

interface ConfirmTarget {
  kind: 'dispatch' | 'cancel';
  callId: string;
}

export interface UseCallDispatchNowOptions {
  /** After a call was dispatched (it is now Active) and the queues refreshed. */
  onDispatched?: (callId: string) => void;
  /** After a pending call was cancelled. */
  onCancelled?: (callId: string) => void;
}

export interface CallDispatchNowControls {
  /** Opens the dispatch picker preselected with the call's proposed recipients (fetched when not passed), ranked from the call's location when given. */
  openDispatchPicker: (callId: string, knownDispatches?: readonly DispatchedEventResultData[] | null, location?: CallPoint | null) => Promise<void>;
  /** Asks, then dispatches to the recipients already on the call (scheduled calls). */
  confirmDispatchNow: (callId: string) => void;
  /** Asks, then closes a pending call as Cancelled (nobody was paged, so nobody is told). */
  confirmCancelPending: (callId: string) => void;
  /** The call an action (or the proposed-recipients lookup) is running for. */
  busyCallId: string | null;
  /** Render once in the screen that uses the hook. */
  dialogs: React.ReactNode;
}

/**
 * Dispatching a Pending call, or a scheduled call ahead of its time, through `Calls/DispatchCallNow`, and cancelling a
 * Pending call (Dispatch baseline `use-call-dispatch-now`; the queues and the call detail). Confirming an empty pick falls back to the proposed
 * recipients, so the server dispatches whoever was proposed when the call was saved. The picker offers only the recipient
 * lists the department's New Call Form Fields show; with every list hidden it is just All Call ("0"), and leaving that off
 * sends the call to the recipients it was saved with. Online only.
 */
export function useCallDispatchNow({ onDispatched, onCancelled }: UseCallDispatchNowOptions = {}): CallDispatchNowControls {
  const { t } = useTranslation();
  const toast = useToast();
  const actionCallId = useCallQueueActionsStore((state) => state.busyCallId);
  const [lookupCallId, setLookupCallId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);
  const { recipients } = useDispatchRecipients(picker !== null);
  // The picker offers the recipient lists the department shows on its call forms; with none, only All Call.
  const policy = useNewCallFieldPolicy();
  const lists = useMemo(() => shownDispatchLists(policy.isVisible), [policy]);

  const runDispatch = useCallback(
    async (callId: string, dispatchList?: string) => {
      const outcome = await useCallQueueActionsStore.getState().dispatchNow(callId, dispatchList ? { dispatchList } : {});

      if (outcome.ok) {
        toast.success(t('call_queues.dispatch_now_success'));
        onDispatched?.(callId);
      } else {
        toast.error(t('call_queues.dispatch_now_error'));
      }
    },
    [onDispatched, t, toast]
  );

  const openDispatchPicker = useCallback(async (callId: string, knownDispatches?: readonly DispatchedEventResultData[] | null, location: CallPoint | null = null) => {
    let proposed: DispatchSelection | null = knownDispatches ? dispatchesToSelection(knownDispatches) : null;

    if (!proposed) {
      setLookupCallId(callId);
      // The picker still works without a preselection; an empty pick then lets the server use the proposed list.
      const extra = await useCallsStore.getState().fetchCallExtraData(callId, { bypassCache: true });
      setLookupCallId(null);
      proposed = extra ? dispatchesToSelection(extra.Dispatches) : null;
    }

    setPicker({ callId, initialSelection: proposed ?? EMPTY_DISPATCH_SELECTION, proposedCount: proposed ? selectionSize(proposed) : null, location });
  }, []);

  const handlePickerConfirm = useCallback(
    (selection: DispatchSelection) => {
      if (!picker) return;
      const dispatchList = buildDispatchList(selection);

      if (!dispatchList && picker.proposedCount === 0) {
        toast.error(t('call_queues.dispatch_now_no_recipients'));

        return;
      }

      setPicker(null);
      void runDispatch(picker.callId, dispatchList || undefined);
    },
    [picker, runDispatch, t, toast]
  );

  const handleConfirm = useCallback(async () => {
    if (!confirm) return;
    const target = confirm;
    setConfirm(null);

    if (target.kind === 'dispatch') {
      await runDispatch(target.callId);

      return;
    }

    const outcome = await useCallQueueActionsStore.getState().cancelPending(target.callId);

    if (outcome.ok) {
      toast.success(t('pending_calls.cancel_success'));
      onCancelled?.(target.callId);
    } else {
      toast.error(t('pending_calls.cancel_error'));
    }
  }, [confirm, onCancelled, runDispatch, t, toast]);

  const dialogs = (
    <>
      <DispatchSelectionModal
        isOpen={picker !== null}
        onClose={() => setPicker(null)}
        recipients={recipients}
        value={picker?.initialSelection ?? EMPTY_DISPATCH_SELECTION}
        callLocation={picker?.location ?? null}
        lists={lists}
        allCallHint={t('calls.all_call_dispatch_now_help')}
        onConfirm={handlePickerConfirm}
      />
      <CallConfirmDialog
        isOpen={confirm !== null}
        title={confirm?.kind === 'cancel' ? t('pending_calls.cancel_call') : t('call_queues.dispatch_now')}
        message={confirm?.kind === 'cancel' ? t('pending_calls.cancel_confirm') : t('call_queues.dispatch_now_confirm')}
        confirmLabel={confirm?.kind === 'cancel' ? t('pending_calls.cancel_call') : t('call_queues.dispatch_now')}
        cancelLabel={t('common.cancel')}
        destructive={confirm?.kind === 'cancel'}
        onConfirm={() => void handleConfirm()}
        onCancel={() => setConfirm(null)}
        testID="call-queue-confirm"
      />
    </>
  );

  return {
    openDispatchPicker,
    confirmDispatchNow: (callId) => setConfirm({ kind: 'dispatch', callId }),
    confirmCancelPending: (callId) => setConfirm({ kind: 'cancel', callId }),
    busyCallId: actionCallId ?? lookupCallId,
    dialogs,
  };
}
