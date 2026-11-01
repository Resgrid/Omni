import {
  type CallFileUpload,
  type CloseCallRequest,
  closeCallWith,
  deleteCall,
  getCall,
  getCallExtraData,
  getCallFiles,
  getCallLocationHistory,
  getCallNotes,
  getCallSiteInfo,
  rescheduleCallDispatch,
  updateCall,
  type UpdateCallRequest,
} from '@resgrid/api';
import type { CallExtraDataResultData, CallFileResultData, CallNoteResultData, CallResultData, CallSiteInfoData, LocationHistoryData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapItem, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { submitWrite, type WriteResult } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { dataNow, getDataApiContext, getDataSessionScope } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

export const CALL_NOTE_ADD_EVENT = 'calls.note.add';
export const CALL_FILE_UPLOAD_EVENT = 'calls.file.upload';

/** Detail records kept on the device (offline "detail of the call responded to"); oldest dropped first. */
export const CALL_DETAIL_CACHE_LIMIT = 25;

/** Core CallFiles types. */
export const CallFileKind = { Audio: 1, Image: 2, File: 3, Video: 4 } as const;

export type QueuedWriteState = 'queued' | 'rejected';

export type CallNoteListItem = CallNoteResultData & { queued?: { localId: string; state: QueuedWriteState } };

export interface CallDetailRecord {
  call: CallResultData | null;
  extraData: CallExtraDataResultData | null;
  notes: CallNoteResultData[];
  images: CallFileResultData[] | null;
  files: CallFileResultData[] | null;
  audio: CallFileResultData[] | null;
  /** Not persisted: signed links expire (GetCallSiteInfo contract). */
  siteInfo?: CallSiteInfoData | null;
  locationHistory?: LocationHistoryData | null;
  fetchedAt: number;
}

export interface QueuedCallNote {
  localId: string;
  callId: string;
  note: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: number;
  state: QueuedWriteState;
}

/** Upload metadata queued for a call file. Bytes come from `data` (small files) or the staged file at `stagedUri`. */
export interface QueuedCallFile {
  localId: string;
  callId: string;
  type: number;
  name: string;
  note: string;
  latitude: number | null;
  longitude: number | null;
  stagedUri: string | null;
  createdAt: number;
  state: QueuedWriteState;
}

type DetailSlice = 'detail' | 'notes' | 'images' | 'files' | 'audio' | 'siteInfo' | 'locationHistory';

interface CallDetailData extends SliceMeta<DetailSlice> {
  details: Record<string, CallDetailRecord>;
  queuedNotes: Record<string, QueuedCallNote>;
  queuedFiles: Record<string, QueuedCallFile>;
  /** Last refused online write (update/close/delete/reschedule); the loaded call stays usable. */
  writeError: DataError | null;
  isWriting: boolean;
}

export interface AddCallNoteInput {
  callId: string;
  note: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface QueueCallFileInput {
  callId: string;
  type: number;
  name: string;
  note?: string;
  latitude?: number | null;
  longitude?: number | null;
  /** Base64 content for small files. */
  data?: string;
  /** A file already staged in the app sandbox (preferred for images/video). */
  stagedUri?: string;
}

export interface CallDetailState extends CallDetailData {
  fetchCallDetail: (callId: string, options?: FetchOptions) => Promise<void>;
  fetchCallNotes: (callId: string, options?: FetchOptions) => Promise<void>;
  fetchCallImages: (callId: string, options?: FetchOptions) => Promise<void>;
  fetchCallFiles: (callId: string, options?: FetchOptions) => Promise<void>;
  fetchCallAudio: (callId: string, options?: FetchOptions) => Promise<void>;
  fetchCallSiteInfo: (callId: string, options?: FetchOptions) => Promise<void>;
  fetchCallLocationHistory: (callId: string, options?: FetchOptions) => Promise<void>;
  /** Offline-capable: queued through the outbox, shown immediately with a queued marker. */
  addNote: (input: AddCallNoteInput) => Promise<WriteResult>;
  /** Offline-capable: queues upload metadata; the bytes are read when the upload is sent. */
  uploadCallFile: (input: QueueCallFileInput) => Promise<WriteResult>;
  updateCall: (request: UpdateCallRequest) => Promise<void>;
  closeCall: (request: CloseCallRequest) => Promise<void>;
  deleteCall: (callId: string) => Promise<void>;
  rescheduleDispatchTime: (callId: string, date: string) => Promise<void>;
  clearCallFiles: (callId: string) => void;
  // Used by outbox handlers.
  applyQueuedNote: (note: QueuedCallNote) => void;
  setQueuedNoteState: (localId: string, state: QueuedWriteState | null) => void;
  applyQueuedFile: (file: QueuedCallFile) => void;
  setQueuedFileState: (localId: string, state: QueuedWriteState | null) => void;
}

const initialData = (): CallDetailData => ({ ...emptySliceMeta<DetailSlice>(), details: {}, queuedNotes: {}, queuedFiles: {}, writeError: null, isWriting: false });

const emptyRecord = (): CallDetailRecord => ({ call: null, extraData: null, notes: [], images: null, files: null, audio: null, fetchedAt: 0 });

const capDetails = (details: Record<string, CallDetailRecord>): Record<string, CallDetailRecord> => {
  const entries = Object.entries(details);
  if (entries.length <= CALL_DETAIL_CACHE_LIMIT) return details;
  entries.sort((a, b) => b[1].fetchedAt - a[1].fetchedAt);
  return Object.fromEntries(entries.slice(0, CALL_DETAIL_CACHE_LIMIT));
};

const patchRecord = (state: CallDetailData, callId: string, patch: Partial<CallDetailRecord>): Pick<CallDetailData, 'details'> => ({
  details: capDetails({ ...state.details, [callId]: { ...(state.details[callId] ?? emptyRecord()), ...patch } }),
});

/** Server notes for a call followed by this device's queued notes (marked). */
export const selectCallNotes = (state: Pick<CallDetailData, 'details' | 'queuedNotes'>, callId: string): CallNoteListItem[] => {
  const server: CallNoteListItem[] = state.details[callId]?.notes ?? [];
  const session = getDataSessionScope();
  const queued: CallNoteListItem[] = Object.values(state.queuedNotes)
    .filter((note) => note.callId === callId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((note) => ({
      CallId: note.callId,
      CallNoteId: note.localId,
      UserId: session?.userId ?? '',
      Source: 0,
      TimestampFormatted: '',
      Timestamp: new Date(note.createdAt).toISOString(),
      TimestampUtc: new Date(note.createdAt).toISOString(),
      Note: note.note,
      Latitude: note.latitude,
      Longitude: note.longitude,
      FullName: session?.displayName ?? '',
      queued: { localId: note.localId, state: note.state },
    }));
  return [...server, ...queued];
};

/** Dispatch note search over a call's notes. */
export const searchCallNotes = (notes: CallNoteResultData[], query: string): CallNoteResultData[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return notes;
  return notes.filter((note) => note.Note.toLowerCase().includes(needle) || note.FullName.toLowerCase().includes(needle));
};

let runner: SliceRunner<DetailSlice, CallDetailState>;

export const useCallDetailStore = create<CallDetailState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<DetailSlice, CallDetailState>('call-detail', set);
      const fileFetch = (slice: 'images' | 'files' | 'audio', type: number) => async (callId: string) => {
        await runner.run(
          slice,
          async () => unwrapList(await getCallFiles(getDataApiContext(), { callId, includeData: false, type })),
          (list, state) => patchRecord(state, callId, { [slice]: list }),
          { flightKey: `${slice}:${callId}` }
        );
      };
      const write = async (fn: () => Promise<void>): Promise<void> => {
        set({ isWriting: true, writeError: null });
        try {
          await fn();
          set({ isWriting: false });
        } catch (error) {
          // A refused save is not a failed load (Dispatch): keep the loaded call, report the refusal.
          set({ isWriting: false, writeError: toDataError(error) });
          throw error;
        }
      };

      return {
        ...initialData(),

        fetchCallDetail: async (callId) => {
          await runner.run(
            'detail',
            async () => {
              const [call, extraData] = await Promise.all([getCall(getDataApiContext(), { callId }), getCallExtraData(getDataApiContext(), { callId })]);
              return { call: unwrapItem(call), extraData: unwrapItem(extraData) };
            },
            (value, state) => patchRecord(state, callId, { ...value, fetchedAt: dataNow() }),
            { flightKey: `detail:${callId}` }
          );
        },

        fetchCallNotes: async (callId) => {
          await runner.run(
            'notes',
            async () => unwrapList(await getCallNotes(getDataApiContext(), { callId })),
            (notes, state) => patchRecord(state, callId, { notes }),
            { flightKey: `notes:${callId}` }
          );
        },

        fetchCallImages: fileFetch('images', CallFileKind.Image),
        fetchCallFiles: fileFetch('files', CallFileKind.File),
        fetchCallAudio: fileFetch('audio', CallFileKind.Audio),

        fetchCallSiteInfo: async (callId) => {
          await runner.run(
            'siteInfo',
            async () => unwrapItem(await getCallSiteInfo(getDataApiContext(), { callId })),
            (siteInfo, state) => patchRecord(state, callId, { siteInfo }),
            { flightKey: `siteInfo:${callId}` }
          );
        },

        fetchCallLocationHistory: async (callId) => {
          await runner.run(
            'locationHistory',
            async () => unwrapItem(await getCallLocationHistory(getDataApiContext(), { callId })),
            (locationHistory, state) => patchRecord(state, callId, { locationHistory }),
            { flightKey: `locationHistory:${callId}` }
          );
        },

        addNote: async (input) => submitWrite<CallNotePayload>({ type: CALL_NOTE_ADD_EVENT, payload: { callId: input.callId, note: input.note, latitude: input.latitude ?? null, longitude: input.longitude ?? null } }),

        uploadCallFile: async (input) =>
          submitWrite<CallFilePayload>({
            type: CALL_FILE_UPLOAD_EVENT,
            payload: {
              callId: input.callId,
              type: input.type,
              name: input.name,
              note: input.note ?? '',
              latitude: input.latitude ?? null,
              longitude: input.longitude ?? null,
              data: input.data ?? null,
              stagedUri: input.stagedUri ?? null,
            },
          }),

        updateCall: (request) =>
          write(async () => {
            assertV4Success(await updateCall(getDataApiContext(), request));
            await get().fetchCallDetail(request.callId);
          }),

        closeCall: (request) =>
          write(async () => {
            assertV4Success(await closeCallWith(getDataApiContext(), request));
          }),

        deleteCall: (callId) =>
          write(async () => {
            assertV4Success(await deleteCall(getDataApiContext(), { callId }));
            set((state) => {
              const details = { ...state.details };
              delete details[callId];
              return { details };
            });
          }),

        rescheduleDispatchTime: (callId, date) =>
          write(async () => {
            assertV4Success(await rescheduleCallDispatch(getDataApiContext(), callId, date));
            await get().fetchCallDetail(callId);
          }),

        clearCallFiles: (callId) => set((state) => patchRecord(state, callId, { images: null, files: null, audio: null })),

        applyQueuedNote: (note) => set((state) => ({ queuedNotes: { ...state.queuedNotes, [note.localId]: note } })),

        setQueuedNoteState: (localId, noteState) =>
          set((state) => {
            const queuedNotes = { ...state.queuedNotes };
            const existing = queuedNotes[localId];
            if (!existing) return {};
            if (noteState === null) delete queuedNotes[localId];
            else queuedNotes[localId] = { ...existing, state: noteState };
            return { queuedNotes };
          }),

        applyQueuedFile: (file) => set((state) => ({ queuedFiles: { ...state.queuedFiles, [file.localId]: file } })),

        setQueuedFileState: (localId, fileState) =>
          set((state) => {
            const queuedFiles = { ...state.queuedFiles };
            const existing = queuedFiles[localId];
            if (!existing) return {};
            if (fileState === null) delete queuedFiles[localId];
            else queuedFiles[localId] = { ...existing, state: fileState };
            return { queuedFiles };
          }),
      };
    },
    dataPersistOptions<CallDetailState, Pick<CallDetailData, 'details' | 'queuedNotes' | 'queuedFiles'>>({
      name: 'omni-call-detail-storage',
      partialize: (state) => ({
        // Site info carries signed links that expire; location history is re-read online.
        details: Object.fromEntries(Object.entries(state.details).map(([id, record]) => [id, { ...record, siteInfo: undefined, locationHistory: undefined }])),
        queuedNotes: state.queuedNotes,
        queuedFiles: state.queuedFiles,
      }),
    })
  )
);

export interface CallNotePayload {
  callId: string;
  note: string;
  latitude: number | null;
  longitude: number | null;
}

export interface CallFilePayload {
  callId: string;
  type: number;
  name: string;
  note: string;
  latitude: number | null;
  longitude: number | null;
  data: string | null;
  stagedUri: string | null;
}

/** Reads a staged attachment as base64 when its upload is sent. Injected by the app (expo-file-system / Electron bridge). */
export type CallFileReader = (stagedUri: string) => Promise<string>;

let fileReader: CallFileReader | null = null;

export function setCallFileReader(reader: CallFileReader | null): void {
  fileReader = reader;
}

/** Bytes for a queued upload. TODO(offline attachments staging): the staging area, orphan cleanup (24 h) and retention live in @resgrid/offline. */
export async function readQueuedFileData(payload: Pick<CallFilePayload, 'data' | 'stagedUri'>): Promise<string> {
  if (payload.data) return payload.data;
  if (payload.stagedUri && fileReader) return fileReader(payload.stagedUri);
  throw new Error('No attachment data or reader for the queued upload.');
}

export const toCallFileUpload = (payload: CallFilePayload, userId: string, data: string): CallFileUpload => ({
  callId: payload.callId,
  userId,
  type: payload.type,
  name: payload.name,
  note: payload.note,
  data,
  latitude: payload.latitude,
  longitude: payload.longitude,
});

registerPersistedStore('omni-call-detail-storage', useCallDetailStore);
registerDataStoreReset<CallDetailState>('call-detail', useCallDetailStore, initialData, () => runner.invalidate());
