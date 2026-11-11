import { getDataLogger, getDataOutbox, hasDataOutbox } from './runtime';

/**
 * A store's queued-write markers: the "Pending sync" / "Not sent yet" rows a store keeps per outbox event, keyed by the
 * event id. The handler clears its marker in `afterAck` or `rollback`; this reaches the markers nothing will clear.
 */
export interface QueuedMarkerSource {
  /** Ids (= outbox event ids) of every marker the store holds now, queued or refused. */
  ids(): string[];
  /** Drops markers whose write the outbox no longer holds. */
  remove(ids: readonly string[]): void;
}

const sources = new Map<string, QueuedMarkerSource>();

/** Registers a store's markers for reconciliation (module load; idempotent per name). */
export function registerQueuedMarkerSource(name: string, source: QueuedMarkerSource): () => void {
  sources.set(name, source);

  return () => {
    if (sources.get(name) === source) sources.delete(name);
  };
}

/** Removes every key in `ids` from a marker record; returns the record unchanged when none was in it. */
export function withoutMarkers<M>(markers: Record<string, M>, ids: readonly string[]) {
  if (!ids.some((id) => id in markers)) return markers;
  const next = { ...markers };

  for (const id of ids) delete next[id];

  return next;
}

async function reconcileOnce(): Promise<number> {
  if (!hasDataOutbox()) return 0;
  const outbox = getDataOutbox();

  if (!outbox.findEventIds) return 0;

  // Read the markers first: each is written after its event is stored, so an event missing from the lookup below is
  // settled. A marker added after this read was not looked up and is left alone.
  const held = [...sources.entries()].flatMap(([name, source]) => {
    const ids = source.ids();

    return ids.length > 0 ? [{ name, source, ids }] : [];
  });

  if (held.length === 0) return 0;

  const live = await outbox.findEventIds(held.flatMap((entry) => entry.ids));
  let removed = 0;

  for (const { name, source, ids } of held) {
    const settled = ids.filter((id) => !live.has(id));

    if (settled.length === 0) continue;
    source.remove(settled);
    removed += settled.length;
    getDataLogger().info({ message: 'Queued markers without an outbox event removed', context: { store: name, count: settled.length } });
  }

  return removed;
}

let running: Promise<number> | null = null;
let rerun = false;

/**
 * Drops queued-write markers whose outbox event is gone — delivered, discarded or dropped — so a row never shows
 * "Pending sync" for a write nothing will send or clear. That happens when the markers were restored from storage another
 * tab of the app wrote (only one tab keeps the outbox in IndexedDB; the stores share localStorage), when the outbox
 * dropped an expired event, or when the app closed between delivery and saving the cleared marker. One pass at a time;
 * calls during a pass share one follow-up pass. Resolves to how many markers were removed.
 */
export function reconcileQueuedMarkers(): Promise<number> {
  if (running) {
    rerun = true;

    return running;
  }

  running = (async () => {
    let removed = 0;

    do {
      rerun = false;

      try {
        removed += await reconcileOnce();
      } catch (error) {
        getDataLogger().warn({ message: 'Queued marker reconciliation failed', context: { operation: 'reconcileQueuedMarkers', removedBeforeFailure: removed, error: error instanceof Error ? error.name : 'unknown' } });
      }
    } while (rerun);

    return removed;
  })().finally(() => {
    running = null;
  });

  return running;
}

/** Reconciles now (after rehydration) and after every outbox change. Returns the unsubscribe. */
export function startQueuedMarkerReconciliation(): () => void {
  void reconcileQueuedMarkers();

  if (!hasDataOutbox()) return () => undefined;

  const unsubscribe = getDataOutbox().subscribe?.(() => {
    void reconcileQueuedMarkers();
  });

  return unsubscribe ?? (() => undefined);
}
