// @resgrid/features/staffing — the member's own staffing (Responder): one-tap staffing buttons, the note sheet, the
// "My Staffing" card and the shared card for the home's status/staffing pair. Writes go through the outbox.
export { MemberStateCard, type MemberStateCardProps } from './components/member-state-card';
export { StaffingButtons, type StaffingButtonsProps } from './components/staffing-buttons';
export { StaffingNoteSheet, type StaffingNoteSheetProps } from './components/staffing-note-sheet';
export { UserStaffingCard, type UserStaffingCardProps } from './components/user-staffing-card';
export { type OwnStaffing, useOwnPersonnelRow, useOwnStaffing } from './hooks/use-own-staffing';
export { type StaffingActions, type StaffingSubmitResult, useStaffingActions } from './hooks/use-staffing-actions';
export { DEFAULT_LABEL_COLOR, labelColor } from './lib/label-colors';
export { type FeatureNavEntry, staffingNav } from './nav';
export { STAFFING_ROUTE_PATTERNS, staffingRoutes } from './routes';
