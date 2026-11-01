import { getCurrentStaffing, getCurrentStatus, savePersonStaffing, savePersonStatus } from '@resgrid/api';
import type { GetCurrentStaffingResultData, GetCurrentStatusResultData, SavePersonnelStaffingInput, SavePersonStaffingResult, SavePersonStatusInput, SavePersonStatusResult } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapItem } from '../core/envelope';
import { defineDataHandler, submitWrite, type WriteResult } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { type DataLocationFix, dataNow, getDataApiContext, getDataSessionScope } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';
import { gpsFields, statusTimestamps } from '../core/status-fields';
import { usePersonnelStore } from './personnel-store';

export const PERSONNEL_STATUS_SET_EVENT = 'personnel.status.set';
export const PERSONNEL_STAFFING_SET_EVENT = 'personnel.staffing.set';

/** One person's statuses (and staffings) replay strictly in order; on-behalf writes order per target user. */
export const personnelStatusOrderKey = (userId: string): string => `personnel-status:${userId}`;
export const personnelStaffingOrderKey = (userId: string): string => `personnel-staffing:${userId}`;

export type QueuedPersonnelWriteKind = 'status' | 'staffing';

export interface QueuedPersonnelWrite {
  localId: string;
  kind: QueuedPersonnelWriteKind;
  userId: string;
  type: string;
  respondingTo: string;
  note: string;
  createdAt: number;
  state: 'queued' | 'rejected';
}

export interface SetPersonnelStatusInput {
  /** Defaults to the signed-in user; another user only with `status.onBehalf` (Dispatch). */
  userId?: string;
  /** Status option id (ActionTypes / custom state id) as a string. */
  statusType: string;
  note?: string;
  respondingTo?: string;
  respondingToType?: number | null;
  location?: DataLocationFix | null;
}

export interface SetPersonnelStaffingInput {
  userId?: string;
  staffingType: string;
  note?: string;
}

type OwnSlice = 'currentStatus' | 'currentStaffing';

interface PersonnelStatusData extends SliceMeta<OwnSlice> {
  /** The signed-in user's own status and staffing (Responder home, sidebar). */
  currentStatus: GetCurrentStatusResultData | null;
  currentStaffing: GetCurrentStaffingResultData | null;
  queuedWrites: Record<string, QueuedPersonnelWrite>;
}

export interface PersonnelStatusState extends PersonnelStatusData {
  fetchCurrentStatus: (options?: FetchOptions) => Promise<void>;
  fetchCurrentStaffing: (options?: FetchOptions) => Promise<void>;
  /** Offline-capable personnel status (ordered per user through the outbox). */
  setStatus: (input: SetPersonnelStatusInput) => Promise<WriteResult>;
  /** Offline-capable staffing (ordered per user through the outbox). */
  setStaffing: (input: SetPersonnelStaffingInput) => Promise<WriteResult>;
  applyQueuedWrite: (write: QueuedPersonnelWrite) => void;
  setQueuedWriteState: (localId: string, state: QueuedPersonnelWrite['state'] | null) => void;
}

const initialData = (): PersonnelStatusData => ({ ...emptySliceMeta<OwnSlice>(), currentStatus: null, currentStaffing: null, queuedWrites: {} });

class NoSessionUserError extends Error {
  constructor() {
    super('No signed-in user for a personnel status write.');
    this.name = 'NoSessionUserError';
  }
}

const targetUser = (userId?: string): string => {
  const resolved = userId || getDataSessionScope()?.userId;
  if (!resolved) throw new NoSessionUserError();
  return resolved;
};

/** The newest queued status (or staffing) for a user, shown until it syncs. */
export const selectPendingPersonnelWrite = (state: Pick<PersonnelStatusData, 'queuedWrites'>, userId: string, kind: QueuedPersonnelWriteKind): QueuedPersonnelWrite | undefined =>
  Object.values(state.queuedWrites)
    .filter((write) => write.userId === userId && write.kind === kind && write.state === 'queued')
    // Newest wins; on a tie the later-queued one (insertion order).
    .reduce<QueuedPersonnelWrite | undefined>((newest, write) => (!newest || write.createdAt >= newest.createdAt ? write : newest), undefined);

let runner: SliceRunner<OwnSlice, PersonnelStatusState>;

export const usePersonnelStatusStore = create<PersonnelStatusState>()(
  persist(
    (set) => {
      runner = createSliceRunner<OwnSlice, PersonnelStatusState>('personnel-status', set);
      return {
        ...initialData(),

        fetchCurrentStatus: async (options) => {
          const userId = getDataSessionScope()?.userId;
          if (!userId) return;
          await runner.run(
            'currentStatus',
            async () => unwrapItem(await getCurrentStatus(getDataApiContext(), { userId })),
            (currentStatus) => ({ currentStatus }),
            { trailing: options?.bypassCache === true }
          );
        },

        fetchCurrentStaffing: async (options) => {
          const userId = getDataSessionScope()?.userId;
          if (!userId) return;
          await runner.run(
            'currentStaffing',
            async () => unwrapItem(await getCurrentStaffing(getDataApiContext(), { userId })),
            (currentStaffing) => ({ currentStaffing }),
            {
              trailing: options?.bypassCache === true,
            }
          );
        },

        setStatus: async (input) => {
          const userId = targetUser(input.userId);
          const body: SavePersonStatusInput = {
            UserId: userId,
            Type: input.statusType,
            RespondingTo: input.respondingTo ?? '',
            RespondingToType: input.respondingToType ?? null,
            Note: input.note ?? '',
            ...statusTimestamps(dataNow()),
            ...gpsFields(input.location),
            EventId: '',
          };
          return submitWrite<SavePersonStatusInput>({ type: PERSONNEL_STATUS_SET_EVENT, payload: body, orderKey: personnelStatusOrderKey(userId) });
        },

        setStaffing: async (input) => {
          const userId = targetUser(input.userId);
          const body: SavePersonnelStaffingInput = { UserId: userId, Type: input.staffingType, Note: input.note ?? '', ...statusTimestamps(dataNow()), EventId: '' };
          return submitWrite<SavePersonnelStaffingInput>({ type: PERSONNEL_STAFFING_SET_EVENT, payload: body, orderKey: personnelStaffingOrderKey(userId) });
        },

        applyQueuedWrite: (write) => set((state) => ({ queuedWrites: { ...state.queuedWrites, [write.localId]: write } })),

        setQueuedWriteState: (localId, writeState) =>
          set((state) => {
            const existing = state.queuedWrites[localId];
            if (!existing) return {};
            const queuedWrites = { ...state.queuedWrites };
            if (writeState === null) delete queuedWrites[localId];
            else queuedWrites[localId] = { ...existing, state: writeState };
            return { queuedWrites };
          }),
      };
    },
    dataPersistOptions<PersonnelStatusState, Pick<PersonnelStatusData, 'currentStatus' | 'currentStaffing' | 'queuedWrites' | 'fetchedAt'>>({
      name: 'omni-personnel-status-storage',
      partialize: (state) => ({ currentStatus: state.currentStatus, currentStaffing: state.currentStaffing, queuedWrites: state.queuedWrites, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('omni-personnel-status-storage', usePersonnelStatusStore);
registerDataStoreReset<PersonnelStatusState>('personnel-status', usePersonnelStatusStore, initialData, () => runner.invalidate());

const refreshAfterAck = async (userId: string, kind: QueuedPersonnelWriteKind): Promise<void> => {
  const store = usePersonnelStatusStore.getState();
  const own = getDataSessionScope()?.userId === userId;
  await Promise.all([
    own ? (kind === 'status' ? store.fetchCurrentStatus({ bypassCache: true }) : store.fetchCurrentStaffing({ bypassCache: true })) : Promise.resolve(),
    usePersonnelStore.getState().fetchPersonnel({ bypassCache: true }),
  ]);
};

export const personnelStatusSetHandler = defineDataHandler<SavePersonStatusInput, SavePersonStatusResult>({
  type: PERSONNEL_STATUS_SET_EVENT,
  optimisticApply: (event) => {
    const { payload } = event;
    usePersonnelStatusStore
      .getState()
      .applyQueuedWrite({ localId: event.id, kind: 'status', userId: payload.UserId, type: payload.Type, respondingTo: payload.RespondingTo, note: payload.Note, createdAt: event.createdAt, state: 'queued' });
  },
  send: async (event, context) => assertV4Success(await savePersonStatus(getDataApiContext(), { ...event.payload, EventId: context.idempotencyKey })),
  afterAck: async (event) => {
    usePersonnelStatusStore.getState().setQueuedWriteState(event.id, null);
    await refreshAfterAck(event.payload.UserId, 'status');
  },
  rollback: (event, reason) => usePersonnelStatusStore.getState().setQueuedWriteState(event.id, reason === 'discarded' ? null : 'rejected'),
});

export const personnelStaffingSetHandler = defineDataHandler<SavePersonnelStaffingInput, SavePersonStaffingResult>({
  type: PERSONNEL_STAFFING_SET_EVENT,
  optimisticApply: (event) => {
    const { payload } = event;
    usePersonnelStatusStore
      .getState()
      .applyQueuedWrite({ localId: event.id, kind: 'staffing', userId: payload.UserId, type: payload.Type, respondingTo: '', note: payload.Note ?? '', createdAt: event.createdAt, state: 'queued' });
  },
  send: async (event, context) => assertV4Success(await savePersonStaffing(getDataApiContext(), { ...event.payload, EventId: context.idempotencyKey })),
  afterAck: async (event) => {
    usePersonnelStatusStore.getState().setQueuedWriteState(event.id, null);
    await refreshAfterAck(event.payload.UserId, 'staffing');
  },
  rollback: (event, reason) => usePersonnelStatusStore.getState().setQueuedWriteState(event.id, reason === 'discarded' ? null : 'rejected'),
});
