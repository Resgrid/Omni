// Call queues (omni-plan §7.11 Dispatch; Dispatch baseline pending/scheduled/archived screens): calls saved as Pending
// (dispatch with a picker or cancel), calls scheduled for later (dispatch now) and archived calls by year with filters.
// Data: the calls store's pending/scheduled queues and @resgrid/data's archived-calls and queue-action stores.

// Screens
export { ARCHIVED_CALLS_FRESH_MS, default as ArchivedCallsScreen, type ArchivedCallsScreenProps } from './screens/archived-calls';
export { default as PendingCallsScreen, type PendingCallsScreenProps } from './screens/pending-calls';
export { default as ScheduledCallsScreen, type ScheduledCallsScreenProps } from './screens/scheduled-calls';

// Components and hooks
export { QueueConfirmDialog, type QueueConfirmDialogProps } from './components/queue-confirm-dialog';
export { FilterChip, QueueActionButton, QueueSearch } from './components/queue-controls';
export { PriorityCell, type QueueColumn, QueueTable, type QueueTableProps, TextCell, TypeCell } from './components/queue-table';
export { type CallDispatchNowControls, useCallDispatchNow, type UseCallDispatchNowOptions } from './hooks/use-call-dispatch-now';

// Pure helpers
export {
  ARCHIVED_CALL_STATES,
  type ArchivedCallFilters,
  archivedCallStateLabelKey,
  archivedCallTypes,
  countActiveArchivedCallFilters,
  EMPTY_ARCHIVED_CALL_FILTERS,
  filterArchivedCalls,
  toggled,
} from './lib/archived-calls';
export { dispatchesToSelection, mergeDispatchSelections, selectionSize } from './lib/dispatch-selection';
export { matchesQueueQuery, scheduledDispatchUtc } from './lib/queue-filters';

// Nav and routes
export { callQueuesNav, type FeatureNavEntry } from './nav';
export { CALL_QUEUES_ROUTE_PATTERNS, callQueuesRoutes } from './routes';
