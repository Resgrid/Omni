// @resgrid/features/auth-ui — sign-in, session gates and account security (omni-plan §7.3, §5.4).
// ShellGate: registerShellScreens({ Login: LoginScreen, Onboarding: OnboardingScreen, Maintenance: MaintenanceScreen,
//   PersonalLock: PersonalLockScreen, SharedDeviceLock: SharedDeviceLockScreen, AccessDenied: AccessDeniedScreen }).
// Mount RecoveryCodesSheet once with the shell's overlay hosts.

// Shell gate screens
export { AccessDeniedScreen, type AccessDeniedScreenProps } from './screens/access-denied-screen';
export { LoginScreen, type LoginScreenProps, type LoginView } from './screens/login-screen';
export { MaintenanceScreen } from './screens/maintenance-screen';
export { isOnboardingComplete, markOnboardingComplete, OnboardingScreen, type OnboardingScreenProps } from './screens/onboarding-screen';
export { PersonalLockScreen, type PersonalLockScreenProps } from './screens/personal-lock-screen';
export { SharedDeviceLockScreen } from './screens/shared-device-lock-screen';

// Route screens
export { AccountSecurityScreen } from './screens/account-security-screen';
export { ApproveSignInScreen, type ApproveSignInScreenProps } from './screens/approve-sign-in-screen';
export { FactorRecovery, RecoveryScreen } from './screens/recovery-screen';
export { SharedDeviceScreen, SsoReturnScreen, SsoScreen } from './screens/route-screens';

// Overlays and building blocks shared with Settings
export { ConfirmDialog, type ConfirmDialogProps } from './components/confirm-dialog';
export { InlineError } from './components/inline-error';
export { LanguagePicker } from './components/language-picker';
export { LoginForm, type LoginFormProps, type LoginFormValues } from './components/login-form';
export { LoginServerBadge } from './components/login-server-badge';
export { OptionSheet, type OptionSheetProps, type SheetOption } from './components/option-sheet';
export { PasswordInput, type PasswordInputProps } from './components/password-input';
export { ServerUrlSheet, type ServerUrlSheetProps } from './components/server-url-sheet';
export { SharedDeviceSetup } from './components/shared-device-setup';
export { RecoveryCodes, RecoveryCodesSheet } from './mfa/recovery-codes';

// Helpers
export { describeAuthError, mfaErrorText } from './lib/auth-errors';
export { devicePreferencesKv, setDevicePreferencesKv } from './lib/device-kv';
export { LANGUAGE_AUTONYMS, LANGUAGE_LABEL_KEYS, LANGUAGE_ORDER, type LanguagePreference, useLanguagePreference } from './lib/languages';
export { describeLoginServer, type LoginServer, type LoginServerKind, notifyLoginServerChanged, useLoginServer } from './lib/login-server';
export { goBackOr, homeHref, pushRoute, replaceRoute } from './lib/navigation';

// Registry
export { authNavEntries, type FeatureNavEntry, type NavPlacement } from './nav';
export { type AuthRouteName, authRoutes } from './routes';
