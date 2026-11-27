// @resgrid/features/data-protection — Advanced Data Protection UI: protected labels, the reveal bar and the one step-up sheet (every area).
export { ProtectedRevealBar, type ProtectedRevealBarProps } from './components/protected-reveal-bar';
export { ProtectedLabel, type ProtectedLabelProps, ProtectedText, type ProtectedTextProps } from './components/protected-text';
export { StepUpPrompt, type StepUpPromptProps } from './components/step-up-prompt';

// The one step-up sheet (round 10 A5); the exports stay alphabetical across this break.
export { stepUpErrorKey, StepUpSheetHost as StepUpPromptHost, StepUpSheet, StepUpSheetHost } from './components/step-up-sheet';
export { type ProtectedRevealState, useProtectedReveal } from './hooks/use-protected-reveal';
export { displayableValue, withoutRedacted } from './lib/redaction';
export { dataProtectionNav } from './nav';
export { DATA_PROTECTION_ROUTE_PATTERNS, dataProtectionRoutes } from './routes';
