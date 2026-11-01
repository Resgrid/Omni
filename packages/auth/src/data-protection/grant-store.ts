import { completeStepUpApproval, completeStepUpFederated, getDataProtectionCapabilities, getStepUpMethods, getStepUpPasskeyOptions, requestProtectedGrant, verifyStepUp, verifyStepUpPasskey } from '@resgrid/api';
import type { StepUpResult } from '@resgrid/models';
import { registerStoreReset } from '@resgrid/offline';
import { create } from 'zustand';

import { beginStepUpSso, cancelStepUpApproval, getStepUpApprovalStatus, requestStepUpApproval } from '../api/account-security';
import { bodyOf, httpFailureOf } from '../errors/http-shape';
import { toMfaProblem } from '../errors/mfa-errors';
import { type ApprovalWaitResult, waitForApproval } from '../mfa/approval-wait';
import { parseUtc, type WebAuthnOptions } from '../mfa/types';
import { getPasskeyAssertion, passkeysSupported } from '../passkeys/passkey';
import { isPasskeyCeremonyError } from '../passkeys/passkey-errors';
import { getAuthApiContext } from '../runtime/api-context';
import { authLogger } from '../runtime/logger';
import { useAuthStore } from '../session/auth-store';
import { PROTECTED_GRANT_HEADER } from '../session/client-headers';
import { useSharedSessionStore } from '../shared-session/shared-session-store';
import { runSsoRoundTrip } from '../sso/sso-browser';
import { setProtectedGrantProvider } from './grant-provider';

// ---------------------------------------------------------------------------------------------------------------------
// Advanced Data Protection grant state (omni-plan §7.3: Dispatch's session generation and grant expiry timer + Unit's
// shared-lock generation + IC's grant refresh hook). DELIBERATELY NOT PERSISTED: the grant is a security credential and
// lives in memory only (ADP plan 7.2). Restart, sign-out, a department switch or a shared-session lock always start
// concealed. The window is ABSOLUTE — activity never extends it. BigBoard never holds a grant.
// ---------------------------------------------------------------------------------------------------------------------

/** Why the last step-up did not produce a grant: the TOTP path's own codes, or the server's code / `passkey_*` / `sso_*`. */
export type StepUpErrorCode = 'invalid_totp' | 'mfa_not_enrolled' | 'too_many_attempts' | 'grants_not_configured' | 'unknown' | (string & {});

/** What ensureGrant() concluded. The caller shows the step-up prompt only for 'step_up_required'. */
export type GrantOutcome = 'granted' | 'step_up_required' | 'unavailable';

export interface DataProtectionCapabilities {
  isProtectionEnabled: boolean;
  stepUpWindowMinutes: number;
  isDepartmentLocked: boolean;
  lockReason: string | null;
}

export interface DataProtectionState {
  capabilities: DataProtectionCapabilities | null;
  isCapabilitiesLoaded: boolean;
  /** Epoch ms the current window expires, or null when no grant is held. */
  stepUpExpiresAt: number | null;
  /** The signed grant. Memory only; never written to storage or logs. */
  grantToken: string | null;
  isVerifying: boolean;
  isRequestingGrant: boolean;
  /** Whether the single app-level step-up prompt is showing (mounted once in the shell). */
  isPromptOpen: boolean;
  lastError: StepUpErrorCode | null;
  /** The step-up methods this member has and the department accepts for protected data; null until loaded. */
  stepUpMethods: string[] | null;
  preferredStepUpMethod: string | null;
}

const INITIAL: DataProtectionState = {
  capabilities: null,
  isCapabilitiesLoaded: false,
  stepUpExpiresAt: null,
  grantToken: null,
  isVerifying: false,
  isRequestingGrant: false,
  isPromptOpen: false,
  lastError: null,
  stepUpMethods: null,
  preferredStepUpMethod: null,
};

export const dataProtectionStore = create<DataProtectionState>()(() => ({ ...INITIAL }));

// Bumped by sign-out, a shared-session lock and every reset. Each request captures it before awaiting and drops its result
// when it moved on, so an answer that lands after sign-out cannot write the previous session's grant back for the next one.
let sessionGeneration = 0;

// The window is absolute, so its end is known the moment a grant is accepted. Clearing the token on that timer is what
// turns an open screen back to "protected"; one timer per grant.
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_TIMER_DELAY_MS = 0x7fffffff;

const clearExpiryTimer = (): void => {
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
};

const scheduleExpiry = (expiresAt: number): void => {
  clearExpiryTimer();
  expiryTimer = setTimeout(
    () => {
      expiryTimer = null;
      // Only the grant this timer was set for; a newer one has its own timer.
      if (dataProtectionStore.getState().stepUpExpiresAt === expiresAt) {
        dataProtectionStore.setState({ stepUpExpiresAt: null, grantToken: null });
      }
    },
    Math.min(Math.max(0, expiresAt - Date.now()), MAX_TIMER_DELAY_MS)
  );
};

/** The grant a step-up returned, when it is usable; a token-less or already-expired answer is a failure. */
export const grantFrom = (result: StepUpResult | null | undefined, now: number = Date.now()): { grantToken: string; stepUpExpiresAt: number } | null => {
  const expiresAt = parseUtc(result?.StepUpExpiresOnUtc ?? null);
  return result?.GrantToken && expiresAt !== null && expiresAt > now ? { grantToken: result.GrantToken, stepUpExpiresAt: expiresAt } : null;
};

const problemType = (error: unknown): string | undefined => {
  const type = bodyOf(httpFailureOf(error)?.data)?.type;
  return typeof type === 'string' ? type : undefined;
};

const TOTP_CODES = new Set(['invalid_totp', 'mfa_not_enrolled', 'too_many_attempts', 'grants_not_configured']);

const accept = (result: StepUpResult | null | undefined): boolean => {
  const grant = grantFrom(result);
  if (!grant) {
    dataProtectionStore.setState({ isVerifying: false, lastError: 'unknown' });
    return false;
  }
  dataProtectionStore.setState({ ...grant, isVerifying: false, lastError: null });
  scheduleExpiry(grant.stepUpExpiresAt);
  return true;
};

/** Runs one step-up method; the grant it returns (memory only) becomes the window, and any refusal its code. */
const stepUp = async (method: string, run: () => Promise<StepUpResult | null>): Promise<boolean> => {
  const generation = sessionGeneration;
  dataProtectionStore.setState({ isVerifying: true, lastError: null });
  try {
    const result = await run();
    if (generation !== sessionGeneration) {
      return false;
    }
    if (!result) {
      dataProtectionStore.setState({ isVerifying: false });
      return false;
    }
    return accept(result);
  } catch (error) {
    if (generation !== sessionGeneration) {
      return false;
    }
    const type = problemType(error);
    const code = isPasskeyCeremonyError(error) ? `passkey_${error.reason}` : method === 'totp' ? (type && TOTP_CODES.has(type) ? type : 'unknown') : toMfaProblem(error).code;
    // Never the code itself: only the refusal's type.
    authLogger.warn({ message: 'Data protection step-up failed', context: { method, errorType: code } });
    dataProtectionStore.setState({ isVerifying: false, lastError: code });
    return false;
  }
};

const canHoldGrants = (): boolean => useAuthStore.getState().status === 'signedIn';

// ---- Actions ---------------------------------------------------------------------------------------------------------

export async function fetchDataProtectionCapabilities(): Promise<void> {
  const generation = sessionGeneration;
  try {
    const response = await getDataProtectionCapabilities(getAuthApiContext());
    if (generation !== sessionGeneration) {
      return;
    }
    const data = response?.Data;
    dataProtectionStore.setState({
      capabilities: data
        ? { isProtectionEnabled: !!data.IsProtectionEnabled, stepUpWindowMinutes: data.StepUpWindowMinutes ?? 15, isDepartmentLocked: !!data.IsDepartmentLocked, lockReason: data.LockReason ?? null }
        : null,
      isCapabilitiesLoaded: true,
    });
  } catch (error) {
    if (generation !== sessionGeneration) {
      return;
    }
    // Unknown capability state fails closed. Only the status/type are logged — never the request (it may carry the grant).
    authLogger.warn({ message: 'Failed to fetch data protection capabilities', context: { status: httpFailureOf(error)?.status ?? null, errorType: problemType(error) } });
    dataProtectionStore.setState({ isCapabilitiesLoaded: true });
  }
}

export async function loadStepUpMethods(): Promise<void> {
  try {
    const result = await getStepUpMethods(getAuthApiContext());
    const methods = (result?.Data?.Methods ?? []).filter((m) => m !== 'passkey' || passkeysSupported());
    dataProtectionStore.setState({ stepUpMethods: methods, preferredStepUpMethod: result?.Data?.Preferred ?? null });
  } catch {
    // An older server has no methods list: the authenticator code is the step-up it has always offered.
    dataProtectionStore.setState({ stepUpMethods: ['totp'], preferredStepUpMethod: 'totp' });
  }
}

/** True while an unexpired grant token is held. Evaluate at the moment of use. */
export const isStepUpActive = (now: number = Date.now()): boolean => {
  const { grantToken, stepUpExpiresAt } = dataProtectionStore.getState();
  return !!grantToken && stepUpExpiresAt !== null && now < stepUpExpiresAt;
};

/**
 * Headers for a request that may read protected values (`X-Resgrid-Protected-Grant`), or {} when no live grant is held.
 * Expiry is checked here rather than trusted from state: a grant that lapsed while a screen sat open is never attached.
 */
export const getProtectedGrantHeaders = (): Record<string, string> => {
  const { grantToken } = dataProtectionStore.getState();
  return grantToken && isStepUpActive() ? { [PROTECTED_GRANT_HEADER]: grantToken } : {};
};

/**
 * Tries to obtain a grant without prompting: 'granted' when the department exempted this app, 'step_up_required' when the
 * member must verify, 'unavailable' when grants are not configured. Anything unexpected asks for a second factor.
 */
export async function ensureGrant(): Promise<GrantOutcome> {
  if (isStepUpActive()) {
    return 'granted';
  }
  if (!canHoldGrants()) {
    return 'step_up_required';
  }
  dataProtectionStore.setState({ isRequestingGrant: true, lastError: null });
  const generation = sessionGeneration;
  try {
    const result = await requestProtectedGrant(getAuthApiContext());
    if (generation !== sessionGeneration) {
      return 'step_up_required';
    }
    const grant = grantFrom(result);
    if (!grant) {
      dataProtectionStore.setState({ isRequestingGrant: false });
      return 'step_up_required';
    }
    dataProtectionStore.setState({ ...grant, isRequestingGrant: false, lastError: null });
    scheduleExpiry(grant.stepUpExpiresAt);
    return 'granted';
  } catch (error) {
    if (generation !== sessionGeneration) {
      return 'step_up_required';
    }
    dataProtectionStore.setState({ isRequestingGrant: false });
    return problemType(error) === 'grants_not_configured' ? 'unavailable' : 'step_up_required';
  }
}

/** Step-up with the authenticator code; true on success. The code is never logged. */
export const verifyStepUpOtp = (code: string): Promise<boolean> => stepUp('totp', () => verifyStepUp(getAuthApiContext(), { Code: code.trim() }));

/** A passkey for this app (plan section 8.1). */
export const verifyStepUpWithPasskey = (): Promise<boolean> =>
  stepUp('passkey', async () => {
    const ctx = getAuthApiContext();
    const ceremony = await getStepUpPasskeyOptions(ctx);
    const options = (ceremony?.Data?.Options ?? {}) as WebAuthnOptions;
    const credential = await getPasskeyAssertion(options);
    return verifyStepUpPasskey(ctx, { RequestId: ceremony?.Data?.RequestId ?? null, Credential: credential });
  });

/** Approve with Responder: returns the number to show on this screen only. */
export async function requestStepUpApprovalNumber(): Promise<{ id: string; number: string } | null> {
  dataProtectionStore.setState({ lastError: null });
  try {
    const started = await requestStepUpApproval(getAuthApiContext());
    return { id: started.ApprovalRequestId, number: started.MatchNumber };
  } catch (error) {
    dataProtectionStore.setState({ lastError: toMfaProblem(error).code });
    return null;
  }
}

export const waitForStepUpApproval = (approvalRequestId: string, signal?: AbortSignal): Promise<ApprovalWaitResult> => waitForApproval(() => getStepUpApprovalStatus(getAuthApiContext(), approvalRequestId), signal);

export const completeStepUpWithApproval = (approvalRequestId: string): Promise<boolean> => stepUp('passkey_approval', () => completeStepUpApproval(getAuthApiContext(), { ApprovalRequestId: approvalRequestId }));

export async function cancelStepUpApprovalRequest(approvalRequestId: string): Promise<void> {
  await cancelStepUpApproval(getAuthApiContext(), approvalRequestId).catch(() => undefined);
}

/** The department's identity provider, where it accepts its provider's MFA for protected data (plan section 7.8). */
export const verifyStepUpFederated = (): Promise<boolean> =>
  stepUp('federated', async () => {
    const ctx = getAuthApiContext();
    const trip = await runSsoRoundTrip((secrets) => beginStepUpSso(ctx, secrets));
    if (!trip.ok) {
      dataProtectionStore.setState({ lastError: trip.code ?? `sso_${trip.reason}` });
      return null;
    }
    return completeStepUpFederated(ctx, { SsoTransactionId: trip.trip.ssoTransactionId, SsoCode: trip.trip.ssoCode, CodeVerifier: trip.trip.codeVerifier });
  });

/** Opens the single step-up prompt — never for a reveal whose request outlived the session. */
export function openStepUpPrompt(): void {
  if (!canHoldGrants()) {
    return;
  }
  dataProtectionStore.setState({ isPromptOpen: true, lastError: null });
}

export const closeStepUpPrompt = (): void => dataProtectionStore.setState({ isPromptOpen: false });

/** Drops the grant immediately (manual conceal, background). */
export function clearStepUp(): void {
  clearExpiryTimer();
  dataProtectionStore.setState({ stepUpExpiresAt: null, grantToken: null, lastError: null });
}

/** Drops everything of the session, including any ceremony still running (its result is discarded). */
export function resetDataProtection(): void {
  sessionGeneration += 1;
  clearExpiryTimer();
  dataProtectionStore.setState({ ...INITIAL });
}

/** Conceal on a shared-session lock: the grant goes, the department's capabilities stay. */
const concealForLock = (): void => {
  sessionGeneration += 1;
  clearExpiryTimer();
  dataProtectionStore.setState({ stepUpExpiresAt: null, grantToken: null, isVerifying: false, isRequestingGrant: false, isPromptOpen: false, lastError: null });
};

// The grant never survives the session: drop everything the moment auth leaves 'signedIn'.
useAuthStore.subscribe((state, previous) => {
  if (previous.status === 'signedIn' && state.status !== 'signedIn') {
    resetDataProtection();
  }
});

// A shared session that locks drops the grant at once (passkey plan section 12.5.3): the next operator never sees what the
// last one revealed, and the server refuses a grant from before the lock anyway.
useSharedSessionStore.subscribe((state, previous) => {
  if (state.locked && !previous.locked) {
    concealForLock();
  }
});

registerStoreReset('auth.data-protection', () => resetDataProtection());

// Every request through the authenticated client carries the grant while one is held.
setProtectedGrantProvider(getProtectedGrantHeaders);

/** Reactive: protection is enabled for the department (unknown reads as false). */
export const useIsProtectionEnabled = (): boolean => dataProtectionStore((state) => !!state.capabilities?.isProtectionEnabled);

/** Reactive expiry; callers gating a reveal must ALSO call isStepUpActive() at the moment of use. */
export const useStepUpExpiresAt = (): number | null => dataProtectionStore((state) => state.stepUpExpiresAt);

export const useHasGrantToken = (): boolean => dataProtectionStore((state) => !!state.grantToken);

export const useIsStepUpPromptOpen = (): boolean => dataProtectionStore((state) => state.isPromptOpen);
