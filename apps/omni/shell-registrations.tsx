// Registers the feature-supplied gate screens and overlays with the app shell. The shell never imports features
// (layering), so this app-layer file is the one place that joins them; every variant root layout imports it.
import type { ShellGateScreenProps } from '@resgrid/app-shell';
import { registerShellOverlay, registerShellScreens } from '@resgrid/app-shell';
import { AccessDeniedScreen, LoginScreen, MaintenanceScreen, OnboardingScreen, PersonalLockScreen, RecoveryCodesSheet, SharedDeviceLockScreen } from '@resgrid/features/auth-ui';
import { StepUpPromptHost } from '@resgrid/features/data-protection';

// The gate wraps the protected route the member opened, so signing in or unlocking just lets it render; the screens'
// own defaults would replace the route with home and drop a deep link.
const noop = () => undefined;

function GateLogin(_props: ShellGateScreenProps) {
  return <LoginScreen onSignedIn={noop} />;
}

function GatePersonalLock(_props: ShellGateScreenProps) {
  return <PersonalLockScreen onUnlocked={noop} />;
}

function GateOnboarding({ onComplete }: ShellGateScreenProps) {
  return <OnboardingScreen onComplete={onComplete ?? noop} />;
}

function GateAccessDenied({ onComplete }: ShellGateScreenProps) {
  return <AccessDeniedScreen onDismiss={onComplete} />;
}

registerShellScreens({
  Login: GateLogin,
  Onboarding: GateOnboarding,
  Maintenance: MaintenanceScreen,
  PersonalLock: GatePersonalLock,
  SharedDeviceLock: SharedDeviceLockScreen,
  AccessDenied: GateAccessDenied,
});
registerShellOverlay('recovery-codes', RecoveryCodesSheet);
registerShellOverlay('step-up-prompt', StepUpPromptHost);
