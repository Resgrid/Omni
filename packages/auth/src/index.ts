// @resgrid/auth (layer L3) — sign-in, session, token refresh, MFA, SSO, passkeys, shared-device sessions, personal lock,
// rights, feature flags, terminology and data-protection grants (omni-plan §7.3). Imports only config, models, core, i18n,
// api and offline. No UI: screens live in @resgrid/features and use the hooks and stores exported here.

// Composition
export { type AuthenticatedApiContext, type AuthenticatedApiContextOptions, authHeaders, createAuthenticatedApiContext, handleAuthRejection } from './context/authenticated-api-context';
export { type AuthRuntime, initAuth, type InitAuthOptions } from './init-auth';
export { setAuthApiContext } from './runtime/api-context';
export type { DeviceLabelProvider, DeviceLabels } from './runtime/device-info';
export { setAuthLogger } from './runtime/logger';
export { type ApiCacheScopeTarget, type AuthServices, setAuthServices } from './runtime/services';
export { type AuthStorageBinding, bindAuthStorage } from './runtime/storage';
export { setTelemetryUserSetter, type TelemetryUserSetter } from './runtime/telemetry';
export { loadSessionGates, type SessionGatesResult } from './session-gates';

// API (endpoint definitions + wrappers not covered by @resgrid/api)
export * from './api/account-security';
export { authData, authRequest, type AuthRequestArgs, type AuthRequestOptions } from './api/auth-request';
export {
  completionGrant,
  describeTokenFailure,
  EXTERNAL_TOKEN_GRANT,
  externalTokenGrant,
  type ExternalTokenInput,
  type ExternalTokenResult,
  loginTransactionFrom,
  type LoginTransactionStart,
  MFA_COMPLETION_GRANT,
  passwordGrant,
  type PasswordGrantResult,
  refreshTokenGrant,
  sendsClientId,
  TOKEN_REQUEST_TIMEOUT_MS,
} from './api/connect';
export * from './api/endpoints';
export * from './api/shared-session';
export { type DepartmentSsoConfig, fetchDepartmentSsoConfig, fetchSsoConfigForUser, normalizeSsoConfig, SSO_DISCOVERY_TIMEOUT_MS, type SsoConfigForUserResult } from './api/sso-discovery';
export * from './api/transaction';

// Errors
export { classifyLoginFailure, describeLoginFailure, isLoginErrorCode, isServerLoginReason, type LoginErrorCode, type LoginFailure, type TranslateFn } from './errors/login-errors';
export { endsTransaction, type MfaProblem, toMfaProblem, TRANSACTION_ENDING_CODES } from './errors/mfa-errors';
export { isMfaErrorCode, mfaErrorKey } from './errors/mfa-messages';

// Session
export { type AuthView, useAuth, useAuthStatus, useIsAuthenticated, useIsSharedSessionLocked, useMfaChallenge } from './hooks';
export {
  ACCESS_TOKEN_EXPIRY_SKEW_MS,
  type AuthActions,
  type AuthSessionState,
  type AuthState,
  getAccessTokenExpiryMs,
  isAccessTokenExpired,
  refreshEngine,
  restoreSession,
  signInWithTokens,
  useAuthStore,
} from './session/auth-store';
export { CLIENT_HEADER, clientHeaders, ephemeralBrowser, headerSafe, OPERATOR_ACTIVITY_HEADER, PROTECTED_GRANT_HEADER, setDeviceLabelProvider, SHARED_INSTALLATION_HEADER } from './session/client-headers';
export { hydrateAuthSession } from './session/hydrate-session';
export { decodeJwtPayload, getJwtExpiryMs, profileFromIdToken } from './session/jwt';
export {
  buildApiUrl,
  CUSTOM_SERVER_VALUE,
  findLocationByUrl,
  getBaseApiUrl,
  getStoredServerUrlProblem,
  isAllowedServerUrl,
  isSameServerUrl,
  mergeServerLocations,
  RESGRID_HOSTED_LOCATIONS,
  type ResgridServerLocation,
  type ServerUrlProblem,
  type ServerUrlValidation,
  toBaseUrl,
  validateServerUrl,
} from './session/server-url';
export {
  isSharedInstallation,
  readSharedInstallation,
  sanitizeInstallationLabel,
  saveSharedInstallation,
  SHARED_INSTALLATION_STORAGE_KEY,
  type SharedInstallationSetting,
  useSharedInstallation,
} from './session/shared-installation';
export { registerSignOutHook, SIGN_OUT_HOOK_TIMEOUT_MS, type SignOutHook, type SignOutHookContext } from './session/sign-out-hooks';
export { registerServerChangeListener, type ServerChangeListener, switchServer, type SwitchServerResult } from './session/switch-server';
export { createTokenRefreshEngine, isRefreshCredentialRejection, refreshDelayMs, type TokenRefreshEngine, type TokenRefreshHandlers, transientRetryDelayMs } from './session/token-refresh';
export type { AuthMethod, AuthResponse, AuthStatus, LoginCredentials, ProfileModel, SignOutReason } from './session/types';

// MFA
export { APPROVAL_POLL_MS, type ApprovalWaitResult, waitForApproval } from './mfa/approval-wait';
export { approvePendingRequest, approverEnabled, type ApproverResult, denyPendingRequest, fetchPendingApproval } from './mfa/approver';
export {
  abandonFactorRecovery,
  type BrokeredSsoResult,
  finishFactorRecovery,
  forgetLoginSecrets,
  hasLoginTransaction,
  type LoginMfaResult,
  type LoginMfaStep,
  recoveryReplacementKey,
  type RecoveryStart,
  type SsoDepartment,
} from './mfa/login-mfa';
export { randomBase64Url, s256Challenge } from './mfa/pkce';
export * from './mfa/types';

// Passkeys
export { createPasskeyCredential, getPasskeyAssertion, passkeysSupported } from './passkeys/passkey';
export { isPasskeyCeremonyError, PasskeyCeremonyError, type PasskeyCeremonyReason } from './passkeys/passkey-errors';
export { isRelyingPartyAssociated, passkeysEnabledForVariant, relyingPartyIdOf } from './passkeys/passkey-policy';

// SSO
export { type DesktopLegacySso, desktopLegacySso } from './sso/legacy-sso-desktop';
export { buildOidcRequestConfig, OIDC_SCOPES, type OidcLoginOptions, type OidcLoginResult, oidcRedirectUri, type OidcSignInOutcome, signInWithOidcIdToken, useOidcLogin } from './sso/oidc';
export { clearPendingSamlState, handleSamlCallbackUrl, PENDING_SAML_STATE_TTL_MS, prepareSamlSignIn, setSamlStateStore, startSamlSignIn } from './sso/saml';
export { parseSsoReturn, runSsoRoundTrip, ssoPlatform, ssoReturnTarget, type SsoRoundTrip, type SsoRoundTripResult, type SsoRoundTripSecrets } from './sso/sso-browser';
export { isValidSsoUrl } from './sso/sso-url';

// Shared-device sessions
export {
  afterSharedUnlock,
  checkSharedSession,
  endSharedShift,
  IDLE_WARNING_SECONDS,
  lockSharedSession,
  POLL_INTERVAL_MS,
  type RealtimeControls,
  registerSharedSessionRealtimeControls,
  reportOperatorActivity,
  sharedSessionsEnabled,
  SHIFT_NOTICE_SECONDS,
} from './shared-session/shared-session-controller';
export {
  applySharedSessionStatus,
  consumeSessionRestoredAtLaunch,
  markSharedSessionLocked,
  resetSharedSession,
  sharedLockGeneration,
  type SharedSessionState,
  useSharedSessionStore,
} from './shared-session/shared-session-store';

// Personal lock
export { INACTIVITY_CHECK_INTERVAL_MS, type InactivityMonitorOptions, startInactivityMonitor, useInactivityLock } from './personal-lock/inactivity-monitor';
export { clearPasswordVerification, hasPasswordVerification, verifyPassword } from './personal-lock/password-verifier';
export {
  applyPersonalLockAtLaunch,
  isPersonalLockEnabled,
  lockPersonalSession,
  type PersonalLockState,
  personalLockStore,
  setLockTimeout,
  shouldLock,
  unlockPersonalSession,
  type UnlockResult,
  updateActivity,
  usePersonalLock,
} from './personal-lock/personal-lock-store';

// Rights, app access, flags, terminology
export {
  type FeatureFlagKey,
  FeatureFlagKeys,
  type FeatureFlagsState,
  featureFlagsStore,
  type FeatureFlagStatus,
  getFeatureFlagStatus,
  isFeatureEnabled,
  recordsFieldFlagKey,
  resetFeatureFlags,
  useFeatureFlag,
  useFeatureFlagStatus,
  useIsChatEnabled,
  useIsRecordsFieldEnabled,
} from './flags/feature-flags-store';
export { type AppAccessDecision, checkAppAccess, enforceAppAccess, requiredAppAccessRight } from './rights/app-access';
export { getActiveDepartmentId, getCurrentRights, resetSecurity, type SecurityState, securityStore, type SecurityView, useSecurity } from './rights/security-store';
export { definitionTermKey, getTerm, recordTypeTermKey, type TerminologyState, terminologyStore, type TermKey, TermKeys, useDefinitionTerm, useRecordTypeTerm, useTerm } from './terminology/terminology-store';

// Data protection (ADP)
export { readProtectedGrantHeaders } from './data-protection/grant-provider';
export {
  cancelStepUpApprovalRequest,
  clearStepUp,
  closeStepUpPrompt,
  completeStepUpWithApproval,
  type DataProtectionCapabilities,
  type DataProtectionState,
  dataProtectionStore,
  ensureGrant,
  fetchDataProtectionCapabilities,
  getProtectedGrantHeaders,
  type GrantOutcome,
  isStepUpActive,
  loadStepUpMethods,
  openStepUpPrompt,
  requestStepUpApprovalNumber,
  resetDataProtection,
  type StepUpErrorCode,
  useHasGrantToken,
  useIsProtectionEnabled,
  useIsStepUpPromptOpen,
  useStepUpExpiresAt,
  verifyStepUpFederated,
  verifyStepUpOtp,
  verifyStepUpWithPasskey,
  waitForStepUpApproval,
} from './data-protection/grant-store';
export { isFieldRedacted, isRedactedValue, type ProtectedFieldId, ProtectedFieldIds, REDACTION_VALUE, revealedValue } from './data-protection/redacted';
export { GRANT_EXPIRY_MARGIN_MS, useProtectedGrantRefresh } from './data-protection/use-protected-grant-refresh';
