/**
 * The translation key for a refusal code (passkey workbook section 7.6, plus this app's own passkey and SSO outcomes).
 * Codes the app has no message for fall back to a generic one; the code itself is never shown.
 */
const KNOWN = new Set([
  'access_denied',
  'approval_denied',
  'approval_expired',
  'approval_pending',
  'approval_suspended',
  'approval_unavailable',
  'challenge_consumed',
  'challenge_expired',
  'federated_identity_mismatch',
  'federated_mfa_not_satisfied',
  'invalid_recovery_code',
  'invalid_totp',
  'mfa_enrollment_required',
  'mfa_method_not_allowed',
  'mfa_not_enrolled',
  'mfa_transaction_expired',
  'mfa_transaction_invalid',
  'network_error',
  'no_method_here',
  'passkey_already_registered',
  'passkey_cancelled',
  'passkey_failed',
  'passkey_limit_reached',
  'passkey_no_credentials',
  'passkey_not_registered_for_client',
  'passkey_not_supported',
  'passkey_verification_failed',
  'passkeys_unavailable',
  'policy_changed',
  'reauthentication_required',
  'recovery_transaction_expired',
  'recovery_transaction_invalid',
  'service_unavailable',
  'session_revoked',
  'setup_expired',
  'shared_session_lock_changed',
  'sso_cancelled',
  'sso_denied',
  'sso_failed',
  'sso_reauthentication_required',
  'sso_state_mismatch',
  'sso_unavailable',
  'step_up_required',
  'too_many_attempts',
]);

/**
 * Codes Core sends (as a problem type, or as `error=` on the broker's SSO return) that have no message of their own: each
 * is shown with the closest one rather than the generic fallback.
 */
const ALIASES: ReadonlyMap<string, string> = new Map([
  // A deployment whose return-target registry does not list this app (or this build's web host).
  ['return_target_not_allowed', 'sso_unavailable'],
  ['reauthentication_not_fresh', 'sso_reauthentication_required'],
  ['sso_transaction_expired', 'mfa_transaction_expired'],
  ['sso_transaction_invalid', 'sso_failed'],
  ['sso_verification_failed', 'sso_failed'],
]);

/** Every code with a message of its own (`mfa.errors.<code>`); a test keeps each one translated. */
export const MFA_ERROR_CODES: readonly string[] = [...KNOWN];

const messageCode = (code: string | null | undefined): string | null => (code ? (KNOWN.has(code) ? code : (ALIASES.get(code) ?? null)) : null);

/** `mfa.errors.<code>` in the common namespace, or `mfa.errors.unknown_error`. */
export const mfaErrorKey = (code: string | null | undefined): string => `mfa.errors.${messageCode(code) ?? 'unknown_error'}`;

/** Whether an auth-store error is one of these codes (shown translated) rather than free text from elsewhere. */
export const isMfaErrorCode = (value: string | null | undefined): value is string => messageCode(value) !== null;
