import { saveCallNote, uploadCallFile } from '@resgrid/api';
import type { SaveCallFileResult, SaveCallNoteInput, SaveCallNoteResult } from '@resgrid/models';

import { assertV4Success } from '../core/envelope';
import { defineIdempotentDataHandler } from '../core/outbox';
import { getDataApiContext } from '../core/runtime';
import { CALL_FILE_UPLOAD_EVENT, CALL_NOTE_ADD_EVENT, CallFileKind, type CallFilePayload, type CallNotePayload, readQueuedFileData, toCallFileUpload, useCallDetailStore } from './call-detail-store';

/**
 * Note body with the outbox id as idempotency key (Core §8.6 item 3): a resend returns the first note instead of adding a
 * second one, and a resend that arrives while the first is still being saved is answered 409 (retried). Older servers
 * ignore the field.
 */
export type IdempotentCallNoteInput = SaveCallNoteInput & { IdempotencyKey: string };

const coordinate = (value: number | null): string | null => (typeof value === 'number' && Number.isFinite(value) ? String(value) : null);

/** Call notes are additive intents: queued offline, merged on reconnect (offline-first §8.1). */
export const callNoteAddHandler = defineIdempotentDataHandler<CallNotePayload, SaveCallNoteResult>({
  type: CALL_NOTE_ADD_EVENT,
  optimisticApply: (event) => {
    useCallDetailStore.getState().applyQueuedNote({ localId: event.id, ...event.payload, createdAt: event.createdAt, state: 'queued' });
  },
  send: async (event, context) => {
    const body: IdempotentCallNoteInput = {
      CallId: event.payload.callId,
      UserId: event.scope.userId,
      Note: event.payload.note,
      Latitude: coordinate(event.payload.latitude),
      Longitude: coordinate(event.payload.longitude),
      IdempotencyKey: context.idempotencyKey,
    };
    return assertV4Success(await saveCallNote(getDataApiContext(), body));
  },
  afterAck: (event) => {
    useCallDetailStore.getState().setQueuedNoteState(event.id, null);
  },
  refresh: (event) => useCallDetailStore.getState().fetchCallNotes(event.payload.callId, { bypassCache: true }),
  rollback: (event, reason) => {
    useCallDetailStore.getState().setQueuedNoteState(event.id, reason === 'discarded' ? null : 'rejected');
  },
});

/**
 * Call images/files/audio: the queued event holds upload metadata; bytes are read at send time. The outbox id goes as the
 * body's IdempotencyKey, so a resent upload returns the first file's id instead of attaching a second copy.
 */
export const callFileUploadHandler = defineIdempotentDataHandler<CallFilePayload, SaveCallFileResult>({
  type: CALL_FILE_UPLOAD_EVENT,
  optimisticApply: (event) => {
    const { payload } = event;
    useCallDetailStore.getState().applyQueuedFile({
      localId: event.id,
      callId: payload.callId,
      type: payload.type,
      name: payload.name,
      note: payload.note,
      latitude: payload.latitude,
      longitude: payload.longitude,
      stagedUri: payload.stagedUri,
      createdAt: event.createdAt,
      state: 'queued',
    });
  },
  send: async (event, context) => {
    const data = await readQueuedFileData(event.payload);
    return assertV4Success(await uploadCallFile(getDataApiContext(), { ...toCallFileUpload(event.payload, event.scope.userId, data), idempotencyKey: context.idempotencyKey }));
  },
  afterAck: (event) => {
    useCallDetailStore.getState().setQueuedFileState(event.id, null);
  },
  refresh: async (event) => {
    const store = useCallDetailStore.getState();
    const { callId, type } = event.payload;
    if (type === CallFileKind.Image) await store.fetchCallImages(callId, { bypassCache: true });
    else if (type === CallFileKind.Audio) await store.fetchCallAudio(callId, { bypassCache: true });
    else await store.fetchCallFiles(callId, { bypassCache: true });
  },
  rollback: (event, reason) => {
    useCallDetailStore.getState().setQueuedFileState(event.id, reason === 'discarded' ? null : 'rejected');
  },
  // Every attempt re-sends the whole file, so uploads keep their lower limit rather than the idempotent default.
  maxAttempts: 5,
});
