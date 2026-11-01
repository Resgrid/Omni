import { selectUnitById, useUnitRolesStore, useUnitsStore, useUnitStatusStore } from '@resgrid/data';
import { type ActiveUnitRoleResultData, type StatusesResultData, type UnitTypeStatusResultData } from '@resgrid/models';
import React, { useCallback, useEffect, useMemo } from 'react';

import { locationForStatus } from '../lib/location-for-status';
import { type DestinationLists, getCurrentStatusCallId, resolveDefaultStatusCall } from '../lib/status-destination';
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
}

const NO_ROLES: ActiveUnitRoleResultData[] = [];
const EMPTY_LISTS: DestinationLists = { calls: [], stations: [], pois: [] };

/**
 * The unit status sheet: StatusPicker bound to the unit's status set (custom set by `CustomStatusSetId`, else the
 * built-in statuses), its destination lists (`GetSetUnitStatusData`), current status and crew seats. Saves through
 * the outbox, ordered per unit, so it works offline and a newer status can never overtake an older queued one.
 */
export const UnitStatusSheet: React.FC<UnitStatusSheetProps> = ({ isOpen, onClose, unitId: unitIdProp, isOnBehalf = false, initialStatusId, initialHoldConfirmed }) => {
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
  const activeCallId = isOnBehalf ? null : context.activeCallId;
  const currentRef = useMemo(() => ({ StateId: currentStatus?.StateId ?? unitInfo?.CurrentStatusId ?? null, BaseType: unitInfo?.CurrentStatusBaseType ?? null }), [currentStatus?.StateId, unitInfo]);
  const defaultCall = useMemo(() => resolveDefaultStatusCall(lists.calls, activeCallId, currentStatus), [activeCallId, currentStatus, lists.calls]);
  const hasPotentialDefaultCall = !!activeCallId || !!getCurrentStatusCallId(currentStatus);

  const sheetOpen = isOpen && !!unitId;
  const onActiveCallChange = context.onActiveCallChange;
  const handleSubmit = useCallback(
    async (selection: StatusSelection): Promise<StatusSubmitOutcome> => {
      if (!unitId) return 'rejected';
      const location = await locationForStatus(selection.status, isOnBehalf);
      // A call picked on the destination step becomes the crew's active call (never one carried silently).
      if (!isOnBehalf && selection.destination.type === 'call' && Number(selection.status.Detail ?? 0) > 0 && selection.destination.call.CallId !== activeCallId) {
        onActiveCallChange?.(selection.destination.call.CallId);
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
      initialStatusId={initialStatusId}
      initialHoldConfirmed={initialHoldConfirmed}
      onSubmitStatus={handleSubmit}
      testID="unit-status-sheet"
    />
  );
};
