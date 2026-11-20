/**
 * The crew picked a new active call (Unit: the call picker, a call chosen on the status sheet's destination step, "Set
 * Active" on a call's detail, the map). `StatusProvider` announces it whenever its `onActiveCallChange` sets a different
 * call; modules that act on the active call listen (Unit: a call's pre-defined route starts and opens navigation).
 *
 * A status sheet that changes the active call holds the announcement until it closes (`deferActiveCallEvents`), so what
 * follows (navigation, a confirm) never opens under the sheet. Only the newest call waiting is announced.
 */
type ActiveCallListener = (callId: string) => void;

const listeners = new Set<ActiveCallListener>();
let holds = 0;
let waiting: string | null = null;

const deliver = (callId: string): void => {
  for (const listener of [...listeners]) listener(callId);
};

/** Tells the listeners the crew picked `callId` as the active call (now, or once every hold is released). */
export function announceActiveCallChange(callId: string): void {
  if (holds > 0) {
    waiting = callId;

    return;
  }

  deliver(callId);
}

/** Listens for active call changes; returns the unsubscribe. */
export function onActiveCallChanged(listener: ActiveCallListener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Holds announcements (a status sheet is still open); the returned release (idempotent) delivers the newest waiting one. */
export function deferActiveCallEvents(): () => void {
  holds += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);

    if (holds > 0 || waiting === null) return;
    const callId = waiting;
    waiting = null;
    deliver(callId);
  };
}

/** Test helper. */
export function resetActiveCallEventsForTests(): void {
  listeners.clear();
  holds = 0;
  waiting = null;
}
