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
   * claimed the tap, and runs `open` with its answer only if nothing newer was selected in the meantime (a pin press, a
   * feature opened, or a later lookup started). A failed lookup opens nothing.
   */
  whenUnclaimedAsync: <T>(lookup: () => Promise<T>, open: (value: T) => void) => void;
}

export const createTapPriority = (): TapPriority => {
  let claimed = false;
  // Bumped by every selection (a pin press, a feature opened, a lookup started): a lookup's answer opens only while its
  // own selection is still the newest, so a slower, older lookup never replaces a newer panel.
  let selection = 0;

  return {
    claimForPin: () => {
      claimed = true;
      selection += 1;
      // The claim covers this tap only: it ends with the macrotask the tap's handlers ran in.
      setTimeout(() => {
        claimed = false;
      }, 0);
    },
    whenUnclaimed: (open) => {
      queueMicrotask(() => {
        if (claimed) return;
        selection += 1;
        open();
      });
    },
    whenUnclaimedAsync: (lookup, open) => {
      queueMicrotask(() => {
        if (claimed) return;
        selection += 1;
        const startedAt = selection;

        lookup().then(
          (value) => {
            if (selection === startedAt) open(value);
          },
          () => undefined
        );
      });
    },
  };
};
