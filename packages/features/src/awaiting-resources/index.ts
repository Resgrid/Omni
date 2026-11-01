// Awaiting resources (omni-plan §7.11 Dispatch; Dispatch baseline `components/awaiting-resources` + screen): calls
// waiting for a required resource (conditional run cards), the persistent banner, unit-available alerts, a call's
// outstanding requirements and one-step dispatch / dismiss. Gated by capabilities.calls.runCards + Dispatch.RunCards +
// Dispatch.RunCardConditions; mount `AwaitingResourcesHost` once in the signed-in shell.

// Screens
export { default as AwaitingResourcesScreen, type AwaitingResourcesScreenProps } from './screens/awaiting-resources';

// Components
export { AwaitingCallCard, type AwaitingCallCardProps } from './components/awaiting-call-card';
export { AwaitingResourcesBanner, type AwaitingResourcesBannerProps } from './components/awaiting-resources-banner';
export { AwaitingResourcesHost } from './components/awaiting-resources-host';
export { CallOutstandingRequirements, type CallOutstandingRequirementsProps } from './components/call-outstanding-requirements';
export { DISMISS_NOTE_MAX_LENGTH, DismissRequirementDialog, type DismissRequirementDialogProps } from './components/dismiss-requirement-dialog';
export { UnitAvailableAlertHost } from './components/unit-available-alert-host';

// Hooks and helpers
export { AUTO_DISPATCH_TOAST_MS, useAwaitingResourceActions, useAwaitingResourcesSync, useIsAwaitingResourcesEnabled } from './hooks/use-awaiting-resources';
export { awaitingCallLabel, findResponseCode, unitLabel } from './lib/awaiting-format';

// Registration, nav and routes
export { awaitingResourcesNav, type FeatureNavEntry } from './nav';
export { OUTSTANDING_REQUIREMENTS_TAB_ID, registerAwaitingResourcesCallDetailTab } from './register';
export { AWAITING_RESOURCES_ROUTE_PATTERNS, awaitingResourcesRoutes } from './routes';
