import type { StatusesResultData } from '@resgrid/models';

/**
 * Built-in personnel statuses 4–7 (Available Station, Responding to Station, Responding to Scene, On Unit) are set by
 * Resgrid itself and predate the destination model, so the home buttons leave them out (Responder). Only the built-in
 * set qualifies (option `StateId` 0 / missing): a department's own set carries its id in `StateId` and its options may
 * use any id, including 4–7 on a fresh install, so they are never hidden. This identifies system options of the
 * built-in set; what a status MEANS is always read from BaseType.
 */
const SYSTEM_MANAGED_BUILT_IN_IDS = new Set([4, 5, 6, 7]);

export const isSystemManagedBuiltInStatus = (status: Pick<StatusesResultData, 'Id' | 'StateId'>): boolean => !Number(status.StateId) && SYSTEM_MANAGED_BUILT_IN_IDS.has(Number(status.Id));

/** The personnel statuses the home buttons offer. */
export const homeStatusOptions = (statuses: readonly StatusesResultData[] | null | undefined): StatusesResultData[] => (statuses ?? []).filter((status) => !isSystemManagedBuiltInStatus(status));
