/**
 * One tap can reach several map handlers: the web map reports every source under the pointer (each source's click
 * handler runs, in the order the sources were added), and the map's own press runs as well (native: it bubbles up from
 * the pressed source). A pin claims its tap; a layer feature's panel opens only when no pin claimed the same tap,
 * whichever handler ran first. The decision waits for a microtask (after every handler of the tap), and a claim lasts
 * until the next macrotask.
 */
export interface TapPriority {
  /** A pin took this tap. */
  claimForPin: () => void;
  /** Runs `open` after the tap's handlers, unless a pin claimed the tap. */
  whenUnclaimed: (open: () => void) => void;
  /**
   * For a lookup that answers later (a rendered-feature query): starts `lookup` after the tap's handlers unless a pin
   * claimed the tap, and runs `open` with its answer only if no pin was pressed in the meantime. A failed lookup opens
   * nothing.
   */
  whenUnclaimedAsync: <T>(lookup: () => Promise<T>, open: (value: T) => void) => void;
}

export const createTapPriority = (): TapPriority => {
  let claimed = false;
  // Bumped by every pin press, so an answer that arrives after one is dropped.
  let pinPresses = 0;

  return {
    claimForPin: () => {
      claimed = true;
      pinPresses += 1;
      setTimeout(() => {
        claimed = false;
      }, 0);
    },
    whenUnclaimed: (open) => {
      queueMicrotask(() => {
        if (!claimed) open();
      });
    },
    whenUnclaimedAsync: (lookup, open) => {
      queueMicrotask(() => {
        if (claimed) return;
        const startedAt = pinPresses;

        lookup().then(
          (value) => {
            if (pinPresses === startedAt) open(value);
          },
          () => undefined
        );
      });
    },
  };
};
