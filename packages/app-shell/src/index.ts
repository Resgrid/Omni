// @resgrid/app-shell (layer L7) — root providers, init steps, ShellGate, createAppShell, nav registry, route contract
// (omni-plan §5.4). Variant route files import only from here; features never do (layering: features are L6).

// Composition
export { configureAppShell } from './configure';
export { HomePlaceholder } from './home-placeholder';
export { PushNotificationModalHost } from './providers/push-modal-host';
export { RootProviders } from './providers/root-providers';
export { RootLayout } from './root-layout';
export { ErrorBoundary } from './root-layout';
export { type AppShellConfig, type AppShellOptions, getAppShellConfig } from './runtime/shell-config';
export { SessionServices } from './session/session-services';

// Init steps
export { type AppInitView, type InitPhase, registerInitStep, sessionInit, startupInit, useAppInit } from './init/app-init';
export {
  type AppInit,
  type AppInitOptions,
  createAppInit,
  DEFAULT_INIT_RETRY,
  DEFAULT_INIT_STEP_TIMEOUT_MS,
  type InitPhaseState,
  initRetryDelay,
  type InitStatus,
  type InitStep,
  type InitStepContext,
  type InitStepOutcome,
  InitStepTimeoutError,
  type RetryPolicy,
  type StepPosition,
} from './init/create-app-init';
export { loadDepartmentConfig } from './init/default-steps';
export { createLegacyKeyProvider, type LegacyKeyProviderOptions, type LegacyKeyRequest, legacyKeySecureStoreName, type LegacyKeySource, registerLegacyKeySource } from './runtime/legacy-keys';
export { completeOnboarding, setSelectedTheme } from './runtime/preferences';
export { type ShellState, useShellStore } from './runtime/shell-state';

// Gate
export { GATE_ORDER, type GateCheck, type GateInputs, type GateStep, resolveGateStep } from './gate/gate-state';
export { ShellGate, type ShellGateProps } from './gate/shell-gate';
export { useGateInputs, useShellGateStep } from './gate/use-gate-step';
export {
  registerShellOverlay,
  registerShellScreens,
  registerSidebarContent,
  type ShellGateScreen,
  type ShellGateScreenProps,
  type ShellScreenName,
  type ShellScreens,
  type SidebarContentKind,
  type SidebarContentProps,
} from './runtime/slots';

// Shell
export { createAppShell, type CreateAppShellOptions, RegistryTabs } from './shell/create-app-shell';
export { findNavEntryForPath, type HeaderLeading, resolveHeaderLeading, ShellHeader } from './shell/header';
export { type ShellContextValue, ShellProvider, useHeaderActions, useOptionalShell, useShell } from './shell/shell-context';
export { NavMenu } from './shell/sidebar';
export { PANEL_SIDEBAR_WIDTH, PERMANENT_SIDEBAR_WIDTH, resolveSidebarMode, type SidebarMode } from './shell/sidebar-mode';

// Navigation registry
export * from './nav';

// Route contract and deep links
export { useNavigationReadyRegistration } from './deep-links/navigation';
export * from './routes';
