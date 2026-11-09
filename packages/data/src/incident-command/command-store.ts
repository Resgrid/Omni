import { getAdHocPersonnel, getAdHocUnits, getCommandBoard, getCommandList, getCommandTimeline, getSyncBundle } from '@resgrid/api';
import type { CommandLogEntry, IncidentAdHocPersonnel, IncidentAdHocUnit, IncidentCommandBoard, IncidentCommandSummary } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { unwrapItem, unwrapList } from '../core/envelope';
import { submitWrite, type WriteResult } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { dataNow, getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

/** The IC event types (plan §8.5: all 26 replay through the outbox). */
export const IC_EVENT = {
  establishCommand: 'ic.command.establish',
  closeCommand: 'ic.command.close',
  closeCall: 'ic.call.close',
  updateCommandDetails: 'ic.command.details',
  assignRole: 'ic.role.assign',
  removeRole: 'ic.role.remove',
  createAdHocUnit: 'ic.adhocUnit.create',
  releaseAdHocUnit: 'ic.adhocUnit.release',
  createAdHocPersonnel: 'ic.adhocPersonnel.create',
  releaseAdHocPersonnel: 'ic.adhocPersonnel.release',
  saveNode: 'ic.node.save',
  updateNode: 'ic.node.update',
  deleteNode: 'ic.node.delete',
  assignResource: 'ic.resource.assign',
  moveResource: 'ic.resource.move',
  releaseResource: 'ic.resource.release',
  saveObjective: 'ic.objective.save',
  completeObjective: 'ic.objective.complete',
  updateObjectiveProgress: 'ic.objective.progress',
  saveNeed: 'ic.need.save',
  setNeedStatus: 'ic.need.status',
  startTimer: 'ic.timer.start',
  acknowledgeTimer: 'ic.timer.ack',
  saveAnnotation: 'ic.annotation.save',
  deleteAnnotation: 'ic.annotation.delete',
  addNote: 'ic.note.add',
} as const;

export type IcEventType = (typeof IC_EVENT)[keyof typeof IC_EVENT];

/** Board collections an optimistic local row can live in until its queued create is acknowledged. */
export type BoardCollection = 'Nodes' | 'Assignments' | 'Objectives' | 'Needs' | 'Roles' | 'Timers' | 'Annotations' | 'Notes';

export interface IcEventPayload {
  callId: string;
  /** Path/query parameters (ids) for release/delete style actions. */
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  /** Fill `IncidentCommandId` from the server board at send time (writes queued before the command existed). */
  resolveCommandId?: boolean;
  /** Optimistic row added to the board while the event is queued (`local-<eventId>` id). */
  local?: { collection: BoardCollection; idField: string };
}

export interface CommandBoardState {
  callId: string;
  board: IncidentCommandBoard | null;
  adHocUnits: IncidentAdHocUnit[];
  adHocPersonnel: IncidentAdHocPersonnel[];
  /** Established offline: not on the server yet. */
  isProvisional: boolean;
  lastRefreshed: number | null;
  timeline?: CommandLogEntry[];
}

/** An optimistic row tracked until its outbox event settles (IC `preserveQueuedLocalRows`, keyed by event id). */
export interface PendingLocalRow {
  eventId: string;
  callId: string;
  collection: BoardCollection;
  row: Record<string, unknown>;
}

/** Optimistic rows carry `local-<eventId>` ids until the server acknowledges their create. */
export const LOCAL_ID_PREFIX = 'local-';

/** The server id an acknowledged create gave its optimistic row (keyed by the row's `local-<eventId>` id). */
export interface ResolvedLocalId {
  callId: string;
  serverId: string;
  resolvedAt: number;
}

/**
 * Retention for `resolvedLocalIds`: writes queued against an optimistic row replay right after its create (one order
 * per incident), so a mapping is only needed while those writes are still being retried.
 */
export const RESOLVED_LOCAL_ID_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const pruneResolvedLocalIds = (resolved: Record<string, ResolvedLocalId>, now: number): Record<string, ResolvedLocalId> =>
  Object.fromEntries(Object.entries(resolved).filter(([, entry]) => now - entry.resolvedAt <= RESOLVED_LOCAL_ID_RETENTION_MS));

export interface EndCommandOptions {
  closeCall?: { type: number; notes?: string; sendNotification?: boolean };
}

export interface EndCommandResult {
  command: WriteResult | null;
  call: WriteResult | null;
}

type CommandSlice = 'board' | 'sync' | 'incidents' | 'timeline';

interface CommandData extends SliceMeta<CommandSlice> {
  boards: Record<string, CommandBoardState>;
  activeCallId: string | null;
  lastSyncTimestampMs: number;
  pendingLocalRows: Record<string, PendingLocalRow>;
  /**
   * Optimistic row ids whose create the server acknowledged → the server's id, so writes queued against the row while it
   * was pending (moving a resource assigned offline, filling or editing a lane added offline) reach the real row.
   */
  resolvedLocalIds: Record<string, ResolvedLocalId>;
  /** IC incident list (GetCommandList). */
  summaries: IncidentCommandSummary[];
}

export interface CommandState extends CommandData {
  startCommand: (callId: string, commandDefinitionId?: number | null) => Promise<WriteResult | null>;
  switchCommand: (callId: string) => void;
  /** Close command, then (optionally) close the call: the call close depends on the command close (IC ordering rule). */
  endCommand: (callId: string, options?: EndCommandOptions) => Promise<EndCommandResult>;
  refreshBoard: (callId: string, options?: FetchOptions) => Promise<void>;
  /** Shift-start / reconnect: every active board from `/Sync/Bundle`. */
  syncFromServer: () => Promise<void>;
  fetchIncidents: (includeClosed?: boolean) => Promise<void>;
  fetchTimeline: (callId: string) => Promise<void>;
  /** Any IC board write: queued through the outbox (ordered per incident), sent now when online. */
  dispatchCommandEvent: (type: IcEventType, payload: IcEventPayload, options?: { dependsOn?: string[] }) => Promise<WriteResult>;
  // Used by the outbox handlers.
  addLocalRow: (row: PendingLocalRow) => void;
  removeLocalRow: (eventId: string) => void;
  /** Records the server id an acknowledged create gave the row `local-<eventId>` (and drops mappings past retention). */
  resolveLocalId: (eventId: string, callId: string, serverId: string) => void;
  markBoardEstablished: (callId: string) => void;
}

const initialData = (): CommandData => ({ ...emptySliceMeta<CommandSlice>(), boards: {}, activeCallId: null, lastSyncTimestampMs: 0, pendingLocalRows: {}, resolvedLocalIds: {}, summaries: [] });

const emptyBoardState = (callId: string, provisional: boolean): CommandBoardState => ({ callId, board: null, adHocUnits: [], adHocPersonnel: [], isProvisional: provisional, lastRefreshed: null });

/** Writes for one incident replay strictly in order. */
export const incidentOrderKey = (callId: string): string => `ic:${callId}`;

/** Carries optimistic rows whose events are still queued forward onto a fresh server board (no duplicates once acknowledged). */
export const withPendingLocalRows = (callId: string, board: IncidentCommandBoard | null, pending: Record<string, PendingLocalRow>): IncidentCommandBoard | null => {
  if (!board) return board;
  const rows = Object.values(pending).filter((row) => row.callId === callId);
  if (rows.length === 0) return board;
  const next = { ...board } as unknown as Record<string, unknown>;
  for (const row of rows) {
    const current = (next[row.collection] as unknown[] | undefined) ?? [];
    next[row.collection] = [...current, row.row];
  }
  return next as unknown as IncidentCommandBoard;
};

const applyRowToBoard = (entry: CommandBoardState | undefined, row: PendingLocalRow, remove: boolean): CommandBoardState | undefined => {
  if (!entry?.board) return entry;
  const board = { ...entry.board } as unknown as Record<string, unknown>;
  const current = (board[row.collection] as Record<string, unknown>[] | undefined) ?? [];
  board[row.collection] = remove ? current.filter((existing) => existing !== row.row && existing.__localEventId !== row.eventId) : [...current, row.row];
  return { ...entry, board: board as unknown as IncidentCommandBoard };
};

let runner: SliceRunner<CommandSlice, CommandState>;

export const useCommandStore = create<CommandState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<CommandSlice, CommandState>('incident-command', set);
      const ctx = () => getDataApiContext();
      return {
        ...initialData(),

        startCommand: async (callId, commandDefinitionId) => {
          if (get().boards[callId]) {
            set({ activeCallId: callId });
            return null;
          }
          // Provisional board now; the establish replays on reconnect if offline.
          set((state) => ({ boards: { ...state.boards, [callId]: emptyBoardState(callId, true) }, activeCallId: callId }));
          const numericCallId = parseInt(callId, 10);
          const result = await get().dispatchCommandEvent(IC_EVENT.establishCommand, { callId, body: { CallId: Number.isNaN(numericCallId) ? 0 : numericCallId, CommandDefinitionId: commandDefinitionId ?? null } });
          return result;
        },

        switchCommand: (callId) => {
          if (!get().boards[callId]) return;
          set({ activeCallId: callId });
          void get().refreshBoard(callId);
        },

        endCommand: async (callId, options) => {
          const entry = get().boards[callId];
          const incidentCommandId = entry?.board?.Command?.IncidentCommandId;
          let command: WriteResult | null = null;
          if (incidentCommandId && !entry?.isProvisional) {
            command = await get().dispatchCommandEvent(IC_EVENT.closeCommand, { callId, params: { incidentCommandId } });
          }
          // A refused close leaves the command active on the server: the board stays, and the call is not closed (the
          // server refuses to close a call whose command is still active).
          if (command?.outcome === 'rejected') return { command, call: null };
          const boards = { ...get().boards };
          delete boards[callId];
          const remaining = Object.keys(boards);
          set((state) => ({ boards, activeCallId: state.activeCallId === callId ? (remaining[0] ?? null) : state.activeCallId }));
          let call: WriteResult | null = null;
          if (options?.closeCall) {
            call = await get().dispatchCommandEvent(
              IC_EVENT.closeCall,
              { callId, body: { callId, type: options.closeCall.type, note: options.closeCall.notes ?? '', sendNotification: options.closeCall.sendNotification } },
              command ? { dependsOn: [command.id] } : undefined
            );
          }
          return { command, call };
        },

        refreshBoard: async (callId) => {
          await runner.run(
            'board',
            async () => {
              const [board, units, personnel] = await Promise.allSettled([getCommandBoard(ctx(), { callId }), getAdHocUnits(ctx(), { callId }), getAdHocPersonnel(ctx(), { callId })]);
              if (board.status === 'rejected') throw board.reason;
              return {
                board: unwrapItem(board.value),
                adHocUnits: units.status === 'fulfilled' ? unwrapList(units.value).filter((unit) => !unit.ReleasedOn) : null,
                adHocPersonnel: personnel.status === 'fulfilled' ? unwrapList(personnel.value).filter((person) => !person.ReleasedOn) : null,
              };
            },
            (value, state) => {
              const existing = state.boards[callId] ?? emptyBoardState(callId, false);
              return {
                boards: {
                  ...state.boards,
                  [callId]: {
                    ...existing,
                    board: withPendingLocalRows(callId, value.board, state.pendingLocalRows),
                    adHocUnits: value.adHocUnits ?? existing.adHocUnits,
                    adHocPersonnel: value.adHocPersonnel ?? existing.adHocPersonnel,
                    isProvisional: value.board ? false : existing.isProvisional,
                    lastRefreshed: dataNow(),
                  },
                },
              };
            },
            { flightKey: `board:${callId}`, trailing: true }
          );
        },

        syncFromServer: async () => {
          await runner.run(
            'sync',
            async () => unwrapItem(await getSyncBundle(ctx(), { includeAccountability: true })),
            (bundle, state) => {
              if (!bundle) return {};
              const boards = { ...state.boards };
              for (const board of bundle.Boards ?? []) {
                const callId = String(board.Command.CallId);
                const existing = boards[callId] ?? emptyBoardState(callId, false);
                boards[callId] = {
                  ...existing,
                  board: withPendingLocalRows(callId, board, state.pendingLocalRows),
                  adHocUnits: (bundle.AdHocUnits ?? []).filter((unit) => String(unit.CallId) === callId && !unit.ReleasedOn),
                  adHocPersonnel: (bundle.AdHocPersonnel ?? []).filter((person) => String(person.CallId) === callId && !person.ReleasedOn),
                  isProvisional: false,
                  lastRefreshed: dataNow(),
                };
              }
              return { boards, lastSyncTimestampMs: bundle.ServerTimestampMs || state.lastSyncTimestampMs };
            }
          );
        },

        fetchIncidents: async (includeClosed) => {
          await runner.run(
            'incidents',
            async () => unwrapList(await getCommandList(ctx(), { includeClosed: includeClosed === true })),
            (summaries) => ({ summaries })
          );
        },

        fetchTimeline: async (callId) => {
          await runner.run(
            'timeline',
            async () => unwrapList(await getCommandTimeline(ctx(), { callId })),
            (timeline, state) => {
              const existing = state.boards[callId];
              return existing ? { boards: { ...state.boards, [callId]: { ...existing, timeline } } } : {};
            },
            { flightKey: `timeline:${callId}` }
          );
        },

        dispatchCommandEvent: (type, payload, options) => submitWrite<IcEventPayload>({ type, payload, orderKey: incidentOrderKey(payload.callId), ...(options?.dependsOn ? { dependsOn: options.dependsOn } : {}) }),

        addLocalRow: (row) =>
          set((state) => {
            const entry = applyRowToBoard(state.boards[row.callId], row, false);
            return { pendingLocalRows: { ...state.pendingLocalRows, [row.eventId]: row }, ...(entry ? { boards: { ...state.boards, [row.callId]: entry } } : {}) };
          }),

        removeLocalRow: (eventId) =>
          set((state) => {
            const row = state.pendingLocalRows[eventId];
            if (!row) return {};
            const pendingLocalRows = { ...state.pendingLocalRows };
            delete pendingLocalRows[eventId];
            const entry = applyRowToBoard(state.boards[row.callId], row, true);
            return { pendingLocalRows, ...(entry ? { boards: { ...state.boards, [row.callId]: entry } } : {}) };
          }),

        resolveLocalId: (eventId, callId, serverId) =>
          set((state) => {
            const now = dataNow();

            return { resolvedLocalIds: { ...pruneResolvedLocalIds(state.resolvedLocalIds, now), [`${LOCAL_ID_PREFIX}${eventId}`]: { callId, serverId, resolvedAt: now } } };
          }),

        markBoardEstablished: (callId) =>
          set((state) => {
            const entry = state.boards[callId];
            return entry ? { boards: { ...state.boards, [callId]: { ...entry, isProvisional: false } } } : {};
          }),
      };
    },
    dataPersistOptions<CommandState, Pick<CommandData, 'boards' | 'activeCallId' | 'lastSyncTimestampMs' | 'pendingLocalRows' | 'resolvedLocalIds'>>({
      // Frozen: IC's persisted command store (boards, activeCallId, lastSyncTimestampMs); pendingLocalRows and
      // resolvedLocalIds are additive.
      name: 'command-storage',
      partialize: (state) => ({
        boards: state.boards,
        activeCallId: state.activeCallId,
        lastSyncTimestampMs: state.lastSyncTimestampMs,
        pendingLocalRows: state.pendingLocalRows,
        resolvedLocalIds: state.resolvedLocalIds,
      }),
      merge: (persisted, current) => {
        const value = (persisted ?? {}) as Partial<Pick<CommandData, 'boards' | 'activeCallId' | 'lastSyncTimestampMs' | 'pendingLocalRows' | 'resolvedLocalIds'>>;
        const boards = value.boards && typeof value.boards === 'object' ? value.boards : {};
        // Older IC builds persisted boards before Needs existed.
        for (const [callId, entry] of Object.entries(boards)) {
          if (entry?.board) boards[callId] = { ...entry, board: { ...entry.board, Needs: Array.isArray(entry.board.Needs) ? entry.board.Needs : [] } };
        }
        const activeCallId = value.activeCallId && boards[value.activeCallId] ? value.activeCallId : (Object.keys(boards)[0] ?? null);
        return {
          ...current,
          boards,
          activeCallId,
          lastSyncTimestampMs: value.lastSyncTimestampMs ?? 0,
          pendingLocalRows: value.pendingLocalRows ?? {},
          resolvedLocalIds: pruneResolvedLocalIds(value.resolvedLocalIds ?? {}, dataNow()),
        };
      },
    })
  )
);

registerPersistedStore('command-storage', useCommandStore);
registerDataStoreReset<CommandState>('incident-command', useCommandStore, initialData, () => runner.invalidate());

export const selectActiveBoard = (state: Pick<CommandState, 'boards' | 'activeCallId'>): CommandBoardState | null => (state.activeCallId ? (state.boards[state.activeCallId] ?? null) : null);
