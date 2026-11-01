import { completionGrant, loginTransactionFrom } from '../api/connect';
import {
  beginFactorRecovery,
  cancelFactorRecovery,
  cancelLoginApproval,
  completeApproval,
  completeFactorRecovery,
  completeFederated,
  completePasskey,
  completeRecoveryCode,
  completeTotp,
  completeTotpSetup,
  loginApprovalStatus,
  loginPasskeyOptions,
  prepareRecoveryReplacement,
  requestLoginApproval,
  ssoBegin,
  ssoRedeem,
  totpSetupOptions,
} from '../api/transaction';
import { bodyOf, httpFailureOf } from '../errors/http-shape';
import { endsTransaction, type MfaProblem, toMfaProblem } from '../errors/mfa-errors';
import { isMfaErrorCode } from '../errors/mfa-messages';
import { getPasskeyAssertion } from '../passkeys/passkey';
import { isPasskeyCeremonyError } from '../passkeys/passkey-errors';
import { getAuthApiContext } from '../runtime/api-context';
import { authLogger } from '../runtime/logger';
import type { AuthResponse } from '../session/types';
import { runSsoRoundTrip } from '../sso/sso-browser';
import { type ApprovalWaitResult, waitForApproval } from './approval-wait';
import { type ApprovalRequestData, type CompletionData, type MfaChallenge, parseMethods, type PasskeyData, type TotpSetupData } from './types';

// ---------------------------------------------------------------------------------------------------------------------
// Signing in on a login transaction (passkey plan sections 7.5, 7.7.2 and 6.2-6.3). The transaction and recovery secrets
// are the only authority for finishing a sign-in, so they live in this module's memory only: never in the persisted auth
// store, never in logs, and never past the sign-in they belong to.
//
// Merged from the four copies (omni-plan §7.3): Unit — a completion the token endpoint refuses with a code the app has no
// message for restarts as `mfa_transaction_invalid`; Responder — tokens the store cannot use (signIn throws) end the
// sign-in instead of leaving a spinner; Dispatch — a sign-in the member cancelled while a step was in flight is
// `abandoned` and never signs in afterwards.
// ---------------------------------------------------------------------------------------------------------------------

let loginTransaction: string | null = null;
let factorRecovery: string | null = null;

/** A second factor for the current sign-in. */
export type LoginMfaStep =
  | { method: 'totp'; code: string }
  | { method: 'recovery_code'; code: string }
  | { method: 'passkey' }
  | { method: 'passkey_approval'; approvalRequestId: string }
  | { method: 'federated' }
  | { method: 'setup'; code: string };

export type LoginMfaResult = { ok: true; recovery: boolean } | { ok: false; code: string; restart: boolean };

/** What the auth store provides: finishing a sign-in with tokens, and moving the visible sign-in state. */
export interface LoginMfaHost {
  /** Throws when the tokens cannot be used (no/malformed id token). */
  signIn: (authResponse: AuthResponse, recoveryCodes: string[] | null) => void;
  setChallenge: (challenge: MfaChallenge | null, error?: string | null) => void;
  restart: (code: string) => void;
}

export const holdLoginTransaction = (secret: string | null): void => {
  loginTransaction = secret;
};

export const hasLoginTransaction = (): boolean => loginTransaction !== null;

/** Drops every sign-in secret: cancel, sign-out, or a sign-in that ended. */
export const forgetLoginSecrets = (): void => {
  loginTransaction = null;
  factorRecovery = null;
};

/** The sign-in cannot finish any more: its secrets go, and the member starts again with the reason shown. */
const ended = (host: LoginMfaHost, code: string): LoginMfaResult => {
  forgetLoginSecrets();
  host.restart(code);
  return { ok: false, code, restart: true };
};

const failed = (host: LoginMfaHost, problem: MfaProblem): LoginMfaResult => (endsTransaction(problem) ? ended(host, problem.code) : { ok: false, code: problem.code, restart: false });

// A sign-in the member cancelled (or signed out of) while a step was in flight; the store has already moved on (Dispatch).
const abandoned: LoginMfaResult = { ok: false, code: 'mfa_transaction_invalid', restart: false };

/**
 * Redeems the completion code. The factor is already spent and a completion is never issued twice, so a lost grant
 * response or tokens this app cannot use end the sign-in rather than leaving the member to retry on a spent transaction.
 */
const finish = async (host: LoginMfaHost, secret: string, completion: CompletionData): Promise<LoginMfaResult> => {
  if (loginTransaction !== secret) {
    return abandoned;
  }
  let tokens: AuthResponse;
  try {
    tokens = await completionGrant(getAuthApiContext(), secret, completion.CompletionCode);
  } catch (error) {
    if (loginTransaction !== secret) {
      return abandoned;
    }
    // Unit: a token endpoint refusal the app has no message for (invalid_grant) reads as the sign-in no longer being valid.
    const refused = toMfaProblem(error).code;
    return ended(host, isMfaErrorCode(refused) ? refused : 'mfa_transaction_invalid');
  }
  // Checked again after the grant: a cancel during it must not sign in after all (Dispatch).
  if (loginTransaction !== secret) {
    return abandoned;
  }
  loginTransaction = null;
  try {
    host.signIn(tokens, completion.RecoveryCodes ?? null);
  } catch {
    // Responder: the store refused the tokens (no usable id token).
    authLogger.error({ message: 'Second-factor sign-in returned tokens that could not be used' });
    return ended(host, 'unknown_error');
  }
  authLogger.info({ message: 'Signed in with a second factor', context: { recovery: completion.Recovery } });
  return { ok: true, recovery: !!completion.Recovery };
};

/** Finishes the current sign-in with one second factor. A refusal that ends the sign-in sends the member back to the start. */
export const verifyLoginMfa = async (host: LoginMfaHost, step: LoginMfaStep): Promise<LoginMfaResult> => {
  const secret = loginTransaction;
  if (!secret) {
    return ended(host, 'mfa_transaction_invalid');
  }
  const ctx = getAuthApiContext();

  try {
    let completion: CompletionData;
    switch (step.method) {
      case 'totp':
        completion = await completeTotp(ctx, secret, step.code.trim());
        break;
      case 'recovery_code':
        completion = await completeRecoveryCode(ctx, secret, step.code.trim());
        break;
      case 'setup':
        completion = await completeTotpSetup(ctx, secret, step.code.trim());
        break;
      case 'passkey': {
        const ceremony = await loginPasskeyOptions(ctx, secret);
        const credential = await getPasskeyAssertion(ceremony.Options);
        completion = await completePasskey(ctx, secret, ceremony.RequestId, credential);
        break;
      }
      case 'passkey_approval':
        completion = await completeApproval(ctx, secret, step.approvalRequestId);
        break;
      case 'federated': {
        const trip = await runSsoRoundTrip((secrets) =>
          ssoBegin(ctx, { Purpose: 'step_up', Transaction: secret, ReturnTarget: secrets.returnTarget, State: secrets.state, CodeChallenge: secrets.codeChallenge, Platform: secrets.platform })
        );
        if (!trip.ok) {
          return trip.code ? failed(host, { code: trip.code, status: null }) : { ok: false, code: `sso_${trip.reason}`, restart: false };
        }
        completion = await completeFederated(ctx, secret, trip.trip.ssoTransactionId, trip.trip.ssoCode, trip.trip.codeVerifier);
        break;
      }
    }
    return await finish(host, secret, completion);
  } catch (error) {
    if (loginTransaction !== secret) {
      return abandoned;
    }
    if (isPasskeyCeremonyError(error)) {
      return { ok: false, code: `passkey_${error.reason}`, restart: false };
    }
    return failed(host, toMfaProblem(error));
  }
};

// ---- Approve with Responder, from another app's sign-in ---------------------------------------------------------------

export const startLoginApproval = async (host: LoginMfaHost): Promise<ApprovalRequestData | { code: string; restart: boolean }> => {
  const secret = loginTransaction;
  if (!secret) {
    host.restart('mfa_transaction_invalid');
    return { code: 'mfa_transaction_invalid', restart: true };
  }
  try {
    return await requestLoginApproval(getAuthApiContext(), secret);
  } catch (error) {
    const result = failed(host, toMfaProblem(error));
    return { code: result.ok ? 'unknown_error' : result.code, restart: !result.ok && result.restart };
  }
};

/**
 * Waits for the member's Responder to decide. A status refusal that ends the sign-in itself (it expired, or the policy
 * changed) sends the member back to the start, as any other step does, instead of reading as the service being down.
 */
export const waitForLoginApproval = async (host: LoginMfaHost, approvalRequestId: string, signal?: AbortSignal): Promise<ApprovalWaitResult> => {
  const secret = loginTransaction;
  if (!secret) {
    return 'unavailable';
  }
  const ctx = getAuthApiContext();
  const refused: { problem: MfaProblem | null } = { problem: null };
  const decided = await waitForApproval(async () => {
    try {
      return await loginApprovalStatus(ctx, secret, approvalRequestId);
    } catch (error) {
      refused.problem = toMfaProblem(error);
      throw error;
    }
  }, signal);
  if (refused.problem && loginTransaction === secret) {
    failed(host, refused.problem);
  }
  return decided;
};

export const cancelLoginApprovalRequest = async (approvalRequestId: string): Promise<void> => {
  if (loginTransaction) {
    await cancelLoginApproval(getAuthApiContext(), loginTransaction, approvalRequestId).catch(() => undefined);
  }
};

// ---- Setting up the authenticator the department requires (plan section 6.2) ------------------------------------------

export const loginSetupOptions = async (host: LoginMfaHost): Promise<TotpSetupData | { code: string; restart: boolean }> => {
  const secret = loginTransaction;
  if (!secret) {
    host.restart('mfa_transaction_invalid');
    return { code: 'mfa_transaction_invalid', restart: true };
  }
  try {
    return await totpSetupOptions(getAuthApiContext(), secret);
  } catch (error) {
    const result = failed(host, toMfaProblem(error));
    return { code: result.ok ? 'unknown_error' : result.code, restart: !result.ok && result.restart };
  }
};

// ---- Brokered single sign-on (plan section 7.7.2) ---------------------------------------------------------------------

export interface SsoDepartment {
  departmentToken?: string;
  departmentCode?: string;
  username?: string;
}

export type BrokeredSsoResult = { outcome: 'signed_in' } | { outcome: 'challenge'; challenge: MfaChallenge } | { outcome: 'cancelled' } | { outcome: 'failed'; code: string };

/**
 * Signs in through the department's identity provider: the browser round trip, then the redemption, then a second factor
 * if one is needed. `ephemeral` (default: a shared installation) keeps the provider's cookies out of the next operator's
 * way (Unit/IC shared-device sign-in).
 */
export const signInWithBrokeredSso = async (host: LoginMfaHost, department: SsoDepartment, ephemeral?: boolean): Promise<BrokeredSsoResult> => {
  forgetLoginSecrets();
  const ctx = getAuthApiContext();
  const trip = await runSsoRoundTrip(
    (secrets) =>
      ssoBegin(ctx, {
        Purpose: 'login',
        ...(department.departmentToken ? { DepartmentToken: department.departmentToken } : {}),
        ...(department.departmentCode ? { DepartmentCode: department.departmentCode } : {}),
        ...(department.username ? { Username: department.username } : {}),
        ReturnTarget: secrets.returnTarget,
        State: secrets.state,
        CodeChallenge: secrets.codeChallenge,
        Platform: secrets.platform,
      }),
    ephemeral
  );
  if (!trip.ok) {
    return trip.reason === 'cancelled' ? { outcome: 'cancelled' } : { outcome: 'failed', code: trip.code ?? `sso_${trip.reason}` };
  }

  try {
    const redeemed = await ssoRedeem(ctx, trip.trip.ssoTransactionId, trip.trip.ssoCode, trip.trip.codeVerifier);
    if (redeemed.Outcome === 'completed' && redeemed.Transaction && redeemed.CompletionCode) {
      const tokens = await completionGrant(ctx, redeemed.Transaction, redeemed.CompletionCode);
      try {
        host.signIn(tokens, null);
      } catch {
        return { outcome: 'failed', code: 'unknown_error' };
      }
      return { outcome: 'signed_in' };
    }
    if (redeemed.Outcome === 'mfa_required' && redeemed.Transaction) {
      loginTransaction = redeemed.Transaction;
      const challenge: MfaChallenge = {
        kind: 'verify',
        methods: parseMethods(redeemed.MfaMethods),
        enrolled: parseMethods(redeemed.MfaEnrolled),
        preferred: parseMethods(redeemed.MfaPreferred)[0] ?? null,
        expiresAt: redeemed.ExpiresIn > 0 ? Date.now() + redeemed.ExpiresIn * 1000 : null,
        source: 'sso',
      };
      host.setChallenge(challenge);
      return { outcome: 'challenge', challenge };
    }
    return { outcome: 'failed', code: 'sso_failed' };
  } catch (error) {
    // A department that requires MFA the account does not have yet continues as the setup transaction.
    const setup = loginTransactionFrom(bodyOf(httpFailureOf(error)?.data), 'sso');
    if (setup && setup.challenge.kind === 'setup') {
      loginTransaction = setup.secret;
      host.setChallenge(setup.challenge);
      return { outcome: 'challenge', challenge: setup.challenge };
    }
    return { outcome: 'failed', code: toMfaProblem(error).code };
  }
};

// ---- "I lost my authenticator" (plan sections 5.4 and 6.3) ------------------------------------------------------------

export interface RecoveryStart {
  passkeys: PasskeyData[];
  expiresAt: number | null;
}

/** Spends a recovery code to open the restricted recovery. The sign-in itself ends; no session is created. */
export const startFactorRecovery = async (host: LoginMfaHost, recoveryCode: string): Promise<RecoveryStart | { code: string; restart: boolean }> => {
  const secret = loginTransaction;
  if (!secret) {
    host.restart('mfa_transaction_invalid');
    return { code: 'mfa_transaction_invalid', restart: true };
  }
  try {
    const started = await beginFactorRecovery(getAuthApiContext(), secret, recoveryCode.trim());
    loginTransaction = null;
    factorRecovery = started.Transaction;
    // The sign-in is spent; recovery takes over, and nothing signs in until the member does so again.
    host.setChallenge(null);
    return { passkeys: started.Passkeys ?? [], expiresAt: started.ExpiresIn > 0 ? Date.now() + started.ExpiresIn * 1000 : null };
  } catch (error) {
    const result = failed(host, toMfaProblem(error));
    return { code: result.ok ? 'unknown_error' : result.code, restart: !result.ok && result.restart };
  }
};

export const recoveryReplacementKey = async (): Promise<TotpSetupData | { code: string }> => {
  if (!factorRecovery) {
    return { code: 'recovery_transaction_invalid' };
  }
  try {
    return await prepareRecoveryReplacement(getAuthApiContext(), factorRecovery);
  } catch (error) {
    return { code: toMfaProblem(error).code };
  }
};

/** Replaces the authenticator; every session ends and the member signs in again. Returns the new recovery codes, shown once. */
export const finishFactorRecovery = async (code: string, removePasskeyIds: string[]): Promise<{ recoveryCodes: string[] } | { code: string; ended: boolean }> => {
  if (!factorRecovery) {
    return { code: 'recovery_transaction_invalid', ended: true };
  }
  try {
    const done = await completeFactorRecovery(getAuthApiContext(), factorRecovery, code.trim(), removePasskeyIds);
    factorRecovery = null;
    return { recoveryCodes: done.RecoveryCodes ?? [] };
  } catch (error) {
    const problem = toMfaProblem(error);
    const isEnded = endsTransaction(problem);
    if (isEnded) {
      factorRecovery = null;
    }
    return { code: problem.code, ended: isEnded };
  }
};

export const abandonFactorRecovery = async (): Promise<void> => {
  const secret = factorRecovery;
  factorRecovery = null;
  if (secret) {
    await cancelFactorRecovery(getAuthApiContext(), secret).catch(() => undefined);
  }
};
