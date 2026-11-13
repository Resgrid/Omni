import { isCallActiveState, isStationGroup, personnelFullName, useCallsStore, usePersonnelStatusStore, usePersonnelStore, usePoisStore, useUnitsStore, useUnitStatusStore } from '@resgrid/data';
import { toDestinationOrigin } from '@resgrid/features/pois/lib/poi-availability';
import {
  type DestinationLists,
  getCurrentTransportPoiId,
  locationForStatus,
  StatusPicker,
  type StatusSelection,
  StatusSubmitError,
  type StatusSubmitOutcome,
  toRespondingTo,
  useStatusContext,
} from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import { refreshConsoleUnits } from '../hooks/use-console-data';
import { destinationForUnitStatus, resolveCommonUnitStatusOptions } from '../lib/bulk-status';

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

/** The console's rule for on-behalf destinations: an older call-only status also takes a station or POI. */
const LENIENT_DESTINATIONS = true;

export interface ConsoleUnitStatusSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** One unit ("+" set status for the filtered call) or a multi-unit selection. */
  unitIds: readonly string[];
  /** The call the status defaults to (the console's filtered call). */
  defaultCallId?: string | null;
  /** A submit saved (sent or queued) these units; on a partial failure, only the ones it saved. */
  onSubmitted?: (outcome: StatusSubmitOutcome, savedUnitIds: readonly string[]) => void;
}

/**
 * Unit status on behalf from the console (Dispatch baseline unit/bulk actions panels) on the shared StatusPicker: a
 * single unit with the filtered call as its default destination, or one status for a multi-unit selection — matched
 * across the units' status sets, each unit saved with its own status id and only the destination its own status takes.
 * Every unit's status goes through the outbox, ordered per unit, so it works offline and replays once. When the server
 * refuses some units of a group, the sheet stays open naming them, and submitting the same status again sends only those.
 */
export const ConsoleUnitStatusSheet: React.FC<ConsoleUnitStatusSheetProps> = ({ isOpen, onClose, unitIds, defaultCallId = null, onSubmitted }) => {
  const { t } = useTranslation();
  const context = useStatusContext();
  const unitInfos = useUnitsStore((state) => state.unitInfos);
  const statusSets = useUnitsStore((state) => state.unitTypeStatuses);
  const { lists, isLoading } = useDestinationLists(isOpen);
  // The units a partly refused submit saved, by status option: they are not sent that status twice.
  const savedRef = useRef<{ key: string; unitIds: ReadonlySet<string> } | null>(null);
  const unitIdsKey = unitIds.join(',');

  const units = useMemo(() => unitIds.map((id) => unitInfos.find((unit) => unit.UnitId === id)).filter((unit): unit is NonNullable<typeof unit> => !!unit), [unitIds, unitInfos]);
  const options = useMemo(() => resolveCommonUnitStatusOptions(units, statusSets), [statusSets, units]);
  const statuses = useMemo(() => options.map((option) => option.status), [options]);
  const defaultCall = useMemo(() => (defaultCallId ? (lists.calls.find((call) => call.CallId === defaultCallId) ?? null) : null), [defaultCallId, lists.calls]);
  const subjectName = units.length === 1 ? units[0].Name : t('dispatch.bulk_unit_actions.selected_count', { count: units.length });

  // One unit: the hospital it already reported going to (a group has no single one).
  const currentTransportPoiId =
    units.length === 1 ? getCurrentTransportPoiId({ baseType: units[0].CurrentStatusBaseType, destinationId: units[0].CurrentDestinationId, destinationType: units[0].CurrentDestinationType }) : null;

  // One unit: destinations ranked from where it is; a group has no single position.
  const destinationOrigin = units.length === 1 ? toDestinationOrigin(units[0].Latitude, units[0].Longitude) : null;

  useEffect(() => {
    if (isOpen && statusSets.length === 0) void useUnitsStore.getState().fetchUnits();
  }, [isOpen, statusSets.length]);

  useEffect(() => {
    savedRef.current = null;
  }, [isOpen, unitIdsKey]);

  const handleSubmit = useCallback(
    async (selection: StatusSelection): Promise<StatusSubmitOutcome> => {
      const option = options.find((entry) => entry.status === selection.status || String(entry.status.Id) === String(selection.status.Id));

      if (!option) return 'rejected';
      const alreadySaved = savedRef.current?.key === option.key ? savedRef.current.unitIds : new Set<string>();
      const location = await locationForStatus(selection.status, true);

      const results = await Promise.all(
        units
          .filter((unit) => !alreadySaved.has(unit.UnitId))
          .map(async (unit) => {
            const unitStatus = option.statusByUnitId[unit.UnitId];
            const { respondingTo, respondingToType } = toRespondingTo(destinationForUnitStatus(unitStatus, selection.destination, defaultCall, LENIENT_DESTINATIONS));
            const result = await useUnitStatusStore.getState().saveUnitStatus({ unitId: unit.UnitId, statusType: String(unitStatus.Id), note: selection.note, respondingTo, respondingToType, location });

            return { unit, outcome: result.outcome };
          })
      );

      const saved = results.filter((result) => result.outcome !== 'rejected');
      const refused = results.filter((result) => result.outcome === 'rejected');
      const savedOutcome: StatusSubmitOutcome = saved.some((result) => result.outcome === 'queued') ? 'queued' : 'sent';

      // One re-read of the rows for the whole selection, as soon as the server has the statuses (the realtime ping
      // follows): the outbox's own reads after each status refresh the status lists, not these rows.
      if (saved.some((result) => result.outcome === 'sent')) void refreshConsoleUnits();

      if (saved.length > 0)
        onSubmitted?.(
          savedOutcome,
          saved.map((result) => result.unit.UnitId)
        );

      if (refused.length === 0) {
        savedRef.current = null;

        return savedOutcome;
      }

      if (units.length === 1) return 'rejected';
      savedRef.current = { key: option.key, unitIds: new Set([...alreadySaved, ...saved.map((result) => result.unit.UnitId)]) };
      throw new StatusSubmitError(t('dispatch.bulk_unit_actions.partial_failure', { units: refused.map((result) => result.unit.Name).join(', ') }));
    },
    [defaultCall, onSubmitted, options, t, units]
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
      lenientDestinations={LENIENT_DESTINATIONS}
      holdToConfirm={context.holdToConfirm}
      transportDestinationChecks={context.transportDestinationChecks}
      currentTransportPoiId={currentTransportPoiId}
      destinationOrigin={destinationOrigin}
      destinationUnitId={units.length === 1 ? units[0].UnitId : null}
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
