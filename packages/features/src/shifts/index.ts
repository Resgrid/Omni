// @resgrid/features/shifts — Responder shifts (omni-plan §7.11): Today, My Shifts, Sign up, Calendar, Trades (request,
// accept/decline, apply/withdraw, pick, cancel), On duty and supervisor Approvals; shift-day detail with sign-up,
// withdraw, trade and roster management. Route files re-export the screens, e.g.
//   export { default } from '@resgrid/features/shifts/screens/shifts';

// Screens
export { default as ShiftDayScreen, type ShiftDayScreenProps } from './screens/shift-day';
export { default as ShiftTradeScreen, type ShiftTradeScreenProps } from './screens/shift-trade';
export { default as ShiftsScreen, type ShiftsScreenProps } from './screens/shifts';

// Components
export { ShiftActionSheet, type ShiftActionSheetProps } from './components/shift-action-sheet';
export { ShiftCalendarView, type ShiftCalendarViewProps } from './components/shift-calendar-view';
export { ShiftCard, type ShiftCardProps } from './components/shift-card';
export { ShiftDayCard, type ShiftDayCardProps } from './components/shift-day-card';
export { ShiftDayDetails, type ShiftDayDetailsProps } from './components/shift-day-details';
export { ShiftDayDetailsSheet, type ShiftDayDetailsSheetProps } from './components/shift-day-details-sheet';
export { ShiftApprovalsList, type ShiftApprovalsListProps, ShiftOnDutyList, type ShiftOnDutyListProps, type ShiftTradesFilter, ShiftTradesList, type ShiftTradesListProps } from './components/shift-lists';
export { type ShiftSegment, ShiftSegmentBar, type ShiftSegmentBarProps } from './components/shift-segment-bar';
export { ShiftSelectRow, type ShiftSelectRowProps } from './components/shift-select-row';
export { ShiftDetailsSheet, type ShiftDetailsSheetProps, ShiftTradeDetailsSheet, type ShiftTradeDetailsSheetProps } from './components/shift-sheets';
export { ShiftTradeActionButtons, ShiftTradeCard, type ShiftTradeCardProps, ShiftTradeOfferRow } from './components/shift-trade-card';
export { ShiftTradeDetails, type ShiftTradeDetailsProps } from './components/shift-trade-details';

// Hooks
export { type ShiftActionRunner, useShiftAction } from './hooks/use-shift-action';
export { type ShiftDayLists, useShiftDayLists } from './hooks/use-shift-day-lists';

// Pure helpers
export type { ShiftSheetAction, ShiftTradeAction } from './lib/shift-action-types';
export { loadShiftCalendar, loadShiftView, refreshAfterShiftChange, SHIFT_VIEWS, type ShiftCalendarSelection, type ShiftChangeTarget, type ShiftView } from './lib/shift-loaders';
export * from './lib/shift-rules';
export * from './lib/shift-time';

// Routes and nav
export { type FeatureNavEntry, shiftsNav } from './nav';
export { SHIFT_ROUTE_PATTERNS, shiftRoutes } from './routes';
