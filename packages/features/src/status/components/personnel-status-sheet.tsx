import { useAuthStore } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { isCallActiveState, isStationGroup, personnelFullName, useCallsStore, usePersonnelStatusStore, usePersonnelStore, usePoisStore } from '@resgrid/data';
import React, { useCallback, useEffect, useMemo } from 'react';

import { locationForStatus } from '../lib/location-for-status';
import { type DestinationLists, getCurrentStatusCallId, resolveDefaultStatusCall } from '../lib/status-destination';
import { useStatusContext } from '../status-context';
import { type StaffingSelection, StatusPicker, type StatusPickerTab, type StatusSelection, type StatusSubmitOutcome } from './status-picker';

export interface PersonnelStatusSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Another member (Dispatch, `status.onBehalf`); omitted = the signed-in user. */
  userId?: string | null;
  initialTab?: StatusPickerTab;
  initialStatusId?: number | string | null;
  initialHoldConfirmed?: boolean;
}

/**
 * Personnel status and staffing: StatusPicker bound to the department's personnel status and staffing options, the
 * open calls, stations and destination POIs, and the member's current status. Writes go through the outbox ordered
 * per member (offline-capable). The staffing tab appears where the variant has `capabilities.status.staffing`.
 */
export const PersonnelStatusSheet: React.FC<PersonnelStatusSheetProps> = ({ isOpen, onClose, userId, initialTab = 'status', initialStatusId, initialHoldConfirmed }) => {
  const context = useStatusContext();
  const statusCapability = useCapability('status');
  const sessionUserId = useAuthStore((state) => state.userId);
  const targetUserId = userId || sessionUserId;
  const isOnBehalf = !!userId && userId !== sessionUserId;

  const statusOptions = usePersonnelStore((state) => state.statusOptions);
  const staffingOptions = usePersonnelStore((state) => state.staffingOptions);
  const groups = usePersonnelStore((state) => state.groups);
  const person = usePersonnelStore((state) => (targetUserId ? state.personnel.find((row) => row.UserId === targetUserId) : undefined));
  const ownStatus = usePersonnelStatusStore((state) => state.currentStatus);
  const ownStaffing = usePersonnelStatusStore((state) => state.currentStaffing);
  const calls = useCallsStore((state) => state.calls);
  const isLoadingCalls = useCallsStore((state) => state.loading.calls === true);
  const pois = usePoisStore((state) => state.destinationPois);

  useEffect(() => {
    if (!isOpen) return;
    const personnel = usePersonnelStore.getState();
    if (personnel.statusOptions.length === 0 || personnel.staffingOptions.length === 0) void personnel.fetchStatusOptions();
    if (personnel.groups.length === 0) void personnel.fetchGroups();
    void useCallsStore.getState().fetchCalls();
    void usePoisStore.getState().fetchDestinationPois();
    if (!isOnBehalf) {
      void usePersonnelStatusStore.getState().fetchCurrentStatus();
      void usePersonnelStatusStore.getState().fetchCurrentStaffing();
    }
  }, [isOnBehalf, isOpen]);

  const lists = useMemo<DestinationLists>(() => ({ calls: calls.filter((call) => isCallActiveState(call.State)), stations: groups.filter(isStationGroup), pois }), [calls, groups, pois]);

  const currentStatusRef = useMemo(
    () => (isOnBehalf ? { StateId: person?.StatusId ?? null, BaseType: person?.StatusBaseType ?? null } : { StateId: ownStatus?.StatusType ?? person?.StatusId ?? null, BaseType: person?.StatusBaseType ?? null }),
    [isOnBehalf, ownStatus?.StatusType, person]
  );
  const currentStaffingRef = useMemo(
    () =>
      isOnBehalf ? { StateId: person?.StaffingId ?? null, BaseType: person?.StaffingBaseType ?? null } : { StateId: ownStaffing?.StaffingType ?? person?.StaffingId ?? null, BaseType: person?.StaffingBaseType ?? null },
    [isOnBehalf, ownStaffing?.StaffingType, person]
  );
  const currentDestination = useMemo(
    () => (isOnBehalf ? { DestinationId: person?.StatusDestinationId ?? null, DestinationType: person?.StatusDestinationType ?? null } : ownStatus),
    [isOnBehalf, ownStatus, person?.StatusDestinationId, person?.StatusDestinationType]
  );
  const activeCallId = isOnBehalf ? null : context.activeCallId;
  const defaultCall = useMemo(() => resolveDefaultStatusCall(lists.calls, activeCallId, currentDestination), [activeCallId, currentDestination, lists.calls]);

  const handleSubmitStatus = useCallback(
    async (selection: StatusSelection): Promise<StatusSubmitOutcome> => {
      const location = await locationForStatus(selection.status, isOnBehalf);
      const result = await usePersonnelStatusStore.getState().setStatus({
        ...(isOnBehalf && userId ? { userId } : {}),
        statusType: String(selection.status.Id),
        note: selection.note,
        respondingTo: selection.respondingTo,
        respondingToType: selection.respondingToType,
        ...(location === undefined ? {} : { location }),
      });
      return result.outcome;
    },
    [isOnBehalf, userId]
  );

  const handleSubmitStaffing = useCallback(
    async (selection: StaffingSelection): Promise<StatusSubmitOutcome> => {
      const result = await usePersonnelStatusStore.getState().setStaffing({ ...(isOnBehalf && userId ? { userId } : {}), staffingType: String(selection.staffing.Id), note: selection.note });
      return result.outcome;
    },
    [isOnBehalf, userId]
  );

  return (
    <StatusPicker
      isOpen={isOpen}
      onClose={onClose}
      subject="personnel"
      subjectName={person ? personnelFullName(person) : undefined}
      isOnBehalf={isOnBehalf}
      statuses={statusOptions}
      current={currentStatusRef}
      staffingOptions={staffingOptions}
      currentStaffing={currentStaffingRef}
      showStaffing={statusCapability.staffing}
      initialTab={initialTab}
      destinations={lists}
      isLoadingDestinations={isLoadingCalls}
      defaultCall={defaultCall}
      hasPotentialDefaultCall={!!activeCallId || !!getCurrentStatusCallId(currentDestination)}
      holdToConfirm={context.holdToConfirm}
      initialStatusId={initialStatusId}
      initialHoldConfirmed={initialHoldConfirmed}
      onSubmitStatus={handleSubmitStatus}
      onSubmitStaffing={handleSubmitStaffing}
      testID="personnel-status-sheet"
    />
  );
};
