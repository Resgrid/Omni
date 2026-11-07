import type { BadgeCountsState, ServerBadgeCountKey } from '@resgrid/data';

/** The summary cards whose local count needs a read per open call (its dispatches, its check-in timers) and the unit seats. */
const PER_CALL_SUMMARY_COUNTS: readonly ServerBadgeCountKey[] = ['callsImOn', 'checkIns'];

/**
 * Whether the member home reads what its summary cards count locally: on a server without `Counts/GetBadgeCounts`, and
 * while one of the per-call counts has never come in and the counts request is failing — the cards fall back to local
 * counts then, and without the reads those would sit at zero. Counts that did come in stay on the cards through a failure.
 */
export const countsSummariesLocally = (state: Pick<BadgeCountsState, 'unsupported' | 'counts' | 'errors'>): boolean =>
  state.unsupported || (state.errors.counts != null && PER_CALL_SUMMARY_COUNTS.some((key) => state.counts[key] === undefined));
