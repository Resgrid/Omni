import {
  acknowledgeDeviation,
  cancelRoute,
  checkInAtStop,
  checkOutFromStop,
  endRoute,
  geofenceCheckIn,
  getActiveRouteForUnit,
  getInstanceDirections,
  getRouteHistory,
  getRoutePlan,
  getRoutePlans,
  getRoutePlansForUnit,
  getRouteProgress,
  getStopContact,
  getStopsForInstance,
  getUnacknowledgedDeviations,
  pauseRoute,
  resumeRoute,
  skipStop,
  startRoute,
  updateStopNotes,
} from '@resgrid/api';
import type {
  RouteDeviationResultData,
  RouteDirectionsResultData,
  RouteInstanceResultData,
  RouteInstanceStopResultData,
  RoutePlanDetailResultData,
  RoutePlanResultData,
  RouteProgressResultData,
  RouteStopContactResultData,
  RouteStopWithDetailsResultData,
  SaveRoutePlanResult,
} from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapItem, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { defineDataHandler, submitWrite, type WriteResult } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { type DataLocationFix, dataNow, getDataApiContext, getDataLocationFix } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

/** Core `RouteInstanceStatus`. RD11: Unit sent 2 (Completed) for pause; paused is 5. */
export const RouteInstanceStatus = { Scheduled: 0, InProgress: 1, Completed: 2, Cancelled: 3, Abandoned: 4, Paused: 5 } as const;
/** Core instance-stop status (`RouteService`): 0 pending, 1 checked in, 2 checked out, 3 skipped. */
export const RouteStopStatus = { Pending: 0, CheckedIn: 1, CheckedOut: 2, Skipped: 3 } as const;
/** Core `RouteStopCheckInType`. */
export const RouteStopCheckInType = { Manual: 0, Geofence: 1, QrCode: 2 } as const;

export const ROUTE_STOP_CHECK_IN_EVENT = 'routes.stop.checkIn';
export const ROUTE_STOP_CHECK_OUT_EVENT = 'routes.stop.checkOut';
export const ROUTE_STOP_SKIP_EVENT = 'routes.stop.skip';

/** Check-in, check-out and skip of one stop replay in order. */
export const routeStopOrderKey = (routeInstanceStopId: string): string => `route-stop:${routeInstanceStopId}`;

export interface RouteProgressCounts {
  total: number;
  completed: number;
  skipped: number;
  pending: number;
}

export interface RouteStopWritePayload {
  routeInstanceId: string;
  routeInstanceStopId: string;
  latitude: number;
  longitude: number;
  reason?: string | null;
  /** Status before the optimistic update, restored if the server refuses. */
  previousStatus: number;
  at: number;
}

/** A past (or another unit's) route instance, read for the history screens without touching the live route. */
export interface RouteInstanceDetail {
  progress: RouteProgressResultData | null;
  stops: RouteStopWithDetailsResultData[];
}

type RoutesSlice = 'plans' | 'plan' | 'active' | 'progress' | 'stops' | 'directions' | 'deviations' | 'history' | 'stopContact' | 'instanceDetail';

interface RoutesData extends SliceMeta<RoutesSlice> {
  routePlans: RoutePlanResultData[];
  activePlan: RoutePlanDetailResultData | null;
  activeInstance: RouteInstanceResultData | null;
  progress: RouteProgressCounts | null;
  /** Instance stop progress (from GetRouteProgress / GetActiveRouteForUnit). */
  instanceStops: RouteInstanceStopResultData[];
  /** Plan stops joined with progress (GetStopsForInstance), for the stop list and navigation. */
  stopDetails: RouteStopWithDetailsResultData[];
  directions: RouteDirectionsResultData | null;
  deviations: RouteDeviationResultData[];
  routeHistory: RouteInstanceResultData[];
  /** Stop contacts by plan stop id (Unit offline scope: contacts of the route's stops). */
  stopContactsById: Record<string, RouteStopContactResultData>;
  /** History instance details by instance id (online reads; never persisted). */
  instanceDetailsById: Record<string, RouteInstanceDetail>;
  isTracking: boolean;
  actionError: DataError | null;
}

export interface RoutesState extends RoutesData {
  fetchRoutePlans: (unitId: number | string, options?: FetchOptions) => Promise<void>;
  fetchAllRoutePlans: (options?: FetchOptions) => Promise<void>;
  fetchRoutePlan: (routePlanId: string, options?: FetchOptions) => Promise<void>;
  startRouteInstance: (routePlanId: string, unitId: number) => Promise<boolean>;
  endRouteInstance: (instanceId: string) => Promise<boolean>;
  pauseRouteInstance: (instanceId: string) => Promise<boolean>;
  resumeRouteInstance: (instanceId: string) => Promise<boolean>;
  cancelRouteInstance: (instanceId: string, reason?: string) => Promise<boolean>;
  fetchActiveRoute: (unitId: number | string, options?: FetchOptions) => Promise<void>;
  /** RD11: applies `Data.Instance` and the stops; never replaces the instance with the progress object. */
  fetchRouteProgress: (instanceId: string, options?: FetchOptions) => Promise<void>;
  fetchStopsForInstance: (instanceId: string, options?: FetchOptions) => Promise<void>;
  /** RD11: routes from the unit's position (passed, else the last known fix), not from the first remaining stop. */
  fetchDirections: (instanceId: string, position?: { latitude: number; longitude: number } | null) => Promise<void>;
  /** Offline-capable stop check-in with the crew's coordinates. */
  checkIn: (routeInstanceStopId: string, location?: DataLocationFix | null) => Promise<WriteResult>;
  /** Offline-capable stop check-out; RD10: coordinates are always sent (Unit stored 0,0). */
  checkOut: (routeInstanceStopId: string, location?: DataLocationFix | null) => Promise<WriteResult>;
  skip: (routeInstanceStopId: string, reason: string) => Promise<WriteResult>;
  /** RD13: geofence arrival (navigation calls it inside a stop radius below walking speed). Online only. */
  performGeofenceCheckIn: (unitId: number, latitude: number, longitude: number) => Promise<boolean>;
  updateNotes: (routeInstanceStopId: string, notes: string) => Promise<boolean>;
  fetchDeviations: () => Promise<void>;
  ackDeviation: (deviationId: string) => Promise<boolean>;
  fetchRouteHistory: (routePlanId: string) => Promise<void>;
  /** A stop's contact (`GetStopContact/{routeStopId}` — the plan stop id, not the instance stop id). Cached copy offline. */
  fetchStopContact: (routeStopId: string, options?: FetchOptions) => Promise<RouteStopContactResultData | null>;
  /** A history instance (progress + stops) without replacing the live route's state. */
  fetchInstanceDetail: (instanceId: string, options?: FetchOptions) => Promise<RouteInstanceDetail | null>;
  clearActiveRoute: () => void;
  applyStopStatus: (routeInstanceStopId: string, status: number, at: number | null, patch?: Partial<RouteInstanceStopResultData>) => void;
}

const initialData = (): RoutesData => ({
  ...emptySliceMeta<RoutesSlice>(),
  routePlans: [],
  activePlan: null,
  activeInstance: null,
  progress: null,
  instanceStops: [],
  stopDetails: [],
  directions: null,
  deviations: [],
  routeHistory: [],
  stopContactsById: {},
  instanceDetailsById: {},
  isTracking: false,
  actionError: null,
});

const clearedRoute = (): Pick<RoutesData, 'activeInstance' | 'progress' | 'instanceStops' | 'stopDetails' | 'directions' | 'deviations' | 'isTracking'> => ({
  activeInstance: null,
  progress: null,
  instanceStops: [],
  stopDetails: [],
  directions: null,
  deviations: [],
  isTracking: false,
});

/** Applies a GetRouteProgress / GetActiveRouteForUnit payload (RD11 fix). */
export const applyRouteProgress = (data: RouteProgressResultData | null): Partial<RoutesData> => {
  if (!data?.Instance) return clearedRoute();
  return {
    activeInstance: data.Instance,
    instanceStops: Array.isArray(data.Stops) ? data.Stops : [],
    progress: { total: data.TotalStops, completed: data.CompletedStops, skipped: data.SkippedStops, pending: data.PendingStops },
    isTracking: data.Instance.Status === RouteInstanceStatus.InProgress,
  };
};

const positionOrFix = (location?: DataLocationFix | null): { latitude: number; longitude: number } | null => {
  const fix = location ?? getDataLocationFix();
  return fix && Number.isFinite(fix.latitude) && Number.isFinite(fix.longitude) ? { latitude: fix.latitude, longitude: fix.longitude } : null;
};

const stopStatusOf = (state: RoutesData, routeInstanceStopId: string): number =>
  state.instanceStops.find((stop) => stop.RouteInstanceStopId === routeInstanceStopId)?.Status ?? state.stopDetails.find((stop) => stop.RouteInstanceStopId === routeInstanceStopId)?.Status ?? RouteStopStatus.Pending;

/** Retention for cached stop contacts (plan §8.2a): the newest this many, oldest dropped first. */
export const STOP_CONTACTS_MAX = 200;
/** History instance details kept in memory (not persisted). */
export const INSTANCE_DETAILS_MAX = 20;

const withoutKey = <T>(record: Record<string, T>, key: string): Record<string, T> => {
  if (!(key in record)) return record;
  const copy = { ...record };
  delete copy[key];
  return copy;
};

/** Keeps the last `max` entries in insertion order (newest last). */
const keepNewest = <T>(record: Record<string, T>, max: number): Record<string, T> => {
  const keys = Object.keys(record);
  if (keys.length <= max) return record;
  return Object.fromEntries(keys.slice(keys.length - max).map((key) => [key, record[key]]));
};

class MissingPositionError extends Error {
  constructor() {
    super('A stop check-in/out needs the crew position.');
    this.name = 'MissingPositionError';
  }
}

let runner: SliceRunner<RoutesSlice, RoutesState>;

export const useRoutesStore = create<RoutesState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<RoutesSlice, RoutesState>('routes', set);
      const ctx = () => getDataApiContext();
      const act = async (fn: () => Promise<void>): Promise<boolean> => {
        set({ actionError: null });
        try {
          await fn();
          return true;
        } catch (error) {
          set({ actionError: toDataError(error) });
          return false;
        }
      };
      const setInstanceStatus = (instanceId: string, status: number) =>
        set((state) => (state.activeInstance?.RouteInstanceId === instanceId ? { activeInstance: { ...state.activeInstance, Status: status }, isTracking: status === RouteInstanceStatus.InProgress } : {}));
      const queueStopWrite = (type: string, routeInstanceStopId: string, location: DataLocationFix | null | undefined, reason?: string): Promise<WriteResult> => {
        const state = get();
        const position = positionOrFix(location);
        if (!position && type !== ROUTE_STOP_SKIP_EVENT) throw new MissingPositionError();
        const payload: RouteStopWritePayload = {
          routeInstanceId: state.activeInstance?.RouteInstanceId ?? '',
          routeInstanceStopId,
          latitude: position?.latitude ?? 0,
          longitude: position?.longitude ?? 0,
          reason: reason ?? null,
          previousStatus: stopStatusOf(state, routeInstanceStopId),
          at: dataNow(),
        };
        return submitWrite<RouteStopWritePayload>({ type, payload, orderKey: routeStopOrderKey(routeInstanceStopId) });
      };

      return {
        ...initialData(),

        fetchRoutePlans: async (unitId) => {
          await runner.run(
            'plans',
            async () => unwrapList(await getRoutePlansForUnit(ctx(), { unitId })),
            (routePlans) => ({ routePlans })
          );
        },
        fetchAllRoutePlans: async () => {
          await runner.run(
            'plans',
            async () => unwrapList(await getRoutePlans(ctx())),
            (routePlans) => ({ routePlans })
          );
        },
        fetchRoutePlan: async (routePlanId) => {
          await runner.run(
            'plan',
            async () => unwrapItem(await getRoutePlan(ctx(), { id: routePlanId })),
            (activePlan) => ({ activePlan }),
            { flightKey: `plan:${routePlanId}` }
          );
        },

        startRouteInstance: (routePlanId, unitId) =>
          act(async () => {
            const instance = unwrapItem(assertV4Success(await startRoute(ctx(), { RoutePlanId: routePlanId, UnitId: unitId })));
            set({ activeInstance: instance, isTracking: instance !== null });
            if (instance) await Promise.all([get().fetchRouteProgress(instance.RouteInstanceId), get().fetchStopsForInstance(instance.RouteInstanceId)]);
          }),
        endRouteInstance: (instanceId) =>
          act(async () => {
            assertV4Success(await endRoute(ctx(), { RouteInstanceId: instanceId }));
            set(clearedRoute());
          }),
        pauseRouteInstance: (instanceId) =>
          act(async () => {
            assertV4Success(await pauseRoute(ctx(), { RouteInstanceId: instanceId }));
            setInstanceStatus(instanceId, RouteInstanceStatus.Paused);
          }),
        resumeRouteInstance: (instanceId) =>
          act(async () => {
            assertV4Success(await resumeRoute(ctx(), { RouteInstanceId: instanceId }));
            setInstanceStatus(instanceId, RouteInstanceStatus.InProgress);
          }),
        cancelRouteInstance: (instanceId, reason) =>
          act(async () => {
            assertV4Success(await cancelRoute(ctx(), { RouteInstanceId: instanceId, Reason: reason ?? null }));
            set(clearedRoute());
          }),

        fetchActiveRoute: async (unitId, options) => {
          await runner.run(
            'active',
            async () => unwrapItem(await getActiveRouteForUnit(ctx(), { unitId })),
            (data) => applyRouteProgress(data),
            { trailing: options?.bypassCache === true }
          );
        },
        fetchRouteProgress: async (instanceId, options) => {
          await runner.run(
            'progress',
            async () => unwrapItem(await getRouteProgress(ctx(), { instanceId })),
            (data) => (data?.Instance ? applyRouteProgress(data) : {}),
            {
              flightKey: `progress:${instanceId}`,
              trailing: options?.bypassCache === true,
            }
          );
        },
        fetchStopsForInstance: async (instanceId) => {
          await runner.run(
            'stops',
            async () => unwrapList(await getStopsForInstance(ctx(), { instanceId })),
            (stopDetails) => ({ stopDetails }),
            { flightKey: `stops:${instanceId}` }
          );
        },
        fetchDirections: async (instanceId, position) => {
          const from = position ?? positionOrFix();
          await runner.run(
            'directions',
            async () => unwrapItem(await getInstanceDirections(ctx(), { instanceId, ...(from ? { latitude: from.latitude, longitude: from.longitude } : {}) })),
            (directions) => ({ directions }),
            { flightKey: `directions:${instanceId}` }
          );
        },

        checkIn: (routeInstanceStopId, location) => queueStopWrite(ROUTE_STOP_CHECK_IN_EVENT, routeInstanceStopId, location),
        checkOut: (routeInstanceStopId, location) => queueStopWrite(ROUTE_STOP_CHECK_OUT_EVENT, routeInstanceStopId, location),
        skip: (routeInstanceStopId, reason) => queueStopWrite(ROUTE_STOP_SKIP_EVENT, routeInstanceStopId, null, reason),

        performGeofenceCheckIn: (unitId, latitude, longitude) =>
          act(async () => {
            assertV4Success(await geofenceCheckIn(ctx(), { UnitId: unitId, Latitude: latitude, Longitude: longitude }));
            const instanceId = get().activeInstance?.RouteInstanceId;
            if (instanceId) await get().fetchRouteProgress(instanceId, { bypassCache: true });
          }),
        updateNotes: (routeInstanceStopId, notes) =>
          act(async () => {
            assertV4Success(await updateStopNotes(ctx(), { RouteInstanceStopId: routeInstanceStopId, Notes: notes }));
            get().applyStopStatus(routeInstanceStopId, stopStatusOf(get(), routeInstanceStopId), null, { Notes: notes });
          }),

        fetchDeviations: async () => {
          await runner.run(
            'deviations',
            async () => unwrapList(await getUnacknowledgedDeviations(ctx())),
            (deviations) => ({ deviations })
          );
        },
        ackDeviation: (deviationId) =>
          act(async () => {
            assertV4Success(await acknowledgeDeviation(ctx(), { id: deviationId }));
            set((state) => ({ deviations: state.deviations.filter((deviation) => deviation.RouteDeviationId !== deviationId) }));
          }),
        fetchRouteHistory: async (routePlanId) => {
          await runner.run(
            'history',
            async () => unwrapList(await getRouteHistory(ctx(), { routePlanId })),
            (routeHistory) => ({ routeHistory }),
            { flightKey: `history:${routePlanId}` }
          );
        },
        fetchStopContact: async (routeStopId, options) => {
          const cached = get().stopContactsById[routeStopId];
          if (cached && !options?.bypassCache) return cached;
          const result = await runner.run(
            'stopContact',
            async () => unwrapItem(await getStopContact(ctx(), { routeStopId })),
            (contact, state) => (contact ? { stopContactsById: keepNewest({ ...withoutKey(state.stopContactsById, routeStopId), [routeStopId]: contact }, STOP_CONTACTS_MAX) } : {}),
            { flightKey: `stopContact:${routeStopId}` }
          );
          return result.ok ? (result.value ?? cached ?? null) : (cached ?? null);
        },
        fetchInstanceDetail: async (instanceId) => {
          const result = await runner.run(
            'instanceDetail',
            async (): Promise<RouteInstanceDetail> => {
              const [progressResult, stopsResult] = await Promise.all([getRouteProgress(ctx(), { instanceId }), getStopsForInstance(ctx(), { instanceId })]);
              return { progress: unwrapItem(progressResult), stops: unwrapList(stopsResult) };
            },
            (detail, state) => ({ instanceDetailsById: keepNewest({ ...withoutKey(state.instanceDetailsById, instanceId), [instanceId]: detail }, INSTANCE_DETAILS_MAX) }),
            { flightKey: `instanceDetail:${instanceId}` }
          );
          return result.ok ? result.value : (get().instanceDetailsById[instanceId] ?? null);
        },

        clearActiveRoute: () => set(clearedRoute()),

        applyStopStatus: (routeInstanceStopId, status, at, patch) =>
          set((state) => {
            const iso = at === null ? null : new Date(at).toISOString();
            const timestamps = (s: { CheckInOn: string | null; CheckOutOn: string | null }) => ({
              CheckInOn: status === RouteStopStatus.CheckedIn && iso ? iso : s.CheckInOn,
              CheckOutOn: status === RouteStopStatus.CheckedOut && iso ? iso : s.CheckOutOn,
            });
            return {
              instanceStops: state.instanceStops.map((stop) => (stop.RouteInstanceStopId === routeInstanceStopId ? { ...stop, ...timestamps(stop), ...patch, Status: status } : stop)),
              stopDetails: state.stopDetails.map((stop) =>
                stop.RouteInstanceStopId === routeInstanceStopId ? { ...stop, ...timestamps(stop), ...(patch?.Notes !== undefined ? { InstanceNotes: patch.Notes } : {}), Status: status } : stop
              ),
            };
          }),
      };
    },
    dataPersistOptions<RoutesState, Pick<RoutesData, 'routePlans' | 'activePlan' | 'activeInstance' | 'progress' | 'instanceStops' | 'stopDetails' | 'stopContactsById' | 'isTracking' | 'fetchedAt'>>({
      // Unit offline scope: routes + the active instance + its stop contacts (plan §8.5).
      name: 'omni-routes-storage',
      partialize: (state) => ({
        routePlans: state.routePlans,
        activePlan: state.activePlan,
        activeInstance: state.activeInstance,
        progress: state.progress,
        instanceStops: state.instanceStops,
        stopDetails: state.stopDetails,
        stopContactsById: state.stopContactsById,
        isTracking: state.isTracking,
        fetchedAt: state.fetchedAt,
      }),
    })
  )
);

registerPersistedStore('omni-routes-storage', useRoutesStore);
registerDataStoreReset<RoutesState>('routes', useRoutesStore, initialData, () => runner.invalidate());

const afterStopAck = async (payload: RouteStopWritePayload): Promise<void> => {
  if (payload.routeInstanceId) await useRoutesStore.getState().fetchRouteProgress(payload.routeInstanceId, { bypassCache: true });
};

const revertStop = (payload: RouteStopWritePayload): void => useRoutesStore.getState().applyStopStatus(payload.routeInstanceStopId, payload.previousStatus, null);

export const routeStopCheckInHandler = defineDataHandler<RouteStopWritePayload, SaveRoutePlanResult>({
  type: ROUTE_STOP_CHECK_IN_EVENT,
  optimisticApply: (event) =>
    useRoutesStore.getState().applyStopStatus(event.payload.routeInstanceStopId, RouteStopStatus.CheckedIn, event.payload.at, {
      CheckInLatitude: event.payload.latitude,
      CheckInLongitude: event.payload.longitude,
      CheckInType: RouteStopCheckInType.Manual,
    }),
  send: async (event) => assertV4Success(await checkInAtStop(getDataApiContext(), { RouteInstanceStopId: event.payload.routeInstanceStopId, Latitude: event.payload.latitude, Longitude: event.payload.longitude })),
  afterAck: (event) => afterStopAck(event.payload),
  rollback: (event) => revertStop(event.payload),
});

export const routeStopCheckOutHandler = defineDataHandler<RouteStopWritePayload, SaveRoutePlanResult>({
  type: ROUTE_STOP_CHECK_OUT_EVENT,
  optimisticApply: (event) =>
    useRoutesStore.getState().applyStopStatus(event.payload.routeInstanceStopId, RouteStopStatus.CheckedOut, event.payload.at, {
      CheckOutLatitude: event.payload.latitude,
      CheckOutLongitude: event.payload.longitude,
    }),
  send: async (event) => assertV4Success(await checkOutFromStop(getDataApiContext(), { RouteInstanceStopId: event.payload.routeInstanceStopId, Latitude: event.payload.latitude, Longitude: event.payload.longitude })),
  afterAck: (event) => afterStopAck(event.payload),
  rollback: (event) => revertStop(event.payload),
});

export const routeStopSkipHandler = defineDataHandler<RouteStopWritePayload, SaveRoutePlanResult>({
  type: ROUTE_STOP_SKIP_EVENT,
  optimisticApply: (event) => useRoutesStore.getState().applyStopStatus(event.payload.routeInstanceStopId, RouteStopStatus.Skipped, event.payload.at, { SkipReason: event.payload.reason ?? null }),
  send: async (event) => assertV4Success(await skipStop(getDataApiContext(), { RouteInstanceStopId: event.payload.routeInstanceStopId, Reason: event.payload.reason ?? null })),
  afterAck: (event) => afterStopAck(event.payload),
  rollback: (event) => revertStop(event.payload),
});
