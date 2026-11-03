import { WorkOrderPriority, type WorkOrderSummary } from '@resgrid/models';

import { isOpenStatus } from './work-order-rules';

// Search and filters for the work order list. They narrow the pages already loaded for this person (Core's list
// filter matches order numbers only; titles live in the order's stored content).

export type WorkOrderStatusGroup = 'all' | 'open' | 'finished';
export const WORK_ORDER_STATUS_GROUPS: readonly WorkOrderStatusGroup[] = ['all', 'open', 'finished'];
export const WORK_ORDER_PRIORITIES: readonly number[] = [WorkOrderPriority.Emergency, WorkOrderPriority.High, WorkOrderPriority.Normal, WorkOrderPriority.Low];

export interface WorkOrderListFilters {
  /** Title or number words, all of which must match. */
  query: string;
  status: WorkOrderStatusGroup;
  /** Empty: any priority. */
  priorities: readonly number[];
}

export const EMPTY_WORK_ORDER_FILTERS: WorkOrderListFilters = { query: '', status: 'all', priorities: [] };

/** Filters set in the filter sheet (the search box is not counted). */
export const activeWorkOrderFilterCount = (filters: WorkOrderListFilters): number => (filters.status === 'all' ? 0 : 1) + filters.priorities.length;

export const hasWorkOrderFilters = (filters: WorkOrderListFilters): boolean => filters.query.trim() !== '' || activeWorkOrderFilterCount(filters) > 0;

const inStatusGroup = (status: number, group: WorkOrderStatusGroup): boolean => (group === 'all' ? true : group === 'open' ? isOpenStatus(status) : !isOpenStatus(status));

export const filterWorkOrders = (items: readonly WorkOrderSummary[], filters: WorkOrderListFilters): WorkOrderSummary[] => {
  const words = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((order) => {
    if (!inStatusGroup(order.Status, filters.status)) return false;
    if (filters.priorities.length > 0 && !filters.priorities.includes(order.Priority)) return false;
    const haystack = [order.Title, order.Number].map((value) => (value ?? '').toLowerCase());
    return words.every((word) => haystack.some((value) => value.includes(word)));
  });
};
