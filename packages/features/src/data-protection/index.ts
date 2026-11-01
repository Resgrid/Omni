// @resgrid/features/data-protection — Advanced Data Protection UI: protected labels, the reveal bar and the step-up prompt.
export { ProtectedRevealBar, type ProtectedRevealBarProps } from './components/protected-reveal-bar';
export { ProtectedLabel, type ProtectedLabelProps, ProtectedText, type ProtectedTextProps } from './components/protected-text';
export { StepUpPrompt, StepUpPromptHost, type StepUpPromptProps } from './components/step-up-prompt';
export { type ProtectedRevealState, useProtectedReveal } from './hooks/use-protected-reveal';
export { displayableValue, withoutRedacted } from './lib/redaction';
export { dataProtectionNav } from './nav';
export { DATA_PROTECTION_ROUTE_PATTERNS, dataProtectionRoutes } from './routes';
