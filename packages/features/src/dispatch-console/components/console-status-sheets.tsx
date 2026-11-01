import { isCallActiveState, isStationGroup, personnelFullName, useCallsStore, usePersonnelStatusStore, usePersonnelStore, usePoisStore, useUnitsStore, useUnitStatusStore } from '@resgrid/data';
import { type DestinationLists, locationForStatus, StatusPicker, type StatusSelection, type StatusSubmitOutcome, useStatusContext } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { useToast } from '@resgrid/ui';
import React, { useCallback, useEffect, useMemo } from 'react';

import { resolveCommonUnitStatusOptions } from '../lib/bulk-status';

/** Department-wide destination lists (open calls, stations, destination POIs) for on-behalf statuses. */
function useDestinationLists(isOpen: boolean): { lists: DestinationLists; isLoading: boolean } {
  const calls = useCallsStore((state) => state.calls);
  const isLoading = useCallsStore((state) => state.loading.calls === true);
  const groups = usePersonnelStore((state) => state.groups);
  const pois = usePoisStore((state) => state.destinationPois);

  useEffect(() => {
    if (!isOpen) return;
    if (usePersonnelStore.getState().groups.length === 0) void usePersonnelStore.getState().fetchGroups();
    void usePoisStore.getState().fetchDestinationPois();
  }, [isOpen]);

  const lists = useMemo<DestinationLists>(() => ({ calls: calls.filter((call) => isCallActiveState(call.State)), stations: groups.filter(isStationGroup), pois }), [calls, groups, pois]);
  return { lists, isLoading };
}

const combineOutcomes = (outcomes: readonly StatusSubmitOutcome[]): StatusSubmitOutcome => (outcomes.includes('rejected') ? 'rejected' : outcomes.includes('queued') ? 'queued' : 'sent');

export interface ConsoleUnitStatusSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** One unit ("+" set status for the filtered call) or a multi-unit selection. */
  unitIds: readonly string[];
  /** The call the status defaults to (the console's filtered call). */
  defaultCallId?: string | null;
  onSubmitted?: (outcome: StatusSubmitOutcome) => void;
}

/**
 * Unit status on behalf from the console (Dispatch baseline unit/bulk actions panels) on the shared StatusPicker: a
 * single unit with the filtered call as its default destination, or one status for a multi-unit selection — matched
 * across the units' status sets, each unit saved with its own status id. Every unit's status goes through the outbox,
 * ordered per unit, so it works offline and replays once.
 */
export const ConsoleUnitStatusSheet: React.FC<ConsoleUnitStatusSheetProps> = ({ isOpen, onClose, unitIds, defaultCallId = null, onSubmitted }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const context = useStatusContext();
  const unitInfos = useUnitsStore((state) => state.unitInfos);
  const statusSets = useUnitsStore((state) => state.unitTypeStatuses);
  const { lists, isLoading } = useDestinationLists(isOpen);

  const units = useMemo(() => unitIds.map((id) => unitInfos.find((unit) => unit.UnitId === id)).filter((unit): unit is NonNullable<typeof unit> => !!unit), [unitIds, unitInfos]);
  const options = useMemo(() => resolveCommonUnitStatusOptions(units, statusSets), [statusSets, units]);
  const statuses = useMemo(() => options.map((option) => option.status), [options]);
  const defaultCall = useMemo(() => (defaultCallId ? (lists.calls.find((call) => call.CallId === defaultCallId) ?? null) : null), [defaultCallId, lists.calls]);
  const subjectName = units.length === 1 ? units[0].Name : t('dispatch.bulk_unit_actions.selected_count', { count: units.length });

  useEffect(() => {
    if (isOpen && statusSets.length === 0) void useUnitsStore.getState().fetchUnits();
  }, [isOpen, statusSets.length]);

  const handleSubmit = useCallback(
    async (selection: StatusSelection): Promise<StatusSubmitOutcome> => {
      const option = options.find((entry) => entry.status === selection.status || String(entry.status.Id) === String(selection.status.Id));
      if (!option) return 'rejected';
      const location = await locationForStatus(selection.status, true);
      const results = await Promise.all(
        units.map((unit) =>
          useUnitStatusStore.getState().saveUnitStatus({
            unitId: unit.UnitId,
            statusType: String(option.statusByUnitId[unit.UnitId].Id),
            note: selection.note,
            respondingTo: selection.respondingTo,
            respondingToType: selection.respondingToType,
            location,
          })
        )
      );
      const outcome = combineOutcomes(results.map((result) => result.outcome));
      if (units.length > 1 && outcome === 'rejected') toast.error(t('dispatch.bulk_unit_actions.partial_failure'));
      onSubmitted?.(outcome);
      return outcome;
    },
    [onSubmitted, options, t, toast, units]
  );

  return (
    <StatusPicker
      isOpen={isOpen ? units.length > 0 : false}
      onClose={onClose}
      subject="unit"
      subjectName={subjectName}
      isOnBehalf
      statuses={statuses}
      destinations={lists}
      isLoadingDestinations={isLoading}
      defaultCall={defaultCall}
      lenientDestinations
      holdToConfirm={context.holdToConfirm}
      onSubmitStatus={handleSubmit}
      testID="console-unit-status-sheet"
    />
  );
};

export interface ConsolePersonnelStatusSheetProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  defaultCallId?: string | null;
  onSubmitted?: (outcome: StatusSubmitOutcome) => void;
}

/** A member's status on behalf with the filtered call as its default destination (outbox, ordered per member). */
export const ConsolePersonnelStatusSheet: React.FC<ConsolePersonnelStatusSheetProps> = ({ isOpen, onClose, userId, defaultCallId = null, onSubmitted }) => {
  const context = useStatusContext();
  const statusOptions = usePersonnelStore((state) => state.statusOptions);
  const person = usePersonnelStore((state) => (userId ? state.personnel.find((row) => row.UserId === userId) : undefined));
  const { lists, isLoading } = useDestinationLists(isOpen);
  const defaultCall = useMemo(() => (defaultCallId ? (lists.calls.find((call) => call.CallId === defaultCallId) ?? null) : null), [defaultCallId, lists.calls]);

  useEffect(() => {
    if (isOpen && usePersonnelStore.getState().statusOptions.length === 0) void usePersonnelStore.getState().fetchStatusOptions();
  }, [isOpen]);

  const handleSubmit = useCallback(
    async (selection: StatusSelection): Promise<StatusSubmitOutcome> => {
      if (!userId) return 'rejected';
      const result = await usePersonnelStatusStore.getState().setStatus({
        userId,
        statusType: String(selection.status.Id),
        note: selection.note,
        respondingTo: selection.respondingTo,
        respondingToType: selection.respondingToType,
        location: await locationForStatus(selection.status, true),
      });
      onSubmitted?.(result.outcome);
      return result.outcome;
    },
    [onSubmitted, userId]
  );

  return (
    <StatusPicker
      isOpen={isOpen ? !!userId : false}
      onClose={onClose}
      subject="personnel"
      subjectName={person ? personnelFullName(person) : undefined}
      isOnBehalf
      statuses={statusOptions}
      current={person ? { StateId: person.StatusId ?? null, BaseType: person.StatusBaseType ?? null } : null}
      destinations={lists}
      isLoadingDestinations={isLoading}
      defaultCall={defaultCall}
      holdToConfirm={context.holdToConfirm}
      onSubmitStatus={handleSubmit}
      testID="console-personnel-status-sheet"
    />
  );
};
