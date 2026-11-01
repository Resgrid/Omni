import { describeLoginFailure, isLoginErrorCode, isMfaErrorCode, type LoginFailure, mfaErrorKey, type TranslateFn } from '@resgrid/auth';

export interface AuthErrorText {
  title: string;
  message: string;
}

/**
 * What a failed sign-in says (Responder + Unit login screens): a password refusal explains why and what to do next
 * (`login.errors.<code>`), a shared shift that ran out says so, a sign-in that ended (MFA, SSO) says why in the member's
 * language. Anything else gets the generic message: raw error text from a server or exception is never shown.
 */
export const describeAuthError = (t: TranslateFn, error: string | null, loginFailure: LoginFailure | null, serverName: string): AuthErrorText | null => {
  if (!error) {
    return null;
  }
  if (isLoginErrorCode(error)) {
    return describeLoginFailure(t, loginFailure?.code === error ? loginFailure : { code: error }, serverName);
  }
  if (error === 'shift_ended') {
    return { title: t('login.errorModal.title'), message: t('shared_session.shift_ended') };
  }
  if (isMfaErrorCode(error)) {
    return { title: t('login.errorModal.title'), message: t(mfaErrorKey(error)) };
  }
  return { title: t('login.errorModal.title'), message: t('login.errorModal.message') };
};

/** The member-facing text for an MFA/SSO refusal code (unknown codes fall back to a generic message; the code is never shown). */
export const mfaErrorText = (t: TranslateFn, code: string | null | undefined): string => t(mfaErrorKey(code));
