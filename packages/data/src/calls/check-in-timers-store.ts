import { getCallPersonnelCheckInStatuses, getCheckInHistory, getTimersForCall, getTimerStatuses, performCheckIn, toggleCallTimers } from '@resgrid/api';
import type {
  CallPersonnelCheckInStatusResultData,
  CheckInRecordResultData,
  CheckInTimerStatusResultData,
  PerformCheckInInput,
  PerformCheckInResult,
  PersonnelInfoResultData,
  ResolvedCheckInTimerResultData,
  UnitResultData,
} from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapList } from '../core/envelope';
import { defineDataHandler, submitWrite, type WriteResult } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { type DataLocationFix, getDataApiContext, getDataLocationFix } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';
import { personnelFullName, usePersonnelStore } from '../personnel/personnel-store';
import { useUnitsStore } from '../units/units-store';

export const CHECK_IN_PERFORM_EVENT = 'checkIn.perform';

/** Most urgent first (Dispatch). */
export const CHECK_IN_STATUS_SEVERITY: Record<string, number> = { Critical: 0, Overdue: 1, Red: 1, Warning: 2, Yellow: 2, Ok: 3, Green: 3 };

const severity = (status: string): number => CHECK_IN_STATUS_SEVERITY[status] ?? 3;

export const sortByCheckInSeverity = <T extends { Status: string }>(rows: T[]): T[] => [...rows].sort((a, b) => severity(a.Status) - severity(b.Status));

/** Timers that count toward the global overdue badge (Responder home). */
export const isOverdueOrWarning = (status: Pick<CheckInTimerStatusResultData, 'Status'>): boolean => status.Status === 'Overdue' || status.Status === 'Warning';

/**
 * Fills `TargetName` on timer statuses that only carry a type label, from the resolved timers, then the
 * units and personnel rosters (Dispatch). Pure: the rosters are passed in.
 */
export function enrichTimerNames(
  statuses: CheckInTimerStatusResultData[],
  resolved: ResolvedCheckInTimerResultData[],
  units: Pick<UnitResultData, 'UnitId' | 'Name'>[],
  personnel: Pick<PersonnelInfoResultData, 'UserId' | 'IdentificationNumber' | 'FirstName' | 'LastName'>[]
): CheckInTimerStatusResultData[] {
  const resolvedNames = new Map<string, string>();
  for (const timer of resolved) {
    if (!timer.TargetName) continue;
    if (timer.TargetEntityId) resolvedNames.set(`${timer.TargetType}-${timer.TargetEntityId}`, timer.TargetName);
    if (!resolvedNames.has(`type-${timer.TargetType}`)) resolvedNames.set(`type-${timer.TargetType}`, timer.TargetName);
  }
  const unitNames = new Map<string, string>();
  for (const unit of units) {
    if (!unit.Name) continue;
    unitNames.set(unit.UnitId, unit.Name);
    const numeric = parseInt(unit.UnitId, 10);
    if (!Number.isNaN(numeric)) unitNames.set(String(numeric), unit.Name);
  }
  const personNames = new Map<string, string>();
  for (const person of personnel) {
    const name = personnelFullName(person);
    if (!name) continue;
    personNames.set(person.UserId, name);
    if (person.IdentificationNumber) personNames.set(person.IdentificationNumber, name);
  }
  return statuses.map((status) => {
    const isTypeLabel = !status.TargetName || /type$/i.test(status.TargetName) || status.TargetName === status.TargetTypeName;
    if (!isTypeLabel) return status;
    const entity = status.TargetEntityId;
    const name =
      (entity ? resolvedNames.get(`${status.TargetType}-${entity}`) : undefined) ??
      resolvedNames.get(`type-${status.TargetType}`) ??
      (entity ? unitNames.get(entity) : undefined) ??
      (status.UnitId ? unitNames.get(String(status.UnitId)) : undefined) ??
      (entity ? personNames.get(entity) : undefined);
    return name ? { ...status, TargetName: name } : status;
  });
}

export interface QueuedCheckIn {
  localId: string;
  callId: number;
  checkInType: number;
  userId: string | null;
  unitId: number | null;
  createdAt: number;
  state: 'queued' | 'rejected';
}

export interface PerformCheckInRequest {
  callId: number;
  checkInType: number;
  /** An incident commander checking in on someone else's behalf. */
  userId?: string | null;
  unitId?: number | null;
  note?: string | null;
  location?: DataLocationFix | null;
}

type CheckInSlice = 'statuses' | 'resolved' | 'history' | 'personnelStatuses' | 'globalOverdue';

interface CheckInData extends SliceMeta<CheckInSlice> {
  statusesByCall: Record<string, CheckInTimerStatusResultData[]>;
  resolvedByCall: Record<string, ResolvedCheckInTimerResultData[]>;
  historyByCall: Record<string, CheckInRecordResultData[]>;
  personnelStatusesByCall: Record<string, CallPersonnelCheckInStatusResultData[]>;
  /** Overdue + warning timers across every active call with timers (Responder home summary). */
  globalOverdueCount: number;
  queuedCheckIns: Record<string, QueuedCheckIn>;
}

export interface CheckInTimersState extends CheckInData {
  fetchTimerStatuses: (callId: number, options?: FetchOptions & { silent?: boolean }) => Promise<void>;
  fetchTimerStatusesForCalls: (callIds: number[], options?: FetchOptions & { silent?: boolean }) => Promise<void>;
  fetchCheckInHistory: (callId: number, options?: FetchOptions) => Promise<void>;
  fetchCallPersonnelStatuses: (callId: number, options?: FetchOptions) => Promise<void>;
  fetchGlobalOverdueCount: (calls: { CallId: string; CheckInTimersEnabled?: boolean }[]) => Promise<void>;
  /** Offline-capable check-in with an idempotency key (Core `PerformCheckIn` dedups on it). */
  performCheckIn: (request: PerformCheckInRequest) => Promise<WriteResult>;
  /** Online only; Core reads callId/enabled from the query string. */
  toggleTimers: (callId: number, enabled: boolean) => Promise<boolean>;
  applyQueuedCheckIn: (checkIn: QueuedCheckIn) => void;
  setQueuedCheckInState: (localId: string, state: QueuedCheckIn['state'] | null) => void;
}

const initialData = (): CheckInData => ({
  ...emptySliceMeta<CheckInSlice>(),
  statusesByCall: {},
  resolvedByCall: {},
  historyByCall: {},
  personnelStatusesByCall: {},
  globalOverdueCount: 0,
  queuedCheckIns: {},
});

const loadStatuses = async (callId: number, resolvedFallback: ResolvedCheckInTimerResultData[] | null): Promise<{ statuses: CheckInTimerStatusResultData[]; resolved: ResolvedCheckInTimerResultData[] }> => {
  const ctx = getDataApiContext();
  const [statuses, resolved] = await Promise.all([
    getTimerStatuses(ctx, { callId }).then(unwrapList),
    resolvedFallback ? Promise.resolve(resolvedFallback) : getTimersForCall(ctx, { callId }).then(unwrapList, () => [] as ResolvedCheckInTimerResultData[]),
  ]);
  const enriched = enrichTimerNames(statuses, resolved, useUnitsStore.getState().units, usePersonnelStore.getState().personnel);
  return { statuses: sortByCheckInSeverity(enriched), resolved };
};

let runner: SliceRunner<CheckInSlice, CheckInTimersState>;

export const useCheckInTimersStore = create<CheckInTimersState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<CheckInSlice, CheckInTimersState>('check-in-timers', set);
      return {
        ...initialData(),

        fetchTimerStatuses: async (callId, options) => {
          // A silent poll reuses the resolved timers: they only supply display names (Dispatch).
          const reuse = options?.silent ? (get().resolvedByCall[String(callId)] ?? null) : null;
          await runner.run(
            'statuses',
            () => loadStatuses(callId, reuse),
            (value, state) => ({ statusesByCall: { ...state.statusesByCall, [String(callId)]: value.statuses }, resolvedByCall: { ...state.resolvedByCall, [String(callId)]: value.resolved } }),
            { flightKey: `statuses:${callId}`, silent: options?.silent, trailing: options?.bypassCache === true }
          );
        },

        fetchTimerStatusesForCalls: async (callIds, options) => {
          await Promise.all(callIds.map((callId) => get().fetchTimerStatuses(callId, options)));
        },

        fetchCheckInHistory: async (callId) => {
          await runner.run(
            'history',
            async () => unwrapList(await getCheckInHistory(getDataApiContext(), { callId })),
            (list, state) => ({ historyByCall: { ...state.historyByCall, [String(callId)]: list } }),
            {
              flightKey: `history:${callId}`,
            }
          );
        },

        fetchCallPersonnelStatuses: async (callId) => {
          await runner.run(
            'personnelStatuses',
            async () => sortByCheckInSeverity(unwrapList(await getCallPersonnelCheckInStatuses(getDataApiContext(), { callId }))),
            (list, state) => ({ personnelStatusesByCall: { ...state.personnelStatusesByCall, [String(callId)]: list } }),
            { flightKey: `personnelStatuses:${callId}` }
          );
        },

        fetchGlobalOverdueCount: async (calls) => {
          const withTimers = calls.filter((call) => call.CheckInTimersEnabled === true);
          // The runner's race guard keeps only the newest request (Responder's request generation).
          await runner.run(
            'globalOverdue',
            async () => {
              const counts = await Promise.all(
                withTimers.map(async (call) => {
                  try {
                    return unwrapList(await getTimerStatuses(getDataApiContext(), { callId: call.CallId })).filter(isOverdueOrWarning).length;
                  } catch {
                    return 0;
                  }
                })
              );
              return counts.reduce((total, count) => total + count, 0);
            },
            (globalOverdueCount) => ({ globalOverdueCount }),
            { flightKey: `globalOverdue:${withTimers.map((call) => call.CallId).join(',')}`, silent: true }
          );
        },

        performCheckIn: async (request) => {
          const fix = request.location ?? getDataLocationFix();
          const body: PerformCheckInInput = {
            CallId: request.callId,
            CheckInType: request.checkInType,
            UserId: request.userId ?? null,
            UnitId: request.unitId ?? null,
            Note: request.note ?? null,
            Latitude: fix ? String(fix.latitude) : null,
            Longitude: fix ? String(fix.longitude) : null,
          };
          return submitWrite<PerformCheckInInput>({ type: CHECK_IN_PERFORM_EVENT, payload: body });
        },

        toggleTimers: async (callId, enabled) => {
          try {
            assertV4Success(await toggleCallTimers(getDataApiContext(), { callId, enabled }));
            await get().fetchTimerStatuses(callId, { bypassCache: true });
            return true;
          } catch {
            return false;
          }
        },

        applyQueuedCheckIn: (checkIn) => set((state) => ({ queuedCheckIns: { ...state.queuedCheckIns, [checkIn.localId]: checkIn } })),

        setQueuedCheckInState: (localId, checkInState) =>
          set((state) => {
            const existing = state.queuedCheckIns[localId];
            if (!existing) return {};
            const queuedCheckIns = { ...state.queuedCheckIns };
            if (checkInState === null) delete queuedCheckIns[localId];
            else queuedCheckIns[localId] = { ...existing, state: checkInState };
            return { queuedCheckIns };
          }),
      };
    },
    dataPersistOptions<CheckInTimersState, Pick<CheckInData, 'queuedCheckIns' | 'statusesByCall'>>({
      name: 'omni-check-in-storage',
      partialize: (state) => ({ queuedCheckIns: state.queuedCheckIns, statusesByCall: state.statusesByCall }),
    })
  )
);

registerPersistedStore('omni-check-in-storage', useCheckInTimersStore);
registerDataStoreReset<CheckInTimersState>('check-in-timers', useCheckInTimersStore, initialData, () => runner.invalidate());

/** Check-ins are additive intents; the event id is the idempotency key Core dedups on. */
export const checkInPerformHandler = defineDataHandler<PerformCheckInInput, PerformCheckInResult>({
  type: CHECK_IN_PERFORM_EVENT,
  optimisticApply: (event) => {
    const { payload } = event;
    useCheckInTimersStore
      .getState()
      .applyQueuedCheckIn({ localId: event.id, callId: payload.CallId, checkInType: payload.CheckInType, userId: payload.UserId ?? null, unitId: payload.UnitId ?? null, createdAt: event.createdAt, state: 'queued' });
  },
  send: async (event, context) => assertV4Success(await performCheckIn(getDataApiContext(), { ...event.payload, IdempotencyKey: context.idempotencyKey })),
  afterAck: async (event) => {
    useCheckInTimersStore.getState().setQueuedCheckInState(event.id, null);
    await useCheckInTimersStore.getState().fetchTimerStatuses(event.payload.CallId, { bypassCache: true });
  },
  rollback: (event, reason) => useCheckInTimersStore.getState().setQueuedCheckInState(event.id, reason === 'discarded' ? null : 'rejected'),
});
