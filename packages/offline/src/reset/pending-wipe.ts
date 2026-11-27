import type { DurableKv } from '../kv/durable-kv';
import { getOfflineLogger } from '../util/logger';
import { PENDING_WIPE_KEY } from './pending-wipe-key';
import type { ResetReason } from './registry';
import type { ScopeWiper } from './wipe';

export { PENDING_WIPE_KEY } from './pending-wipe-key';

/** Wipes a launch can finish on its own: discarding unsent writes (`clear-all-data`) needs the user's confirmation. */
export type PendingWipeReason = Exclude<ResetReason, 'clear-all-data'>;

const PENDING_WIPE_REASONS: readonly PendingWipeReason[] = ['logout', 'auth-rejected', 'server-switch', 'department-switch'];

/** Marks a wipe as started. Synchronous and durable (MMKV, localStorage), so it holds even if the app dies right after. */
export function markWipePending(kv: DurableKv, reason: PendingWipeReason): void {
  kv.set(PENDING_WIPE_KEY, reason);
}

/** The wipe has run: nothing is left for the next launch to finish. */
export function clearPendingWipe(kv: DurableKv): void {
  kv.delete(PENDING_WIPE_KEY);
}

/** The pending wipe's reason, or null. A mark that cannot be read still means a wipe never finished, so it reads as `logout`. */
export function readPendingWipe(kv: DurableKv): PendingWipeReason | null {
  if (!kv.contains(PENDING_WIPE_KEY)) {
    return null;
  }

  const stored = kv.getString(PENDING_WIPE_KEY);

  return PENDING_WIPE_REASONS.find((reason) => reason === stored) ?? 'logout';
}

/** A pending wipe the launch has run, still applying itself to what startup registers until it is settled. */
export interface PendingWipeRun {
  reason: PendingWipeReason;
  /** Startup has registered everything: stop catching up, wait for that work, and remove the mark. Idempotent. */
  settle(): Promise<void>;
  /** Stops catching up and keeps the mark, so the next launch runs it all again (teardown without settling). */
  abandon(): void;
}

/**
 * Runs a wipe that a previous run of the app was killed in, before any store reads storage. Nobody is signed in yet at
 * this point, and a sign-in only commits once a running sign-out has wiped, so a session still stored is the one that
 * was signing out or, after a wipe that failed, one signed in on top of the leaving user's data: either way it goes with
 * the rest, and the person signs in again.
 *
 * What startup registers after this (push and local-notification teardown, offline map packs) never saw the wipe, so
 * it catches up as it registers, until `settle()`. The mark stays until then, and when the wipe fails, so a launch that
 * dies first runs it all again.
 */
export async function beginPendingWipe(kv: DurableKv, wiper: Pick<ScopeWiper, 'wipeScope' | 'catchUp'>): Promise<PendingWipeRun | null> {
  const reason = readPendingWipe(kv);

  if (!reason) {
    return null;
  }

  const logger = getOfflineLogger();
  logger.warn({ message: 'Finishing a wipe the app exited during', context: { reason } });

  try {
    await wiper.wipeScope(reason);
  } catch (error) {
    logger.error({ message: 'Failed to finish the pending wipe', context: { reason, error: error instanceof Error ? error.name : 'unknown' } });

    return null;
  }

  const close = wiper.catchUp(reason);
  let settling: Promise<void> | null = null;

  return {
    reason,
    settle: () => {
      settling ??= close().then(() => clearPendingWipe(kv));

      return settling;
    },
    abandon: () => {
      void close();
    },
  };
}

/** Runs a pending wipe and settles it at once (nothing registers late). */
export async function finishPendingWipe(kv: DurableKv, wiper: Pick<ScopeWiper, 'wipeScope' | 'catchUp'>): Promise<PendingWipeReason | null> {
  const run = await beginPendingWipe(kv, wiper);

  if (!run) {
    return null;
  }

  await run.settle();

  return run.reason;
}
