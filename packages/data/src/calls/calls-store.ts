import { buildNewCallInput, type CreateCallRequest, getActiveCalls, getAllCallPriorities, getAllCallTypes, getAllPendingScheduledCalls, getCallExtraData, getNewCallData, getPendingCalls, parseUtcMs } from '@resgrid/api';
import type { CallExtraDataResultData, CallPriorityResultData, CallResultData, CallTypeResultData, DispatchedEventResultData, NewCallInput, PoiResultData, PoiTypeResultData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { unwrapItem, unwrapList } from '../core/envelope';
import { submitWrite, type WriteResult } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { dataNow, getDataApiContext, getDataOutbox, getDataVariant } from '../core/runtime';
import { cacheOptions, createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

/** Outbox type for offline call creation (plan §8.5). */
export const CALL_CREATE_EVENT = 'calls.create';

/** Refetch a call's dispatches after this long (Unit): dispatches on an active call change over time. */
export const CALL_DISPATCHES_TTL_MS = 5 * 60 * 1000;
/** Responder: call extras go out a few at a time so a busy department does not bury the connection. */
export const CALL_EXTRAS_PREFETCH_CONCURRENCY = 5;
/** A synced-call notice (with its possible-duplicate flag) is kept this long for the creator to see. */
export const SYNCED_CALL_NOTICE_TTL_MS = 24 * 60 * 60 * 1000;

/** Core CallStates: Active 0 … Pending 8. Pending is excluded from every "active" read. */
export const isCallActiveState = (state: number): boolean => state === 0;

/**
 * A call created on this device that the server has not accepted yet.
 * - `queued`: shown everywhere as **"Queued — not dispatched yet"**: no call number, nobody paged.
 * - `rejected`: the server refused it (validation, required fields, permissions); it stays in Pending sync for correction.
 */
export type QueuedCallState = 'queued' | 'rejected';

export interface QueuedCall {
  /** Client GUID = outbox event id = idempotency key sent with SaveCall. */
  localId: string;
  request: CreateCallRequest;
  input: NewCallInput;
  createdAt: number;
  state: QueuedCallState;
}

/** What the creator is told once a queued call reached the server (plan §8.5). */
export interface SyncedCallNotice {
  localId: string;
  callId: string;
  number: string;
  syncedAt: number;
  /** Another call at the same location within a short window (call location history): flagged to the creator. */
  possibleDuplicate: boolean;
  duplicateCallIds: string[];
  acknowledged: boolean;
}

/** Marks a call list row that only exists on this device. */
export interface LocalCallMarker {
  localId: string;
  state: QueuedCallState;
}

export type CallListItem = CallResultData & { queued?: LocalCallMarker };

type CallsSlice = 'calls' | 'priorities' | 'types' | 'formData' | 'pending' | 'scheduled' | 'dispatches' | 'extras';

interface CallsData extends SliceMeta<CallsSlice> {
  calls: CallResultData[];
  callPriorities: CallPriorityResultData[];
  callTypes: CallTypeResultData[];
  /** New-call form data (Unit/IC `fetchCallFormData`). */
  destinationPois: PoiResultData[];
  poiTypes: PoiTypeResultData[];
  /** Dispatch queues (`calls.queues`). */
  pendingCalls: CallResultData[];
  scheduledCalls: CallResultData[];
  callDispatches: Record<string, DispatchedEventResultData[]>;
  callDispatchesFetchedAt: Record<string, number>;
  /** Responder call-extras prefetch: extras for every open call. */
  callExtrasById: Record<string, CallExtraDataResultData>;
  queuedCalls: Record<string, QueuedCall>;
  syncedCalls: Record<string, SyncedCallNotice>;
}

export interface CallsState extends CallsData {
  init: (options?: FetchOptions) => Promise<void>;
  fetchCalls: (options?: FetchOptions) => Promise<void>;
  fetchCallPriorities: (options?: FetchOptions) => Promise<void>;
  fetchCallTypes: (options?: FetchOptions) => Promise<void>;
  fetchCallFormData: (options?: FetchOptions) => Promise<void>;
  fetchPendingCalls: (options?: FetchOptions) => Promise<void>;
  fetchScheduledCalls: (options?: FetchOptions) => Promise<void>;
  /** After a calls push or a dispatch: the pending list always, the scheduled list once something loaded it (Dispatch). */
  refreshQueuedCallLists: () => Promise<void>;
  fetchCallDispatches: (callIds: string[], options?: FetchOptions) => Promise<void>;
  fetchCallExtraData: (callId: string, options?: FetchOptions) => Promise<CallExtraDataResultData | null>;
  prefetchCallExtras: (callIds: string[], options?: FetchOptions) => Promise<void>;
  /** Creates a call through the outbox: sent now when online, otherwise queued as "Queued — not dispatched yet". */
  createCall: (request: CreateCallRequest) => Promise<WriteResult>;
  /** Corrects a rejected queued call and queues it again under the same client GUID. */
  correctQueuedCall: (localId: string, request: CreateCallRequest) => Promise<boolean>;
  acknowledgeSyncedCall: (localId: string) => void;
  // Used by the `calls.create` outbox handler.
  applyQueuedCall: (call: QueuedCall) => void;
  markQueuedCallRejected: (localId: string) => void;
  removeQueuedCall: (localId: string) => void;
  replaceQueuedCall: (localId: string, serverCall: CallResultData | null, notice: Omit<SyncedCallNotice, 'acknowledged'>) => void;
}

const initialData = (): CallsData => ({
  ...emptySliceMeta<CallsSlice>(),
  calls: [],
  callPriorities: [],
  callTypes: [],
  destinationPois: [],
  poiTypes: [],
  pendingCalls: [],
  scheduledCalls: [],
  callDispatches: {},
  callDispatchesFetchedAt: {},
  callExtrasById: {},
  queuedCalls: {},
  syncedCalls: {},
});

let bypassOverride: boolean | null = null;

/**
 * Per-variant cache policy (plan §7.4): the Dispatch console always reads live calls; the field apps
 * accept the cached-endpoint TTL (30 s) and stale-while-offline.
 */
export function configureCallsCachePolicy(policy: { bypassCache: boolean } | null): void {
  bypassOverride = policy ? policy.bypassCache : null;
}

const shouldBypassCallsCache = (options?: FetchOptions): boolean => {
  if (options?.bypassCache) return true;
  if (bypassOverride !== null) return bypassOverride;
  return getDataVariant()?.modules.includes('dispatch-console') ?? false;
};

/** IC: the same dispatch can come back twice; keep one per Id + Name. */
const uniqueDispatches = (dispatches: DispatchedEventResultData[]): DispatchedEventResultData[] => {
  const seen = new Set<string>();
  return dispatches.filter((dispatch) => {
    const key = `${dispatch.Id}-${dispatch.Name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const pickByIds = <T>(record: Record<string, T>, ids: Set<string>): Record<string, T> => {
  const next: Record<string, T> = {};
  for (const id of Object.keys(record)) if (ids.has(id)) next[id] = record[id];
  return next;
};

const pruneNotices = (notices: Record<string, SyncedCallNotice>): Record<string, SyncedCallNotice> => {
  const now = dataNow();
  const next: Record<string, SyncedCallNotice> = {};
  for (const [id, notice] of Object.entries(notices)) if (now - notice.syncedAt <= SYNCED_CALL_NOTICE_TTL_MS) next[id] = notice;
  return next;
};

type PersistedCalls = Pick<
  CallsData,
  | 'calls'
  | 'callPriorities'
  | 'callTypes'
  | 'destinationPois'
  | 'poiTypes'
  | 'pendingCalls'
  | 'scheduledCalls'
  | 'callDispatches'
  | 'callDispatchesFetchedAt'
  | 'callExtrasById'
  | 'queuedCalls'
  | 'syncedCalls'
  | 'fetchedAt'
>;

let runner: SliceRunner<CallsSlice, CallsState>;

export const useCallsStore = create<CallsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<CallsSlice, CallsState>('calls', set);
      const extrasFlight = new Map<string, Promise<CallExtraDataResultData | null>>();

      return {
        ...initialData(),

        init: async (options) => {
          await Promise.all([get().fetchCalls(options), get().fetchCallPriorities(options), get().fetchCallTypes(options)]);
        },

        fetchCalls: async (options) => {
          const bypassCache = shouldBypassCallsCache(options);
          await runner.run(
            'calls',
            async () => unwrapList(await getActiveCalls(getDataApiContext(), cacheOptions({ bypassCache }))),
            (calls, state) => {
              // Evict per-call data for calls no longer open (Unit/Responder: bounded memory and storage).
              const openIds = new Set(calls.map((call) => call.CallId));
              return {
                calls,
                callDispatches: pickByIds(state.callDispatches, openIds),
                callDispatchesFetchedAt: pickByIds(state.callDispatchesFetchedAt, openIds),
                callExtrasById: pickByIds(state.callExtrasById, openIds),
                syncedCalls: pruneNotices(state.syncedCalls),
              };
            },
            { trailing: options?.bypassCache === true }
          );
        },

        fetchCallPriorities: async (options) => {
          await runner.run(
            'priorities',
            async () => unwrapList(await getAllCallPriorities(getDataApiContext(), cacheOptions(options))),
            (callPriorities) => ({ callPriorities })
          );
        },

        fetchCallTypes: async (options) => {
          await runner.run(
            'types',
            async () => unwrapList(await getAllCallTypes(getDataApiContext(), cacheOptions(options))),
            (callTypes) => ({ callTypes })
          );
        },

        fetchCallFormData: async () => {
          await runner.run(
            'formData',
            async () => unwrapItem(await getNewCallData(getDataApiContext())),
            (data, state) => ({
              callPriorities: data?.Priorities?.length ? data.Priorities : state.callPriorities,
              callTypes: data?.CallTypes?.length ? data.CallTypes : state.callTypes,
              destinationPois: data?.DestinationPois ?? [],
              poiTypes: data?.PoiTypes ?? [],
            })
          );
        },

        fetchPendingCalls: async (options) => {
          await runner.run(
            'pending',
            async () => unwrapList(await getPendingCalls(getDataApiContext())),
            (pendingCalls) => ({ pendingCalls }),
            { trailing: options?.bypassCache === true }
          );
        },

        fetchScheduledCalls: async (options) => {
          await runner.run(
            'scheduled',
            async () => unwrapList(await getAllPendingScheduledCalls(getDataApiContext())),
            (scheduledCalls) => ({ scheduledCalls }),
            { trailing: options?.bypassCache === true }
          );
        },

        refreshQueuedCallLists: async () => {
          const tasks: Promise<void>[] = [get().fetchPendingCalls({ bypassCache: true })];
          if ((get().fetchedAt.scheduled ?? 0) > 0) tasks.push(get().fetchScheduledCalls({ bypassCache: true }));
          await Promise.all(tasks);
        },

        fetchCallDispatches: async (callIds, options) => {
          const now = dataNow();
          const { callDispatches, callDispatchesFetchedAt } = get();
          const due = options?.bypassCache ? callIds : callIds.filter((id) => !(id in callDispatches) || now - (callDispatchesFetchedAt[id] ?? 0) > CALL_DISPATCHES_TTL_MS);
          if (due.length === 0) return;
          await runner.run(
            'dispatches',
            async () =>
              Promise.all(
                due.map(async (callId) => {
                  try {
                    const extra = unwrapItem(await getCallExtraData(getDataApiContext(), { callId }));
                    return { callId, dispatches: uniqueDispatches(extra?.Dispatches ?? []) };
                  } catch {
                    // A failed fetch must not be cached as empty: that would hide dispatches for the life of the call (Unit).
                    return { callId, dispatches: null };
                  }
                })
              ),
            (results, state) => {
              const nextDispatches = { ...state.callDispatches };
              const nextFetchedAt = { ...state.callDispatchesFetchedAt };
              for (const { callId, dispatches } of results) {
                if (dispatches !== null) {
                  nextDispatches[callId] = dispatches;
                  nextFetchedAt[callId] = dataNow();
                }
              }
              return { callDispatches: nextDispatches, callDispatchesFetchedAt: nextFetchedAt };
            },
            { flightKey: `dispatches:${due.join(',')}`, silent: true }
          );
        },

        fetchCallExtraData: async (callId, options) => {
          const cached = get().callExtrasById[callId];
          if (cached && !options?.bypassCache) return cached;
          const existing = extrasFlight.get(callId);
          if (existing) return existing;
          const generation = runner.generation();
          const request = (async () => {
            try {
              const extra = unwrapItem(await getCallExtraData(getDataApiContext(), { callId }));
              if (extra && generation === runner.generation()) {
                set((state) => ({ callExtrasById: { ...state.callExtrasById, [callId]: extra } }));
              }
              return extra;
            } catch {
              return null;
            } finally {
              extrasFlight.delete(callId);
            }
          })();
          extrasFlight.set(callId, request);
          return request;
        },

        prefetchCallExtras: async (callIds, options) => {
          for (let index = 0; index < callIds.length; index += CALL_EXTRAS_PREFETCH_CONCURRENCY) {
            const chunk = callIds.slice(index, index + CALL_EXTRAS_PREFETCH_CONCURRENCY);
            await Promise.all(chunk.map((callId) => get().fetchCallExtraData(callId, options)));
          }
        },

        createCall: async (request) => {
          const input = buildNewCallInput(request);
          return submitWrite<CallCreatePayload>({ type: CALL_CREATE_EVENT, payload: { request, input } });
        },

        correctQueuedCall: async (localId, request) => {
          const outbox = getDataOutbox();
          const existing = get().queuedCalls[localId];
          if (!existing || !outbox.amend) return false;
          const input = buildNewCallInput(request);
          const amended = await outbox.amend<CallCreatePayload>(localId, { request, input });
          if (!amended) return false;
          set((state) => ({ queuedCalls: { ...state.queuedCalls, [localId]: { ...existing, request, input, state: 'queued' } } }));
          await outbox.drain({ filter: (event) => event.id === localId });
          return true;
        },

        acknowledgeSyncedCall: (localId) => {
          set((state) => {
            const notice = state.syncedCalls[localId];
            return notice ? { syncedCalls: { ...state.syncedCalls, [localId]: { ...notice, acknowledged: true } } } : {};
          });
        },

        applyQueuedCall: (call) => {
          set((state) => ({ queuedCalls: { ...state.queuedCalls, [call.localId]: call } }));
        },

        markQueuedCallRejected: (localId) => {
          set((state) => {
            const call = state.queuedCalls[localId];
            return call ? { queuedCalls: { ...state.queuedCalls, [localId]: { ...call, state: 'rejected' } } } : {};
          });
        },

        removeQueuedCall: (localId) => {
          set((state) => {
            if (!(localId in state.queuedCalls)) return {};
            const queuedCalls = { ...state.queuedCalls };
            delete queuedCalls[localId];
            return { queuedCalls };
          });
        },

        replaceQueuedCall: (localId, serverCall, notice) => {
          set((state) => {
            const queuedCalls = { ...state.queuedCalls };
            delete queuedCalls[localId];
            const calls = serverCall && isCallActiveState(serverCall.State) ? [serverCall, ...state.calls.filter((call) => call.CallId !== serverCall.CallId)] : state.calls;
            const pendingCalls = serverCall && serverCall.State === 8 ? [...state.pendingCalls.filter((call) => call.CallId !== serverCall.CallId), serverCall] : state.pendingCalls;
            return { queuedCalls, calls, pendingCalls, syncedCalls: { ...pruneNotices(state.syncedCalls), [localId]: { ...notice, acknowledged: false } } };
          });
        },
      };
    },
    dataPersistOptions<CallsState, PersistedCalls>({
      // Frozen: IC's persisted calls store. Version 1 adds the queues, extras and queued calls.
      name: 'calls-storage',
      version: 1,
      partialize: (state) => ({
        calls: state.calls,
        callPriorities: state.callPriorities,
        callTypes: state.callTypes,
        destinationPois: state.destinationPois,
        poiTypes: state.poiTypes,
        pendingCalls: state.pendingCalls,
        scheduledCalls: state.scheduledCalls,
        callDispatches: state.callDispatches,
        callDispatchesFetchedAt: state.callDispatchesFetchedAt,
        callExtrasById: state.callExtrasById,
        queuedCalls: state.queuedCalls,
        syncedCalls: state.syncedCalls,
        fetchedAt: state.fetchedAt,
      }),
      migrate: (persisted, version) => migrateCallsStorage(persisted, version),
    })
  )
);

/** IC v0 → v1: `lastFetchedAt` becomes `fetchedAt.calls`; everything else keeps its name. */
export function migrateCallsStorage(persisted: unknown, version: number): PersistedCalls {
  const base = initialData();
  const empty: PersistedCalls = {
    calls: base.calls,
    callPriorities: base.callPriorities,
    callTypes: base.callTypes,
    destinationPois: base.destinationPois,
    poiTypes: base.poiTypes,
    pendingCalls: base.pendingCalls,
    scheduledCalls: base.scheduledCalls,
    callDispatches: base.callDispatches,
    callDispatchesFetchedAt: base.callDispatchesFetchedAt,
    callExtrasById: base.callExtrasById,
    queuedCalls: base.queuedCalls,
    syncedCalls: base.syncedCalls,
    fetchedAt: base.fetchedAt,
  };
  if (!persisted || typeof persisted !== 'object') return empty;
  const legacy = persisted as Partial<PersistedCalls> & { lastFetchedAt?: number };
  if (version === 0) {
    return {
      ...empty,
      calls: Array.isArray(legacy.calls) ? legacy.calls : [],
      callPriorities: Array.isArray(legacy.callPriorities) ? legacy.callPriorities : [],
      callTypes: Array.isArray(legacy.callTypes) ? legacy.callTypes : [],
      callDispatches: legacy.callDispatches && typeof legacy.callDispatches === 'object' ? legacy.callDispatches : {},
      fetchedAt: typeof legacy.lastFetchedAt === 'number' && legacy.lastFetchedAt > 0 ? { calls: legacy.lastFetchedAt } : {},
    };
  }
  return { ...empty, ...legacy };
}

export interface CallCreatePayload {
  request: CreateCallRequest;
  input: NewCallInput;
}

registerPersistedStore('calls-storage', useCallsStore);
registerDataStoreReset<CallsState>('calls', useCallsStore, initialData, () => runner.invalidate());

// ---------------------------------------------------------------- selectors (pure; no view state)

export const selectActiveCalls = (state: Pick<CallsState, 'calls'>): CallResultData[] => state.calls.filter((call) => isCallActiveState(call.State));

export const selectCallById = (state: Pick<CallsState, 'calls'>, callId: string): CallResultData | undefined => state.calls.find((call) => call.CallId === callId);

export const selectPriorityById = (state: Pick<CallsState, 'callPriorities'>, priorityId: number): CallPriorityResultData | undefined => state.callPriorities.find((priority) => priority.Id === priorityId);

/** A queued call as a list row: no number, the GUID as id, and the `queued` marker the UI renders as "Queued — not dispatched yet". */
export const queuedCallToListItem = (queued: QueuedCall): CallListItem => {
  const [latitude, longitude] = (queued.input.Geolocation ?? '').split(',');
  const loggedOnUtc = new Date(queued.createdAt).toISOString();
  return {
    CallId: queued.localId,
    Priority: queued.input.Priority,
    Name: queued.input.Name,
    Nature: queued.input.Nature,
    Note: queued.input.Note ?? '',
    Address: queued.input.Address ?? '',
    DestinationPoiId: queued.input.DestinationPoiId ?? null,
    DestinationName: '',
    DestinationAddress: '',
    DestinationTypeName: '',
    DestinationPoiTypeId: null,
    DestinationLatitude: null,
    DestinationLongitude: null,
    Geolocation: queued.input.Geolocation ?? '',
    LoggedOn: loggedOnUtc,
    State: 0,
    Number: '',
    NotesCount: 0,
    AudioCount: 0,
    ImgagesCount: 0,
    FileCount: 0,
    What3Words: queued.input.What3Words ?? '',
    ContactName: queued.input.ContactName ?? '',
    ContactInfo: queued.input.ContactInfo ?? '',
    ReferenceId: queued.input.ReferenceId ?? '',
    ExternalId: queued.input.ExternalId ?? '',
    IncidentId: queued.input.IncidentId ?? '',
    AudioFileId: '',
    Type: queued.input.Type ?? '',
    AlarmLevel: 1,
    ActiveRunCardId: null,
    LoggedOnUtc: loggedOnUtc,
    DispatchedOn: '',
    DispatchedOnUtc: '',
    ScheduledOn: '',
    ScheduledOnUtc: '',
    Latitude: latitude ?? '',
    Longitude: longitude ?? '',
    Protocols: [],
    UdfValues: [],
    CheckInTimersEnabled: false,
    queued: { localId: queued.localId, state: queued.state },
  };
};

/** Active calls with this device's queued calls first (they show everywhere, distinct, until the server accepts them). */
export const selectCallListWithQueued = (state: Pick<CallsState, 'calls' | 'queuedCalls'>): CallListItem[] => [
  ...Object.values(state.queuedCalls)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(queuedCallToListItem),
  ...selectActiveCalls(state),
];

export const selectUnacknowledgedSyncedCalls = (state: Pick<CallsState, 'syncedCalls'>): SyncedCallNotice[] => Object.values(state.syncedCalls).filter((notice) => !notice.acknowledged);

/** Server time of a call in epoch ms (the shared UTC parser; some `*Utc` fields arrive without "Z"). */
export const callLoggedOnMs = (call: Pick<CallResultData, 'LoggedOnUtc'>): number | null => parseUtcMs(call.LoggedOnUtc);
