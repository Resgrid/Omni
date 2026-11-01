// @resgrid/features/status — the one StatusPicker (unit | personnel, self | on behalf, staffing) and its bindings.
export { type AvailabilityFilter, AvailabilityFilterChips, type AvailabilityFilterChipsProps } from './components/availability-filter-chips';
export { availabilityOf, CurrentStatusBadge, type CurrentStatusBadgeProps } from './components/current-status-badge';
export { HOLD_TAP_THRESHOLD_MS, HoldToConfirmButton, type HoldToConfirmButtonProps, STATUS_HOLD_DURATION_MS } from './components/hold-to-confirm-button';
export { PersonnelStatusSheet, type PersonnelStatusSheetProps } from './components/personnel-status-sheet';
export { StatusDestinationList, type StatusDestinationListProps } from './components/status-destination-list';
export { StatusOptionRow, type StatusOptionRowProps } from './components/status-option';
export {
  type StaffingSelection,
  StatusPicker,
  type StatusPickerProps,
  type StatusPickerStep,
  type StatusPickerSubject,
  type StatusPickerTab,
  type StatusSelection,
  type StatusSubmitOutcome,
} from './components/status-picker';
export { StatusSheet, type StatusSheetProps } from './components/status-sheet';
export { UnitStatusSheet, type UnitStatusSheetProps } from './components/unit-status-sheet';
export * from './lib/base-types';
export { locationForStatus } from './lib/location-for-status';
export { type ReadableColors, readableColors, readableTextColor } from './lib/readable-colors';
export * from './lib/status-destination';
export * from './lib/status-flow';
export { StatusSubmitError } from './lib/status-submit-error';
export * from './lib/unit-status-set';
export { statusNav } from './nav';
export { STATUS_ROUTE_PATTERNS, statusRoutes } from './routes';
export { type StatusContextValue, StatusProvider, type StatusProviderProps, useStatusContext } from './status-context';
