import { useCapability } from '@resgrid/config';
import { selectCallById, sortByCheckInSeverity, useCallsStore, useCheckInTimersStore } from '@resgrid/data';
import { canCheckInTimer, CheckInSheet, type CheckInTarget, CheckInTimerCard, checkInTimerTitle } from '@resgrid/features/check-in';
import { useStatusContext } from '@resgrid/features/status';
import type { CheckInTimerStatusResultData } from '@resgrid/models';
import { View } from '@resgrid/ui';
import React, { useEffect, useMemo, useState } from 'react';

const NO_TIMERS: CheckInTimerStatusResultData[] = [];
/** Timer statuses are re-read this often while the console shows them (the card ticks locally in between). */
export const CHECK_IN_SUMMARY_POLL_MS = 60_000;

export interface CheckInSummaryProps {
  activeCallId: string | null;
  pollMs?: number;
  testID?: string;
}

/**
 * The most urgent check-in timer of the active call on the console (Unit `check-in-sidebar-widget`), with the check-in
 * action when this device may record it (variant `checkIn.self` for the active unit). Check-ins go through the outbox.
 * Renders nothing when the call has no timers.
 */
export const CheckInSummary: React.FC<CheckInSummaryProps> = ({ activeCallId, pollMs = CHECK_IN_SUMMARY_POLL_MS, testID = 'unit-check-in-summary' }) => {
  const capability = useCapability('checkIn');
  const { activeUnitId } = useStatusContext();
  const timersEnabled = useCallsStore((state) => (activeCallId ? (selectCallById(state, activeCallId)?.CheckInTimersEnabled ?? false) : false));
  const callId = activeCallId ? Number(activeCallId) : NaN;
  const timers = useCheckInTimersStore((state) => (Number.isFinite(callId) ? (state.statusesByCall[String(callId)] ?? NO_TIMERS) : NO_TIMERS));
  const [target, setTarget] = useState<CheckInTarget | null>(null);

  useEffect(() => {
    if (!timersEnabled || !Number.isFinite(callId)) return undefined;
    void useCheckInTimersStore.getState().fetchTimerStatuses(callId);
    if (pollMs <= 0) return undefined;
    const handle = setInterval(() => void useCheckInTimersStore.getState().fetchTimerStatuses(callId, { silent: true }), pollMs);
    return () => clearInterval(handle);
  }, [callId, pollMs, timersEnabled]);

  const urgent = useMemo(() => sortByCheckInSeverity(timers)[0] ?? null, [timers]);
  const ability = useMemo(() => ({ self: capability.self, others: capability.others }), [capability.others, capability.self]);
  const canCheckIn = urgent ? canCheckInTimer(urgent, ability, { userId: null, unitIds: activeUnitId ? [activeUnitId] : [] }) : false;

  if (!timersEnabled || !urgent || !Number.isFinite(callId)) return null;

  return (
    <View testID={testID}>
      <CheckInTimerCard
        timer={urgent}
        showCheckInButton={canCheckIn ? capability.actions : false}
        onCheckIn={(timer) => setTarget({ checkInType: timer.TargetType, unitId: timer.UnitId ?? (activeUnitId ? Number(activeUnitId) : null), name: checkInTimerTitle(timer) || undefined })}
        testID={`${testID}-timer`}
      />
      <CheckInSheet isOpen={target !== null} onClose={() => setTarget(null)} callId={callId} ability={ability} target={target} testID={`${testID}-sheet`} />
    </View>
  );
};
