// Readiness checklists feature (omni-plan §7.10 "Checklists — R (+ due-checks card)"): the checklists screen (due
// checks, on-demand forms, calendar, history), the item-by-item run sheet and the home screen's due-checks card for
// the member-home module. Unit checks the device's active unit; every other app checks for the signed-in member.
// Route files re-export:
//   export { default } from '@resgrid/features/checklists/screens/checklists';

// Screens
export { default as ChecklistsScreen, type ChecklistsScreenProps } from './screens/checklists';

// Components
export { ChecklistCalendar, type ChecklistCalendarProps } from './components/checklist-calendar';
export { ChecklistRunSheet, type ChecklistRunSheetProps } from './components/checklist-run-sheet';
export { DueChecksCard, type DueChecksCardProps } from './components/due-checks-card';

// Hooks
export { type ChecklistHistoryState, type DueChecklistsState, useChecklistHistory, useChecklistsFlagStatus, useChecklistUnitId, useDueChecklists } from './hooks/use-checklists';

// Pure helpers
export * from './lib/checklist-form';

// Runtime: the run writer (SaveChecklistRunProgress / CompleteChecklistRun) registered once the data layer has it
export { type ChecklistRunSaveRequest, type ChecklistRunSaveResult, type ChecklistRunWriter, createDataChecklistRunWriter, getChecklistRunWriter, registerChecklistRunWriter, useChecklistRunWriter } from './runtime';

// Routes and nav
export { checklistsNav, type ChecklistsNavEntry } from './nav';
export { CHECKLISTS_ROUTE_PATTERNS, checklistsList, checklistsRoutes } from './routes';
