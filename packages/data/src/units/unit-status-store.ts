import { getSetUnitStatusData, getUnitStatus, saveUnitStatus } from '@resgrid/api';
import type { CallResultData, CustomStatusResultData, GroupResultData, PoiResultData, PoiTypeResultData, SaveUnitStatusResult, UnitStatusInput, UnitStatusResultData, UnitStatusRoleInput } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { sortCallsNewestFirst } from '../calls/call-order';
import { assertV4Success, unwrapItem } from '../core/envelope';
import { defineIdempotentDataHandler, submitWrite, type WriteResult } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerQueuedMarkerSource, withoutMarkers } from '../core/queued-markers';
import { registerDataStoreReset } from '../core/reset';
import { type DataLocationFix, dataNow, getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';
import { gpsFields, statusTimestamps } from '../core/status-fields';
import { useUnitsStore } from './units-store';

export const UNIT_STATUS_SET_EVENT = 'units.status.set';

/** Destination lists (calls, stations, POIs) are re-read after this long (Unit status sheet). */
export const UNIT_DESTINATIONS_TTL_MS = 5 * 60 * 1000;

/** Writes of one unit's statuses replay strictly in order: the server treats the newest inserted row as current. */
export const unitStatusOrderKey = (unitId: string): string => `unit-status:${unitId}`;

export interface UnitStatusDestinations {
  calls: CallResultData[];
  stations: GroupResultData[];
  pois: PoiResultData[];
  poiTypes: PoiTypeResultData[];
  statuses: CustomStatusResultData[];
  fetchedAt: number;
}

export interface QueuedUnitStatus {
  localId: string;
  unitId: string;
  statusType: string;
  respondingTo: string;
  respondingToType: number | null;
  note: string;
  createdAt: number;
  state: 'queued' | 'rejected';
}

export interface SetUnitStatusInput {
  unitId: string;
  /** Custom status id / UnitStateType (string on the wire). */
  statusType: string;
  note?: string;
  /** Destination id: call, station or POI. */
  respondingTo?: string;
  /** Station = 1, Call = 2, POI = 3. */
  respondingToType?: number | null;
  /** Crew seats filed with the status (accountability). */
  roles?: { roleId: string; userId: string; name?: string }[];
  /** Fix to send; defaults to the last known position. */
  location?: DataLocationFix | null;
}

type UnitStatusSlice = 'destinations' | 'currentStatus';

interface UnitStatusData extends SliceMeta<UnitStatusSlice> {
  destinationsByUnit: Record<string, UnitStatusDestinations>;
  currentStatusByUnit: Record<string, UnitStatusResultData>;
  queuedStatuses: Record<string, QueuedUnitStatus>;
}

export interface UnitStatusState extends UnitStatusData {
  fetchDestinationData: (unitId: string, options?: FetchOptions) => Promise<void>;
  fetchCurrentStatus: (unitId: string, options?: FetchOptions) => Promise<void>;
  /** Offline-capable: ordered per unit through the outbox, sent now when online. */
  saveUnitStatus: (input: SetUnitStatusInput) => Promise<WriteResult>;
  applyQueuedStatus: (status: QueuedUnitStatus) => void;
  setQueuedStatusState: (localId: string, state: QueuedUnitStatus['state'] | null) => void;
}

type PersistedUnitStatus = Pick<UnitStatusData, 'destinationsByUnit' | 'currentStatusByUnit' | 'queuedStatuses' | 'fetchedAt'>;

const initialData = (): UnitStatusData => ({ ...emptySliceMeta<UnitStatusSlice>(), destinationsByUnit: {}, currentStatusByUnit: {}, queuedStatuses: {} });

// GetSetUnitStatusData includes server sentinels ("No Call", "No Station") that are not destinations.
const isSentinel = (id: string | undefined | null, name: string | undefined | null, sentinelName: string): boolean => {
  const normalizedId = id?.trim() ?? '';
  return normalizedId === '' || normalizedId === '0' || (name?.trim().toLowerCase() ?? '') === sentinelName;
};

export const isNoCallSentinel = (call: Pick<CallResultData, 'CallId' | 'Name'>): boolean => isSentinel(call.CallId, call.Name, 'no call');
export const isNoStationSentinel = (station: Pick<GroupResultData, 'GroupId' | 'Name'>): boolean => isSentinel(station.GroupId, station.Name, 'no station');

/** The newest status this device queued for a unit (shown as the unit's pending status until it syncs). */
export const selectPendingUnitStatus = (state: Pick<UnitStatusData, 'queuedStatuses'>, unitId: string): QueuedUnitStatus | undefined =>
  Object.values(state.queuedStatuses)
    .filter((status) => status.unitId === unitId && status.state === 'queued')
    // Newest wins; on a tie the later-queued one (insertion order).
    .reduce<QueuedUnitStatus | undefined>((newest, status) => (!newest || status.createdAt >= newest.createdAt ? status : newest), undefined);

let runner: SliceRunner<UnitStatusSlice, UnitStatusState>;

export const useUnitStatusStore = create<UnitStatusState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<UnitStatusSlice, UnitStatusState>('unit-status', set);
      return {
        ...initialData(),

        fetchDestinationData: async (unitId, options) => {
          const cached = get().destinationsByUnit[unitId];
          if (!options?.bypassCache && cached && dataNow() - cached.fetchedAt <= UNIT_DESTINATIONS_TTL_MS) return;
          await runner.run(
            'destinations',
            async () => unwrapItem(await getSetUnitStatusData(getDataApiContext(), { unitId })),
            (data, state) => ({
              destinationsByUnit: {
                ...state.destinationsByUnit,
                [unitId]: {
                  // Core sends these in storage order: newest first, like every other call list.
                  calls: sortCallsNewestFirst((data?.Calls ?? []).filter((call) => !isNoCallSentinel(call))),
                  stations: (data?.Stations ?? []).filter((station) => !isNoStationSentinel(station)),
                  pois: data?.DestinationPois ?? [],
                  poiTypes: data?.PoiTypes ?? [],
                  statuses: data?.Statuses ?? [],
                  fetchedAt: dataNow(),
                },
              },
            }),
            { flightKey: `destinations:${unitId}` }
          );
        },

        fetchCurrentStatus: async (unitId, options) => {
          await runner.run(
            'currentStatus',
            async () => unwrapItem(await getUnitStatus(getDataApiContext(), { unitId })),
            (status, state) => (status ? { currentStatusByUnit: { ...state.currentStatusByUnit, [unitId]: status } } : {}),
            { flightKey: `currentStatus:${unitId}`, trailing: options?.bypassCache === true }
          );
        },

        saveUnitStatus: async (input) => {
          const body: UnitStatusInput = {
            Id: input.unitId,
            Type: input.statusType,
            RespondingTo: input.respondingTo ?? '',
            RespondingToType: input.respondingToType ?? null,
            Note: input.note ?? '',
            ...statusTimestamps(dataNow()),
            ...gpsFields(input.location),
            Roles: (input.roles ?? []).map((role) => ({ RoleId: role.roleId, UserId: role.userId, Name: role.name ?? '' })),
          };
          return submitWrite<UnitStatusInput>({ type: UNIT_STATUS_SET_EVENT, payload: body, orderKey: unitStatusOrderKey(input.unitId) });
        },

        applyQueuedStatus: (status) => set((state) => ({ queuedStatuses: { ...state.queuedStatuses, [status.localId]: status } })),

        setQueuedStatusState: (localId, statusState) =>
          set((state) => {
            const existing = state.queuedStatuses[localId];
            if (!existing) return {};
            const queuedStatuses = { ...state.queuedStatuses };
            if (statusState === null) delete queuedStatuses[localId];
            else queuedStatuses[localId] = { ...existing, state: statusState };
            return { queuedStatuses };
          }),
      };
    },
    dataPersistOptions<UnitStatusState, PersistedUnitStatus>({
      name: 'omni-unit-status-storage',
      partialize: (state) => ({ destinationsByUnit: state.destinationsByUnit, currentStatusByUnit: state.currentStatusByUnit, queuedStatuses: state.queuedStatuses, fetchedAt: state.fetchedAt }),
      // Destination calls written by a build that kept the server's order are restored newest first: an offline start has no fetch to sort them.
      merge: (persisted, current) => {
        // SAFETY: zustand merges a blob this store's partialize wrote (no version or migrate yet), or undefined when nothing is stored.
        const state = { ...current, ...(persisted as Partial<PersistedUnitStatus> | undefined) };
        const destinationsByUnit = Object.fromEntries(Object.entries(state.destinationsByUnit).map(([unitId, destinations]) => [unitId, { ...destinations, calls: sortCallsNewestFirst(destinations.calls) }]));

        return { ...state, destinationsByUnit };
      },
    })
  )
);

registerPersistedStore('omni-unit-status-storage', useUnitStatusStore);
registerDataStoreReset<UnitStatusState>('unit-status', useUnitStatusStore, initialData, () => runner.invalidate());

registerQueuedMarkerSource('unit-status', {
  ids: () => Object.keys(useUnitStatusStore.getState().queuedStatuses),
  remove: (ids) => useUnitStatusStore.setState((state) => ({ queuedStatuses: withoutMarkers(state.queuedStatuses, ids) })),
});

/** Unit status set (Unit, IC; Dispatch on behalf): EventId = outbox id, so a replay is deduplicated (Core §8.6 item 3). */
export const unitStatusSetHandler = defineIdempotentDataHandler<UnitStatusInput, SaveUnitStatusResult>({
  type: UNIT_STATUS_SET_EVENT,
  optimisticApply: (event) => {
    const { payload } = event;
    useUnitStatusStore.getState().applyQueuedStatus({
      localId: event.id,
      unitId: payload.Id,
      statusType: payload.Type,
      respondingTo: payload.RespondingTo ?? '',
      respondingToType: payload.RespondingToType ?? null,
      note: payload.Note ?? '',
      createdAt: event.createdAt,
      state: 'queued',
    });
  },
  send: async (event, context) => {
    const roles: UnitStatusRoleInput[] = (event.payload.Roles ?? []).map((role) => ({ ...role, EventId: context.idempotencyKey }));
    return assertV4Success(await saveUnitStatus(getDataApiContext(), { ...event.payload, EventId: context.idempotencyKey, Roles: roles }));
  },
  afterAck: (event) => {
    useUnitStatusStore.getState().setQueuedStatusState(event.id, null);
  },
  // Not awaited by the outbox: a multi-unit status sends every unit without waiting on these reads in between.
  refresh: async (event) => {
    await Promise.all([useUnitStatusStore.getState().fetchCurrentStatus(event.payload.Id, { bypassCache: true }), useUnitsStore.getState().fetchUnitStatuses({ bypassCache: true })]);
  },
  rollback: (event, reason) => {
    useUnitStatusStore.getState().setQueuedStatusState(event.id, reason === 'discarded' ? null : 'rejected');
  },
});
