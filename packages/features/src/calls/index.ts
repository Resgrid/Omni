// Calls feature (omni-plan §7.10, §8.5): list, card, detail with a tab registry, create/edit (offline-capable),
// close, menu, notes/images/files, dispatch selection. Screens are app-agnostic: capabilities, rights, flags and form
// factor specialise them. Route files re-export the screens, e.g.
//   export { default } from '@resgrid/features/calls/screens/call-detail';

// Screens
export { default as CallDetailScreen, type CallDetailScreenProps } from './screens/call-detail';
export { default as CallEditScreen } from './screens/call-edit';
export { type CallFormLocation, default as CallFormScreen, type CallFormScreenProps } from './screens/call-form';
export { default as CallListScreen, type CallListScreenProps } from './screens/call-list';
export { default as CallNewScreen } from './screens/call-new';

// Components
export { CallCard, type CallCardDensity, type CallCardProps, type CallCardTimerState } from './components/call-card';
export { CallFiltersBar, type CallFiltersBarProps } from './components/call-filters-bar';
export { CallFilesModal, CallImagesModal, CallNotesModal } from './components/call-media-modals';
export { CallMenu, type CallMenuAction, type CallMenuItem, type CallMenuProps } from './components/call-menu';
export { CallNotesPanel, type CallNotesPanelProps } from './components/call-notes-panel';
export { CloseCallSheet, type CloseCallSheetProps } from './components/close-call-sheet';
export { DispatchSelectionModal, type DispatchSelectionModalProps, summarizeDispatchSelection } from './components/dispatch-selection';
export { DispatchTicker, type DispatchTickerProps } from './components/dispatch-ticker';
export { OfflineCallBanner, type OfflineCallBannerProps } from './components/offline-call-banner';
export { type ChipOption, OptionChips, type OptionChipsProps } from './components/option-chips';
export { QUEUED_CALL_COLORS, QueuedCallBadge, type QueuedCallBadgeProps } from './components/queued-call-badge';
export { SyncedCallNoticeRow, SyncedCallNotices, type SyncedCallNoticesProps } from './components/synced-call-notices';

// Detail tab registry
export { BUILT_IN_CALL_DETAIL_TABS, CALL_DETAIL_TAB_IDS, registerBuiltInCallDetailTabs } from './detail-tabs/built-in-tabs';
export { type CallDetailTabContext, type CallDetailTabDefinition, getCallDetailTabs, registerCallDetailTab, resolveCallDetailTabs, unregisterCallDetailTab, useRegisteredCallDetailTabs } from './detail-tabs/registry';

// Call form hook points (contacts, run cards, maps, custom fields)
export { type CallFormHookPoints, type ContactPickerProps, getCallFormHookPoints, type LocationPickerProps, registerCallFormHookPoints, type RunCardRecommendationProps, useCallFormHookPoints } from './hook-points';

// Hooks
export { useHasActiveIncidentCommand } from './hooks/use-active-incident-command';
export { useCallAssignmentContext } from './hooks/use-call-assignment-context';
export { type DispatchRecipients, useCallTemplates, useDispatchRecipients, useNewCallFieldPolicy } from './hooks/use-call-form-data';
export { CALL_LIST_REFRESH_EVENTS, type CallListData, useCallList, type UseCallListOptions } from './hooks/use-call-list';
export { useIsOnline } from './hooks/use-connectivity';

// Pure helpers
export { readableColors, readableTextColor } from './lib/call-colors';
export { type CallAssignmentContext, getDispatchTypeStyle, getUniqueDispatches, isCurrentUserOnCall, isUnitDispatchType } from './lib/call-dispatch';
export { type CallListFilters, type CallListTab, EMPTY_CALL_FILTERS, filterCalls, matchesCallQuery } from './lib/call-filters';
export {
  type CallFormValues,
  callToFormValues,
  createRequestToFormValues,
  type DispatchSelection,
  EMPTY_DISPATCH_SELECTION,
  parseCoordinates,
  toCreateCallRequest,
  toUpdateCallRequest,
  validateCallForm,
} from './lib/call-form';
export { BUILT_IN_PRIORITIES, defaultPriorityId, type PriorityOption, priorityOptions, resolvePriority } from './lib/call-priority';
export { CallState, isPendingCall, isScheduledCall, timeAgo } from './lib/call-time';
export { CLOSE_CALL_TYPES, getCallCloseErrorMessage } from './lib/close-call';
export { createFieldPolicy, type NewCallFieldPolicy } from './lib/field-policy';

// Routes and nav
export { callsNav, type FeatureNavEntry } from './nav';
export { CALL_ROUTE_PATTERNS, callCorrect, callDetail, callEdit, callNew, callRoutes } from './routes';
