// The calls module owns the dispatch-selection rules (shared by the call detail, the queues and the console); the queue
// screens keep importing them from here.
export { dispatchesToSelection, mergeDispatchSelections, selectionSize } from '@resgrid/features/calls';
