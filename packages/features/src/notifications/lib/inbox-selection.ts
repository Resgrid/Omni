/**
 * The inbox's selection (select many to mark read or delete). `all` is "Select all": it stands for the whole inbox, pages
 * not loaded yet included, so the screen sends one mark-all-read / delete-all instead of a request per row. Deselecting
 * any row turns it back into a plain list of ids.
 */
export interface InboxSelection {
  ids: string[];
  all: boolean;
}

/** At most this many per-row reads or deletes go out at once. */
export const INBOX_BATCH_SIZE = 5;

export const selectAllInboxItems = (items: readonly { id: string }[]): InboxSelection => ({ ids: items.map((item) => item.id), all: true });

/** The selected rows among the loaded ones (with `all`, every loaded row). */
export const selectedInboxIds = (selection: InboxSelection, items: readonly { id: string }[]): string[] => items.flatMap((item) => (selection.all || selection.ids.includes(item.id) ? [item.id] : []));

export const isInboxItemSelected = (selection: InboxSelection, id: string): boolean => selection.all || selection.ids.includes(id);

/** Toggles one row; leaving "Select all" keeps every other loaded row selected. */
export const toggleInboxSelection = (selection: InboxSelection, id: string, items: readonly { id: string }[]): InboxSelection => {
  const current = selectedInboxIds(selection, items);

  return { ids: current.includes(id) ? current.filter((value) => value !== id) : [...current, id], all: false };
};

/** Runs `task` for every id, {@link INBOX_BATCH_SIZE} at a time; resolves to each outcome in order. */
export async function runInBatches(ids: readonly string[], task: (id: string) => Promise<boolean>, size: number = INBOX_BATCH_SIZE): Promise<boolean[]> {
  const outcomes: boolean[] = [];

  for (let start = 0; start < ids.length; start += size) {
    const batch = await Promise.all(ids.slice(start, start + size).map((id) => task(id).catch(() => false)));

    outcomes.push(...batch);
  }

  return outcomes;
}
