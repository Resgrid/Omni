import { generateDataId, type PendingRecordDraft, useRecordsStore, type WriteResult } from '@resgrid/data';

/*
 * How the records screens drive the store's staged drafts. A draft is staged on the device and handed to the outbox
 * (`pushDraft`) with its client record id as the idempotency key, so a send interrupted by a lost signal replays once
 * and never creates a second record.
 *
 * Staged-draft lifecycle as the store records it: staged (`queued` undefined) → queued (`true`, optimisticApply) →
 * acknowledged (`false` with the server's record id) or refused (`lastError` / `conflict`).
 */

/** A new client GUID for a draft (stable across re-queues of the same draft). */
export const newClientRecordId = (): string => generateDataId();

/** The server accepted this draft from the outbox; the server copy is now the source of truth. */
export const isAcknowledgedDraft = (draft: PendingRecordDraft): boolean => draft.queued === false && !!draft.recordId && !draft.lastError && !draft.conflict;

/** Staged on this device (or carried over from a legacy build) and never handed to the outbox. */
export const needsPush = (draft: PendingRecordDraft): boolean => draft.queued === undefined && !draft.lastError && !draft.conflict;

/** The drafts the home lists as "not sent / needs you" (acknowledged ones are server drafts by now). */
export const visiblePendingDrafts = (drafts: Record<string, PendingRecordDraft>): PendingRecordDraft[] =>
  Object.values(drafts)
    .filter((draft) => !isAcknowledgedDraft(draft))
    .sort((a, b) => b.updatedOn.localeCompare(a.updatedOn));

/**
 * Housekeeping on the Records home: forgets acknowledged drafts and hands never-sent ones to the outbox (legacy
 * `pushAllDrafts`). Refused drafts stay for the person to open and decide.
 */
export async function settlePendingDrafts(): Promise<void> {
  const { pendingDrafts, discardDraft, pushDraft } = useRecordsStore.getState();
  for (const draft of Object.values(pendingDrafts)) {
    if (isAcknowledgedDraft(draft)) discardDraft(draft.clientRecordId);
    else if (needsPush(draft)) await pushDraft(draft.clientRecordId);
  }
}

export type DraftSendOutcome = { kind: 'sent'; recordId: string | null } | { kind: 'queued' } | { kind: 'rejected' } | { kind: 'failed' };

/**
 * Stages a draft and hands it to the outbox. Sent: the staged copy is forgotten (its values leave the device) and the
 * server's record id is returned. Queued: it stays on the device and replays on reconnect. Rejected: it stays, marked
 * refused, for the person to correct.
 */
export async function stageAndSendDraft(draft: PendingRecordDraft): Promise<DraftSendOutcome> {
  const store = useRecordsStore.getState();
  store.stageDraft(draft);
  let result: WriteResult | null;
  try {
    result = await store.pushDraft(draft.clientRecordId);
  } catch {
    return { kind: 'failed' };
  }
  if (!result) return { kind: 'failed' };
  if (result.outcome === 'sent') {
    const staged = useRecordsStore.getState().pendingDrafts[draft.clientRecordId];
    const recordId = staged?.recordId ?? draft.recordId ?? null;
    useRecordsStore.getState().discardDraft(draft.clientRecordId);
    return { kind: 'sent', recordId };
  }
  return result.outcome === 'queued' ? { kind: 'queued' } : { kind: 'rejected' };
}
