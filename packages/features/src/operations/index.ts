// Operations (deployments) feature (omni-plan §7.10 "Records, operations — mostly identical; I list item, attachments,
// time report"): the deployment list and one deployment's crew / individual time report, expenses, resource usage and
// the CAL OES MARS F-42. Screens are app-agnostic: what an app may do comes from `resolveOperationsCapabilities()`
// (derived from the variant's capabilities), what this person may do from the server's TimeAccess. Route files re-export:
//   export { default } from '@resgrid/features/operations/screens/operations-deployment';

// Screens
export { default as OperationsDeploymentScreen, type OperationsDeploymentScreenProps } from './screens/operations-deployment';
export { default as OperationsListScreen } from './screens/operations-list';

// Components
export { type ExpenseAddOutcome, ExpensesPanel, type ExpensesPanelProps } from './components/expenses-panel';
export { MarsPanel, type MarsPanelProps } from './components/mars-panel';
export { OperationsFrame, type SegmentOption, Segments } from './components/operations-layout';
export { AwaitingApproval, DayReports, ScopePicker, type ScopePickerProps, useScopeLabel } from './components/scope-picker';
export { TimeReportEditor, type TimeReportEditorProps } from './components/time-report-editor';
export { UsageForm, type UsageFormProps } from './components/usage-form';

// Hooks
export { type TimeWorkspace, type TimeWorkspaceMessage, useTimeWorkspace } from './hooks/use-time-workspace';

// Pure helpers
export { type OperationsCapabilities, resolveOperationsCapabilities } from './lib/operations-capabilities';
export * from './lib/time';

// Routes and nav
export { operationsNav, type OperationsNavEntry } from './nav';
export { OPERATIONS_ROUTE_PATTERNS, operationsDeployment, operationsList, operationsRoutes } from './routes';
