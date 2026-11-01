import {
  acknowledgeFieldRecordAssignment,
  completeFieldRecordAssignment,
  createRecordDraft,
  finalizeRecord,
  getFieldRecordPrefill,
  getFieldRecordsCatalog,
  getRecordDefinitionVersion,
  saveRecordDraft,
  submitRecordForReview,
  syncFieldRecords,
} from '@resgrid/api';
import type { VariantId } from '@resgrid/config';
import {
  type FieldRecordAssignmentData,
  type FieldRecordCatalogData,
  type FieldRecordCatalogEntry,
  type FieldRecordConflictKind,
  type FieldRecordContextInput,
  type FieldRecordPrefillData,
  type RecordData,
  type RecordDefinitionSchema,
  type RecordSummaryData,
  type RecordValueInput,
  RmsOriginClient,
  RmsRecordState,
  type SaveRecordDraftInput,
} from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapItem } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { defineDataHandler, submitWrite, type WriteResult } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext, getDataVariant } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

export const RECORD_DRAFT_SAVE_EVENT = 'records.draft.save';
export const RECORD_COMMAND_EVENT = 'records.command';

const SYNC_TAKE = 200;
/** The renderer contract this client implements (records.v1c). */
export const RECORDS_CLIENT_CAPABILITY = 'records.v1c';

const ORIGIN_BY_VARIANT: Record<VariantId, RmsOriginClient | null> = {
  responder: RmsOriginClient.Responder,
  unit: RmsOriginClient.Unit,
  ic: RmsOriginClient.IncidentCommand,
  dispatch: RmsOriginClient.Dispatch,
  bigboard: null,
};

/** Records origin client from the variant manifest (each legacy app hard-coded its own). */
export function recordsOriginClient(): RmsOriginClient | null {
  const variant = getDataVariant();
  return variant ? ORIGIN_BY_VARIANT[variant.id] : null;
}

export interface PendingRecordDraft {
  /** Client GUID until the server issues a record id; the draft's idempotency key. */
  clientRecordId: string;
  recordId: string | null;
  definitionKey: string;
  definitionVersion: number;
  name: string;
  values: RecordValueInput[];
  callId?: number | null;
  stationGroupId?: number | null;
  rowVersion?: number | null;
  updatedOn: string;
  /** Set when the last push was refused; the person is told rather than the write being replayed. */
  lastError?: DataError | null;
  conflict?: FieldRecordConflictKind | null;
  /** Queued in the outbox and not yet acknowledged. */
  queued?: boolean;
}

export type RecordCommandKind = 'submitForReview' | 'finalize';

export interface RecordCommandPayload {
  kind: RecordCommandKind;
  recordId: string;
  rowVersion: number;
  attested?: boolean;
}

type RecordsSlice = 'catalog' | 'sync' | 'schema' | 'prefill' | 'assignment';

interface RecordsData extends SliceMeta<RecordsSlice> {
  catalog: FieldRecordCatalogData | null;
  assignments: FieldRecordAssignmentData[];
  recent: RecordSummaryData[];
  drafts: RecordSummaryData[];
  pendingDrafts: Record<string, PendingRecordDraft>;
  schemas: Record<string, RecordDefinitionSchema>;
  scopeStamp: string | null;
  lastSyncTimestampMs: number;
  /** The context the synced lists were built for; only a sync for the same context may ask for a delta (Unit). */
  syncedContextKey: string | null;
  context: FieldRecordContextInput;
}

export interface RecordsState extends RecordsData {
  setContext: (context: FieldRecordContextInput) => void;
  fetchCatalog: (options?: FetchOptions) => Promise<FieldRecordCatalogData | null>;
  sync: (options?: { full?: boolean }) => Promise<void>;
  fetchSchema: (definitionKey: string, version: number) => Promise<RecordDefinitionSchema | null>;
  prefill: (definitionKey: string, version: number) => Promise<FieldRecordPrefillData | null>;
  stageDraft: (draft: PendingRecordDraft) => void;
  discardDraft: (clientRecordId: string) => void;
  /** Bounded RMS drafts are offline-capable: queued with the client record id as idempotency key. */
  pushDraft: (clientRecordId: string) => Promise<WriteResult | null>;
  /** Legal transitions never replay silently (plan §8.3 `requiresOnlineAuth`): they wait for a fresh authorization and confirmation. */
  submitForReview: (recordId: string, rowVersion: number) => Promise<WriteResult>;
  finalize: (recordId: string, rowVersion: number, attested: boolean) => Promise<WriteResult>;
  acknowledgeAssignment: (assignmentId: string, rowVersion: number) => Promise<boolean>;
  completeAssignment: (assignmentId: string, rowVersion: number) => Promise<boolean>;
  entryFor: (definitionKey: string, version?: number) => FieldRecordCatalogEntry | null;
  // Used by the outbox handler.
  markDraftQueued: (clientRecordId: string, queued: boolean) => void;
  applyDraftResult: (clientRecordId: string, record: RecordData) => void;
  markDraftRefused: (clientRecordId: string, error: DataError | null) => void;
}

const initialData = (): RecordsData => ({
  ...emptySliceMeta<RecordsSlice>(),
  catalog: null,
  assignments: [],
  recent: [],
  drafts: [],
  pendingDrafts: {},
  schemas: {},
  scopeStamp: null,
  lastSyncTimestampMs: 0,
  syncedContextKey: null,
  context: {},
});

const contextKey = (context: FieldRecordContextInput): string => JSON.stringify([context.CallId ?? null, context.UnitId ?? null, context.GroupId ?? null, context.CommandRole ?? null, context.ContactId ?? null]);

const catalogInput = (context: FieldRecordContextInput) => ({ OriginClient: recordsOriginClient() ?? RmsOriginClient.Api, ClientCapability: RECORDS_CLIENT_CAPABILITY, Context: context });

/** Merges a sync page into the cached recent list: tombstones evicted, newest first, capped. */
export const mergeRecentRecords = (existing: RecordSummaryData[], page: RecordSummaryData[], tombstones: string[]): RecordSummaryData[] => {
  const dead = new Set(tombstones);
  const merged = new Map<string, RecordSummaryData>();
  for (const record of existing) if (!dead.has(record.RecordId)) merged.set(record.RecordId, record);
  for (const record of page) {
    if (record.IsTombstone || dead.has(record.RecordId)) merged.delete(record.RecordId);
    else merged.set(record.RecordId, record);
  }
  return [...merged.values()].sort((a, b) => (b.ModifiedOn ?? '').localeCompare(a.ModifiedOn ?? '')).slice(0, SYNC_TAKE);
};

let runner: SliceRunner<RecordsSlice, RecordsState>;

export const useRecordsStore = create<RecordsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<RecordsSlice, RecordsState>('records', set);
      const ctx = () => getDataApiContext();
      return {
        ...initialData(),

        setContext: (context) => set({ context }),

        fetchCatalog: async () => {
          const context = get().context;
          const result = await runner.run(
            'catalog',
            async () => unwrapItem(await getFieldRecordsCatalog(ctx(), catalogInput(context))),
            (catalog, state) =>
              // An answer for a context that is no longer current is dropped (Unit race guard).
              contextKey(state.context) === contextKey(context) ? { catalog } : {}
          );
          return result.ok ? result.value : null;
        },

        sync: async (options) => {
          const context = get().context;
          const key = contextKey(context);
          const rebuild = get().syncedContextKey !== key;
          const full = options?.full === true || rebuild;
          let resetAndRetry = false;
          await runner.run(
            'sync',
            async () =>
              unwrapItem(await syncFieldRecords(ctx(), { ...catalogInput(context), Since: full ? 0 : get().lastSyncTimestampMs, ScopeStamp: full ? null : get().scopeStamp, Take: SYNC_TAKE, IncludeCatalog: true })),
            (bundle, state) => {
              if (!bundle || contextKey(state.context) !== key) return {};
              if (bundle.ResetRequired) {
                // Scope changed: server lists are dropped; staged drafts survive (they are this person's unsent work).
                resetAndRetry = !full;
                return { catalog: bundle.Catalog ?? null, recent: [], drafts: [], assignments: [], scopeStamp: bundle.ScopeStamp ?? null, lastSyncTimestampMs: 0, syncedContextKey: key };
              }
              return {
                catalog: bundle.Catalog ?? state.catalog,
                recent: mergeRecentRecords(rebuild ? [] : state.recent, bundle.Records ?? [], bundle.Tombstones ?? []),
                drafts: bundle.Drafts ?? [],
                assignments: bundle.Assignments ?? [],
                scopeStamp: bundle.ScopeStamp ?? state.scopeStamp,
                lastSyncTimestampMs: bundle.ServerTimestampMs > 0 ? bundle.ServerTimestampMs : state.lastSyncTimestampMs,
                syncedContextKey: key,
              };
            },
            { flightKey: `sync:${key}` }
          );
          if (resetAndRetry) await get().sync({ full: true });
        },

        fetchSchema: async (definitionKey, version) => {
          const key = `${definitionKey}:${version}`;
          const cached = get().schemas[key];
          if (cached) return cached;
          const result = await runner.run(
            'schema',
            async () => unwrapItem(await getRecordDefinitionVersion(ctx(), { key: definitionKey, version }))?.Schema ?? null,
            (schema, state) => (schema ? { schemas: { ...state.schemas, [key]: schema } } : {}),
            { flightKey: `schema:${key}` }
          );
          return result.ok ? result.value : null;
        },

        prefill: async (definitionKey, version) => {
          const context = get().context;
          const result = await runner.run(
            'prefill',
            async () => unwrapItem(await getFieldRecordPrefill(ctx(), { DefinitionKey: definitionKey, Version: version, OriginClient: recordsOriginClient(), Context: context })),
            () => ({}),
            { flightKey: `prefill:${definitionKey}:${version}` }
          );
          return result.ok ? result.value : null;
        },

        stageDraft: (draft) => set((state) => ({ pendingDrafts: { ...state.pendingDrafts, [draft.clientRecordId]: { ...draft, lastError: null, conflict: null } } })),

        discardDraft: (clientRecordId) =>
          set((state) => {
            const pendingDrafts = { ...state.pendingDrafts };
            delete pendingDrafts[clientRecordId];
            return { pendingDrafts };
          }),

        pushDraft: async (clientRecordId) => {
          const draft = get().pendingDrafts[clientRecordId];
          if (!draft) return null;
          return submitWrite<PendingRecordDraft>({ type: RECORD_DRAFT_SAVE_EVENT, payload: draft, coalesceKey: `record-draft:${clientRecordId}` });
        },

        submitForReview: (recordId, rowVersion) =>
          submitWrite<RecordCommandPayload>({ type: RECORD_COMMAND_EVENT, payload: { kind: 'submitForReview', recordId, rowVersion }, requiresOnlineAuth: true }, { deliverNow: false }),

        finalize: (recordId, rowVersion, attested) =>
          submitWrite<RecordCommandPayload>({ type: RECORD_COMMAND_EVENT, payload: { kind: 'finalize', recordId, rowVersion, attested }, requiresOnlineAuth: true }, { deliverNow: false }),

        acknowledgeAssignment: async (assignmentId, rowVersion) => {
          const result = await runner.run(
            'assignment',
            async () => unwrapItem(assertV4Success(await acknowledgeFieldRecordAssignment(ctx(), { AssignmentId: assignmentId, RowVersion: rowVersion, Context: get().context }))),
            (assignment, state) => ({
              assignments: assignment ? state.assignments.map((existing) => (existing.AssignmentId === assignmentId ? assignment : existing)) : state.assignments,
            })
          );
          return result.ok;
        },

        completeAssignment: async (assignmentId, rowVersion) => {
          const result = await runner.run(
            'assignment',
            async () => unwrapItem(assertV4Success(await completeFieldRecordAssignment(ctx(), { AssignmentId: assignmentId, RowVersion: rowVersion, Context: get().context }))),
            (assignment, state) => ({
              assignments: assignment ? state.assignments.map((existing) => (existing.AssignmentId === assignmentId ? assignment : existing)) : state.assignments,
            })
          );
          return result.ok;
        },

        entryFor: (definitionKey, version) => get().catalog?.Definitions.find((entry) => entry.DefinitionKey.toLowerCase() === definitionKey.toLowerCase() && (version === undefined || entry.Version === version)) ?? null,

        markDraftQueued: (clientRecordId, queued) =>
          set((state) => {
            const draft = state.pendingDrafts[clientRecordId];
            return draft ? { pendingDrafts: { ...state.pendingDrafts, [clientRecordId]: { ...draft, queued } } } : {};
          }),

        applyDraftResult: (clientRecordId, record) =>
          set((state) => {
            const draft = state.pendingDrafts[clientRecordId];
            if (!draft) return {};
            // The server copy is now the source of truth; keep the staged entry only as the continuation point.
            return { pendingDrafts: { ...state.pendingDrafts, [clientRecordId]: { ...draft, recordId: record.RecordId, rowVersion: record.RowVersion, queued: false, lastError: null, conflict: null } } };
          }),

        markDraftRefused: (clientRecordId, error) =>
          set((state) => {
            const draft = state.pendingDrafts[clientRecordId];
            const conflict: FieldRecordConflictKind | null = error?.code === 'conflict' ? 'etag' : error?.code === 'forbidden' ? 'permission' : null;
            return draft ? { pendingDrafts: { ...state.pendingDrafts, [clientRecordId]: { ...draft, queued: false, lastError: error, conflict } } } : {};
          }),
      };
    },
    dataPersistOptions<RecordsState, Pick<RecordsData, 'pendingDrafts' | 'scopeStamp' | 'lastSyncTimestampMs'>>({
      // Frozen legacy name and shape: only the device's unsent work and the sync cursor are kept (Unit).
      name: 'records-field-storage',
      partialize: (state) => ({ pendingDrafts: state.pendingDrafts, scopeStamp: state.scopeStamp, lastSyncTimestampMs: state.lastSyncTimestampMs }),
    })
  )
);

registerPersistedStore('records-field-storage', useRecordsStore);
// Responder sign-out reset: a send in flight at sign-out must not write the previous session's draft back.
registerDataStoreReset<RecordsState>('records', useRecordsStore, initialData, () => runner.invalidate());

const draftBody = (draft: PendingRecordDraft, idempotencyKey: string): SaveRecordDraftInput =>
  ({
    RecordId: draft.recordId,
    RowVersion: draft.rowVersion ?? null,
    IdempotencyKey: idempotencyKey,
    ClientRecordId: draft.clientRecordId,
    DefinitionKey: draft.definitionKey,
    CallId: draft.callId ?? null,
    StationGroupId: draft.stationGroupId ?? null,
    Values: draft.values,
    OriginClient: recordsOriginClient(),
  }) as SaveRecordDraftInput;

/** Draft create/save: the client record id is the idempotency key, so a replay returns the same record. */
export const recordDraftSaveHandler = defineDataHandler<PendingRecordDraft, RecordData | null>({
  type: RECORD_DRAFT_SAVE_EVENT,
  optimisticApply: (event) => useRecordsStore.getState().markDraftQueued(event.payload.clientRecordId, true),
  send: async (event) => {
    const draft = event.payload;
    // Create keys on the draft's own client id (stable across re-queues of the same draft).
    const body = draftBody(draft, draft.clientRecordId);
    const result = draft.recordId ? await saveRecordDraft(getDataApiContext(), body) : await createRecordDraft(getDataApiContext(), body);
    return unwrapItem(assertV4Success(result));
  },
  afterAck: (event, record) => {
    if (record) useRecordsStore.getState().applyDraftResult(event.payload.clientRecordId, record);
    else useRecordsStore.getState().markDraftQueued(event.payload.clientRecordId, false);
  },
  rollback: (event, reason) => {
    if (reason === 'discarded') useRecordsStore.getState().markDraftQueued(event.payload.clientRecordId, false);
    else useRecordsStore.getState().markDraftRefused(event.payload.clientRecordId, toDataError(new Error('refused')));
  },
});

/** Submit for review / finalize: queued with `requiresOnlineAuth`, so the outbox only sends after `confirmOnlineAuth()`. */
export const recordCommandHandler = defineDataHandler<RecordCommandPayload, RecordData | null>({
  type: RECORD_COMMAND_EVENT,
  send: async (event, context) => {
    const { kind, recordId, rowVersion, attested } = event.payload;
    const body = { RecordId: recordId, RowVersion: rowVersion, IdempotencyKey: context.idempotencyKey, OriginClient: recordsOriginClient(), ...(kind === 'finalize' ? { Attested: attested === true } : {}) };
    const result = kind === 'finalize' ? await finalizeRecord(getDataApiContext(), body) : await submitRecordForReview(getDataApiContext(), body);
    return unwrapItem(assertV4Success(result));
  },
  afterAck: () => useRecordsStore.getState().sync(),
});

export const selectOwnDrafts = (state: Pick<RecordsState, 'drafts'>): RecordSummaryData[] => state.drafts.filter((record) => record.State === RmsRecordState.Draft);
export const selectReturnedRecords = (state: Pick<RecordsState, 'drafts'>): RecordSummaryData[] => state.drafts.filter((record) => record.State === RmsRecordState.Returned);
export const selectOpenAssignments = (state: Pick<RecordsState, 'assignments'>): FieldRecordAssignmentData[] =>
  state.assignments.filter((assignment) => assignment.State === 'Open' || assignment.State === 'Acknowledged');
