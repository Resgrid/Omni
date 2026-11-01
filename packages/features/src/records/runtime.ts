import type { WriteResult } from '@resgrid/data';

/**
 * Outbox controls the records screens need beyond `@resgrid/data` (which exposes only enqueue/drain): RMS legal
 * transitions (submit for review, finalize) are queued with `requiresOnlineAuth` and are never sent until the person
 * confirms online. Structural, so the app shell passes `initOffline()`'s outbox directly:
 * `configureRecords({ outbox: runtime.outbox })`.
 */
export interface RecordsOutboxControls {
  confirmOnlineAuth(id: string): Promise<boolean>;
  drain(): Promise<{ sent: readonly string[]; dead: readonly string[] }>;
}

export interface RecordsRuntime {
  outbox?: RecordsOutboxControls | null;
}

let runtime: RecordsRuntime = {};

/** App-shell composition for the Records feature. Merges with what was set before. */
export function configureRecords(next: RecordsRuntime): void {
  runtime = { ...runtime, ...next };
}

export const getRecordsOutbox = (): RecordsOutboxControls | null => runtime.outbox ?? null;

/** Test helper. */
export function resetRecordsRuntimeForTests(): void {
  runtime = {};
}

/** `sent`: the server accepted it now. `awaiting_confirmation`: held in Pending sync until confirmed online. `rejected`: refused. */
export type LegalCommandOutcome = 'sent' | 'awaiting_confirmation' | 'rejected';

/**
 * Queues an RMS legal transition and, when the person is online and pressed the button just now (the explicit
 * confirmation the outbox waits for), confirms and delivers it at once. Offline it stays a visible pending item that
 * needs a fresh confirmation after reconnect — never a silent replay.
 */
export async function runLegalCommand(queue: () => Promise<WriteResult>, isOnline: boolean): Promise<LegalCommandOutcome> {
  const result = await queue();
  if (result.outcome === 'sent') return 'sent';
  if (result.outcome === 'rejected') return 'rejected';
  const outbox = getRecordsOutbox();
  if (!isOnline || !outbox) return 'awaiting_confirmation';
  if (!(await outbox.confirmOnlineAuth(result.id))) return 'awaiting_confirmation';
  const drained = await outbox.drain();
  if (drained.sent.includes(result.id)) return 'sent';
  if (drained.dead.includes(result.id)) return 'rejected';
  return 'awaiting_confirmation';
}
