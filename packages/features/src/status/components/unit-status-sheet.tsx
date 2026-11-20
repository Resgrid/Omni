import { selectUnitById, useUnitRolesStore, useUnitsStore, useUnitStatusStore } from '@resgrid/data';
import type { CallUnitCandidate } from '@resgrid/features/calls/lib/call-release';
import { toDestinationOrigin } from '@resgrid/features/pois/lib/poi-availability';
import { type ActiveUnitRoleResultData, type CallResultData, type StatusesResultData, type UnitTypeStatusResultData } from '@resgrid/models';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import { useWorkingCallDispatches } from '../hooks/use-working-call-dispatches';
import { deferActiveCallEvents } from '../lib/active-call-events';
import { locationForStatus } from '../lib/location-for-status';
import { type DestinationLists, getCurrentStatusCallId, getCurrentTransportPoiId, resolveDefaultStatusCall, resolveUnitWorkingCall } from '../lib/status-destination';
import { getUnitStatusOptions } from '../lib/unit-status-set';
import { useStatusContext } from '../status-context';
import { StatusPicker, type StatusSelection, type StatusSubmitOutcome } from './status-picker';

export interface UnitStatusSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** The unit to set; defaults to the active unit from the StatusProvider (Unit). */
  unitId?: string | null;
  /** Dispatch: setting another unit's status (no GPS, no active-call change). */
  isOnBehalf?: boolean;
  initialStatusId?: number | string | null;
  initialHoldConfirmed?: boolean;
  /** Unit "Set Active" on a call's detail: the status is for this call, so the sheet asks for the status and a note, not a destination. */
  fixedCall?: CallResultData | null;
}

const NO_ROLES: ActiveUnitRoleResultData[] = [];
const EMPTY_LISTS: DestinationLists = { calls: [], stations: [], pois: [] };

/**
 * The unit status sheet: StatusPicker bound to the unit's status set (custom set by `CustomStatusSetId`, else the
 * built-in statuses), its destination lists (`GetSetUnitStatusData`), current status and crew seats. Saves through
 * the outbox, ordered per unit, so it works offline and a newer status can never overtake an older queued one.
 */
export const UnitStatusSheet: React.FC<UnitStatusSheetProps> = ({ isOpen, onClose, unitId: unitIdProp, isOnBehalf = false, initialStatusId, initialHoldConfirmed, fixedCall = null }) => {
  const context = useStatusContext();
  const unitId = unitIdProp ?? context.activeUnitId;

  const unit = useUnitsStore((state) => (unitId ? selectUnitById(state, unitId) : undefined));
  const unitInfo = useUnitsStore((state) => (unitId ? state.unitInfos.find((info) => info.UnitId === unitId) : undefined));
  const statusSets = useUnitsStore((state) => state.unitTypeStatuses);
  const destinations = useUnitStatusStore((state) => (unitId ? state.destinationsByUnit[unitId] : undefined));
  const isLoadingDestinations = useUnitStatusStore((state) => state.loading.destinations === true);
  const hasDestinationError = useUnitStatusStore((state) => !!state.errors.destinations);
  const currentStatus = useUnitStatusStore((state) => (unitId ? state.currentStatusByUnit[unitId] : undefined));
  const assignments = useUnitRolesStore((state) => (unitId ? (state.assignmentsByUnit[unitId] ?? NO_ROLES) : NO_ROLES));

  const owner = unit ?? unitInfo ?? null;
  const statuses = useMemo(() => getUnitStatusOptions<StatusesResultData, UnitTypeStatusResultData>(statusSets, owner), [owner, statusSets]);

  useEffect(() => {
    if (!isOpen || !unitId) return;
    void useUnitStatusStore.getState().fetchDestinationData(unitId);
    void useUnitStatusStore.getState().fetchCurrentStatus(unitId);

    if (statusSets.length === 0) void useUnitsStore.getState().fetchUnits();
    // Destination lists are re-read per open; the status sets only when missing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, unitId]);

  const lists = useMemo<DestinationLists>(() => (destinations ? { calls: destinations.calls, stations: destinations.stations, pois: destinations.pois } : EMPTY_LISTS), [destinations]);
  // On behalf (Dispatch): the dispatches of every call it may go to, the last way to tell which call the unit works.
  const callDispatches = useWorkingCallDispatches(lists.calls, isOnBehalf && isOpen);
  const activeCallId = isOnBehalf ? null : context.activeCallId;
  const currentRef = useMemo(() => ({ StateId: currentStatus?.StateId ?? unitInfo?.CurrentStatusId ?? null, BaseType: unitInfo?.CurrentStatusBaseType ?? null }), [currentStatus?.StateId, unitInfo]);
  // The crew's own sheet defaults to their active call. On behalf, the dispatcher gets the call the unit is working (its
  // `ActiveCallId`, its status's call, else its one open dispatch), so a transport status pre-selects that call's destination too.
  const workingUnit = useMemo<CallUnitCandidate | null>(() => (unitId ? { UnitId: unitId, Name: owner?.Name ?? '', ActiveCallId: unitInfo?.ActiveCallId ?? null } : null), [owner?.Name, unitId, unitInfo?.ActiveCallId]);

  // Until its current status is read, the unit's reported destination (as the transport destination below falls back to).
  const workingCurrent = useMemo(() => currentStatus ?? (unitInfo ? { DestinationId: unitInfo.CurrentDestinationId, DestinationType: unitInfo.CurrentDestinationType } : null), [currentStatus, unitInfo]);

  const defaultCall = useMemo(
    () => (isOnBehalf ? resolveUnitWorkingCall(lists.calls, workingUnit, workingCurrent, callDispatches) : resolveDefaultStatusCall(lists.calls, activeCallId, currentStatus)),
    [activeCallId, callDispatches, currentStatus, isOnBehalf, lists.calls, workingCurrent, workingUnit]
  );

  const hasPotentialDefaultCall = !!activeCallId || !!getCurrentStatusCallId(currentStatus) || (isOnBehalf && !!unitInfo?.ActiveCallId);

  const currentTransportPoiId = useMemo(
    () =>
      getCurrentTransportPoiId({
        baseType: unitInfo?.CurrentStatusBaseType,
        destinationId: currentStatus ? currentStatus.DestinationId : unitInfo?.CurrentDestinationId,
        destinationType: currentStatus ? currentStatus.DestinationType : unitInfo?.CurrentDestinationType,
      }),
    [currentStatus, unitInfo]
  );

  const destinationOrigin = useMemo(() => toDestinationOrigin(unitInfo?.Latitude, unitInfo?.Longitude), [unitInfo?.Latitude, unitInfo?.Longitude]);

  const sheetOpen = isOpen && !!unitId;
  const onActiveCallChange = context.onActiveCallChange;

  // A new active call picked here is announced once this sheet closes (what follows it — a call's route opening navigation —
  // must not open under the sheet).
  const releaseEventsRef = useRef<(() => void) | null>(null);

  // Open and mounted: a submit that resumes after the sheet closed (or unmounted) takes no hold, as nothing would release it.
  const isLiveRef = useRef(false);

  const releaseActiveCallEvents = useCallback(() => {
    releaseEventsRef.current?.();
    releaseEventsRef.current = null;
  }, []);

  useEffect(() => {
    isLiveRef.current = sheetOpen;

    if (!sheetOpen) releaseActiveCallEvents();

    return () => {
      isLiveRef.current = false;
    };
  }, [releaseActiveCallEvents, sheetOpen]);

  useEffect(() => releaseActiveCallEvents, [releaseActiveCallEvents]);

  const handleSubmit = useCallback(
    async (selection: StatusSelection): Promise<StatusSubmitOutcome> => {
      if (!unitId) return 'rejected';
      const location = await locationForStatus(selection.status, isOnBehalf);

      // A call picked on the destination step becomes the crew's active call (never one carried silently).
      if (!isOnBehalf && selection.destination.type === 'call' && Number(selection.status.Detail ?? 0) > 0 && selection.destination.call.CallId !== activeCallId && onActiveCallChange) {
        // Closed meanwhile: the change is announced at once (there is no sheet left for it to open under).
        if (isLiveRef.current) releaseEventsRef.current ??= deferActiveCallEvents();
        onActiveCallChange(selection.destination.call.CallId);
      }

      const result = await useUnitStatusStore.getState().saveUnitStatus({
        unitId,
        statusType: String(selection.status.Id),
        note: selection.note,
        respondingTo: selection.respondingTo,
        respondingToType: selection.respondingToType,
        roles: assignments.filter((seat) => !!seat.UserId?.trim()).map((seat) => ({ roleId: seat.UnitRoleId, userId: seat.UserId, name: seat.Name })),
        ...(location === undefined ? {} : { location }),
      });

      return result.outcome;
    },
    [activeCallId, assignments, isOnBehalf, onActiveCallChange, unitId]
  );

  return (
    <StatusPicker
      isOpen={sheetOpen}
      onClose={onClose}
      subject="unit"
      subjectName={owner?.Name}
      isOnBehalf={isOnBehalf}
      statuses={statuses}
      current={currentRef}
      destinations={lists}
      isLoadingDestinations={isLoadingDestinations || (isOpen && !destinations && !hasDestinationError)}
      defaultCall={defaultCall}
      hasPotentialDefaultCall={hasPotentialDefaultCall}
      lenientDestinations
      holdToConfirm={context.holdToConfirm}
      transportDestinationChecks={context.transportDestinationChecks}
      currentTransportPoiId={currentTransportPoiId}
      destinationOrigin={destinationOrigin}
      destinationUnitId={unitId}
      initialStatusId={initialStatusId}
      initialHoldConfirmed={initialHoldConfirmed}
      fixedCall={isOnBehalf ? null : fixedCall}
      onSubmitStatus={handleSubmit}
      testID="unit-status-sheet"
    />
  );
};
