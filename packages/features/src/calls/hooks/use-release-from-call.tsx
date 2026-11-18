import type { ReleaseResourceKind } from '@resgrid/api';
import { useAuthStore } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { logger } from '@resgrid/core/logging/logger';
import { type CallReleaseOutcome, useCallDetailStore, useCallsStore, usePersonnelStore, useUnitsStore, useUnitStatusStore } from '@resgrid/data';
import { useStatusContext } from '@resgrid/features/status/status-context';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { Checkbox, CheckboxIcon, CheckboxIndicator, CheckboxLabel, Text, useToast } from '@resgrid/ui';
import { CheckIcon } from '@resgrid/ui/icon';
import React, { useCallback, useEffect, useState } from 'react';

import { CallConfirmDialog } from '../components/call-confirm-dialog';
import { classifyReleaseError, type ReleasableCall, RELEASE_TEXT_KEYS, type ReleaseFailure, type ReleasePermissions, resolveReleasePermissions } from '../lib/call-release';
import { useCallRights } from './use-call-permissions';
import { useIsOnline } from './use-connectivity';

/** A unit or person to release from the call. */
export interface ReleaseTarget {
  kind: ReleaseResourceKind;
  /** The unit's id, or the person's user id. */
  id: string;
  /** How the confirmation and the toasts name them. */
  name: string;
}

/** The call fields a release reads: whether it can release, and its number for the confirmation. */
export type ReleaseCall = ReleasableCall & Pick<CallResultData, 'CallId' | 'Number'>;

export interface UseReleaseFromCallOptions {
  /** The call released from; none (not loaded yet) offers no release. */
  call: ReleaseCall | null | undefined;
  /** After a release went through, once the call, its dispatches and the released resource's list have been read again. */
  onReleased?: (release: CallRelease, outcome: CallReleaseOutcome) => void;
  /**
   * Whether a unit or person can still be released here (the screen's current rows). A confirmation open for one that has
   * left the call meanwhile (released by another operator, stood down) closes, so it cannot reopen for them later.
   */
  isReleasable?: (target: CallRelease) => boolean;
  testID?: string;
}

export interface ReleaseFromCall {
  /** Who this member may release from the call in this app. */
  permissions: ReleasePermissions;
  /** Opens the confirmation for a unit or person on the call. */
  requestRelease: (target: ReleaseTarget) => void;
  /** Render once in the screen that uses the hook. */
  dialog: React.ReactNode;
}

/** A release asked for: who, from which call. */
export interface CallRelease extends ReleaseTarget {
  callId: string;
  /** The call's number as the confirmation shows it (its id when it has none). */
  callNumber: string;
}

/**
 * Re-reads what a release changed: the call's dispatches (call cards) and the released unit's or person's status. Settles
 * when every read has (the reads never fail the release: a failed one keeps the last copy).
 */
const refreshAfterRelease = async (pending: CallRelease): Promise<void> => {
  const reads: Promise<void>[] = [useCallsStore.getState().fetchCallDispatches([pending.callId], { bypassCache: true })];

  if (pending.kind === 'personnel') {
    reads.push(usePersonnelStore.getState().fetchPersonnel({ bypassCache: true }));
  } else {
    reads.push(useUnitsStore.getState().fetchUnitInfos({ bypassCache: true }));
    const unitStatus = useUnitStatusStore.getState();

    // The unit's own status (Unit's console), when this device shows it or is reading it now: a read that left before
    // the release would otherwise land the old status with nothing after it (a trailing read follows it).
    if (unitStatus.currentStatusByUnit[pending.id] !== undefined || unitStatus.loading.currentStatus === true) reads.push(unitStatus.fetchCurrentStatus(pending.id, { bypassCache: true }));
  }

  await Promise.allSettled(reads);
};

/**
 * Releasing (standing down) a unit or person from an open call that stays open: the ambulance on scene stands the MUG
 * down and the MUG is free for the next call. `permissions` says who may be released here (the dispatch desks: anyone on
 * the call, for members who may edit it; Unit: the crew's own unit); `requestRelease` opens the confirmation (with
 * "Notify", on by default); confirming posts `Calls/ReleaseUnit` or `Calls/ReleasePersonnel`, re-reads what changed and
 * says how it went, "status kept" when the server left the status alone. Online only, like closing a call: the server
 * decides whether the release status applies, so offline the confirmation says it needs a connection.
 */
export function useReleaseFromCall({ call, onReleased, isReleasable, testID = 'release-from-call' }: UseReleaseFromCallOptions): ReleaseFromCall {
  const { t } = useTranslation();
  const toast = useToast();
  const isOnline = useIsOnline();
  const calls = useCapability('calls');
  const { subject } = useCapability('status');
  const { activeUnitId } = useStatusContext();
  const rights = useCallRights();
  const userId = useAuthStore((state) => state.userId);
  const [pending, setPending] = useState<CallRelease | null>(null);
  const [notify, setNotify] = useState(true);
  const [isReleasing, setIsReleasing] = useState(false);

  // Read on every render: whether a scheduled call has gone out depends on the clock.
  const permissions = resolveReleasePermissions({ calls, statusSubject: subject, activeUnitId, rights, userId, call });
  const callId = call?.CallId ?? null;
  const callNumber = call?.Number || callId || '';

  const requestRelease = useCallback(
    (target: ReleaseTarget) => {
      if (!callId) return;
      setNotify(true);
      setPending({ ...target, callId, callNumber });
    },
    [callId, callNumber]
  );

  const close = useCallback(() => {
    if (!isReleasing) setPending(null);
  }, [isReleasing]);

  // The target left the call while its confirmation was open: close it rather than keep it for whoever comes next.
  useEffect(() => {
    if (pending && !isReleasing && isReleasable && !isReleasable(pending)) setPending(null);
  }, [isReleasable, isReleasing, pending]);

  /** A release the server refused or could not take: says why, and keeps the dialog open only when trying again can help. */
  const reportFailure = (failure: ReleaseFailure, target: CallRelease) => {
    if (failure.kind === 'offline') toast.error(t('calls.release.offline'));
    else if (failure.kind === 'retry') toast.error(t('calls.release.error', { name: target.name }));
    else {
      // Sending it again cannot change a refusal (already released, no longer on the call, call closed): close, say
      // why, and catch this screen up with the call as it is now.
      setPending(null);
      toast.error(failure.kind === 'forbidden' ? t('calls.release.not_allowed', { name: target.name }) : (failure.message ?? t('calls.release.error', { name: target.name })));
      void useCallDetailStore.getState().fetchCallDetail(target.callId, { bypassCache: true });
      void refreshAfterRelease(target);
    }
  };

  const confirm = async () => {
    if (!pending || isReleasing) return;

    if (!isOnline) {
      toast.error(t('calls.release.offline'));

      return;
    }

    const target = pending;
    const keys = RELEASE_TEXT_KEYS[target.kind];
    let outcome: CallReleaseOutcome | null;
    setIsReleasing(true);

    try {
      outcome = await useCallDetailStore.getState().releaseFromCall({ kind: target.kind, callId: target.callId, resourceId: target.id, notify });
    } catch (error) {
      setIsReleasing(false);
      reportFailure(classifyReleaseError(error), target);

      return;
    }

    // The server has taken the release: nothing after this point reports it as failed.
    setPending(null);
    setIsReleasing(false);

    if (!outcome) {
      toast.error(t('call_detail.not_found'));

      return;
    }

    toast.success(outcome.statusApplied ? t(keys.success, { name: target.name }) : t(keys.statusKept, { name: target.name }));
    await refreshAfterRelease(target);

    try {
      onReleased?.(target, outcome);
    } catch (error) {
      // The screen's own follow-up failed, not the release.
      logger.warn({ message: 'A release follow-up failed', context: { kind: target.kind, errorType: error instanceof Error ? error.name : 'unknown' } });
    }
  };

  const name = pending?.name ?? '';

  const dialog = (
    <CallConfirmDialog
      isOpen={pending !== null}
      title={t('calls.release.title', { name, number: pending?.callNumber ?? '' })}
      message={t('calls.release.message', { name })}
      confirmLabel={t('calls.release.confirm')}
      cancelLabel={t('common.cancel')}
      destructive
      isBusy={isReleasing}
      isConfirmDisabled={!isOnline}
      onConfirm={() => void confirm()}
      onCancel={close}
      testID={testID}
    >
      {isOnline ? null : (
        <Text size="sm" className="text-warning-700" testID={`${testID}-offline`}>
          {t('calls.release.offline')}
        </Text>
      )}
      <Checkbox value="notify" isChecked={notify} onChange={setNotify} isDisabled={isReleasing} aria-label={t('calls.release.notify', { name })} testID={`${testID}-notify`}>
        <CheckboxIndicator>
          <CheckboxIcon as={CheckIcon} />
        </CheckboxIndicator>
        <CheckboxLabel>{t('calls.release.notify', { name })}</CheckboxLabel>
      </Checkbox>
      <Text size="xs" className="text-typography-500">
        {t('calls.release.notify_hint')}
      </Text>
    </CallConfirmDialog>
  );

  return { permissions, requestRelease, dialog };
}
