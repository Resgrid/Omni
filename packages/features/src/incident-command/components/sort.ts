import { parseUtcMs } from '@resgrid/core/utils/dates';

/** Newest `CreatedOn` first (notes, attachments); unparseable times sink. */
export const sortByCreated = <T extends { CreatedOn: string }>(rows: readonly T[]): T[] => [...rows].sort((a, b) => (parseUtcMs(b.CreatedOn) ?? 0) - (parseUtcMs(a.CreatedOn) ?? 0));
