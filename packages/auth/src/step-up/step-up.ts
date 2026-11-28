import { registerStoreReset } from '@resgrid/offline';
import { z } from 'zod';
import { create } from 'zustand';

import { authData } from '../api/auth-request';
import { mfaApprovalEndpoints, ssoEndpoints, stepUpEndpoints } from '../api/endpoints';
import { adoptProtectedGrant } from '../data-protection/grant-store';
import { bodyOf, httpFailureOf } from '../errors/http-shape';
import { type ApprovalWaitResult, waitForApproval } from '../mfa/approval-wait';
import type { ApprovalRequestData, ApprovalStatusData, SsoBeginData, WebAuthnOptions } from '../mfa/types';
import { getPasskeyAssertion, passkeysSupported } from '../passkeys/passkey';
import { isPasskeyCeremonyError } from '../passkeys/passkey-errors';
import { getAuthApiContext } from '../runtime/api-context';
import { authLogger } from '../runtime/logger';
import { runSsoRoundTrip, type SsoRoundTripSecrets } from '../sso/sso-browser';

// ---------------------------------------------------------------------------------------------------------------------
// Step-up for one area (Core round 10 A5): a step-up-protected v4 action refuses with one 403 problem
// (`type: step_up_required`, the area and the methods); the app verifies in its own sheet — an authenticator code, a passkey,
// approval from Responder, the department's provider MFA, signing in again with the organization's SSO in the system auth
// session, or the password — through `StepUp/Verify`, then sends the refused request again. Signatures, acknowledgments and
// approvals keep the evidence on the session (no header; the same request simply succeeds); protected data answers the ADP grant
// the grant store keeps. Codes and passwords live only in the call that sends them and are never logged.
// ---------------------------------------------------------------------------------------------------------------------

export type StepUpArea = 'signatures' | 'acknowledgments' | 'approvals' | 'protected_data';

/** What the refusal (or `StepUp/Options`) says about an area: method classes (mfa, sso, password) and MFA methods. */
export interface StepUpRequirement {
  area: StepUpArea;
  required: boolean;
  allowedMethods: string[];
  usableMethods: string[];
  mfaMethods: string[];
  windowMinutes: number;
  /** False: the member has nothing usable here (e.g. 2FA is required and not enrolled). */
  canComplete: boolean;
}

/** `GET StepUp/Options` data, with the passkey ceremony when a passkey is usable. */
export interface AreaStepUpOptionsData {
  Area: string;
  Required: boolean;
  AllowedMethods: string[] | null;
  UsableMethods: string[] | null;
  MfaMethods: string[] | null;
  WindowMinutes: number;
  CanComplete: boolean;
  Satisfied?: boolean;
  SatisfiedUntil?: string | null;
  Passkey?: { RequestId: string | null; Options: WebAuthnOptions | null } | null;
}

/** `POST StepUp/Verify` data (the grant fields only for protected data). */
export interface AreaStepUpVerifyData {
  Area: string;
  Method: string;
  MethodClass: string;
  VerifiedAt: string;
  ExpiresAt: string;
  GrantId?: string | null;
  GrantToken?: string | null;
  GrantExpiresAt?: string | null;
}

/** One verification method the sheet offers (`StepUp/Verify` Method). */
export type StepUpMethod = 'totp' | 'passkey' | 'passkey_approval' | 'federated' | 'sso' | 'password';

const AREAS = ['signatures', 'acknowledgments', 'approvals', 'protected_data'] as const;

const REFUSAL = z.object({
  type: z.literal('step_up_required'),
  area: z.enum(AREAS),
  required: z.boolean().optional(),
  allowedMethods: z.array(z.string()).optional(),
  usableMethods: z.array(z.string()).optional(),
  mfaMethods: z.array(z.string()).optional(),
  windowMinutes: z.number().optional(),
  canComplete: z.boolean().optional(),
});

/** The step-up a v4 refusal asks for (403 `step_up_required` with an area), or null for any other failure. */
export function stepUpRequirementOf(cause: unknown): StepUpRequirement | null {
  const failure = httpFailureOf(cause);

  if (!failure?.answered || failure.status !== 403) return null;

  const parsed = REFUSAL.safeParse(bodyOf(failure.data));

  if (!parsed.success) return null;

  const body = parsed.data;

  return {
    area: body.area,
    required: body.required ?? true,
    allowedMethods: body.allowedMethods ?? [],
    usableMethods: body.usableMethods ?? [],
    mfaMethods: body.mfaMethods ?? [],
    windowMinutes: body.windowMinutes ?? 15,
    canComplete: body.canComplete ?? true,
  };
}

/** The member closed the step-up sheet (or nothing usable was offered): the action was not sent again. */
export class StepUpCancelledError extends Error {
  public readonly code = 'step_up_cancelled';

  public readonly area: StepUpArea;

  constructor(public readonly requirement: StepUpRequirement) {
    super('Step-up was not completed');
    this.name = 'StepUpCancelledError';
    this.area = requirement.area;
  }
}

/** The methods the sheet offers for an area: the usable classes, MFA expanded to the member's MFA methods this device can run. */
export function offeredMethods(requirement: Pick<StepUpRequirement, 'usableMethods' | 'mfaMethods'>, options?: AreaStepUpOptionsData | null, passkeys: boolean = passkeysSupported()): StepUpMethod[] {
  const usable = new Set(options?.UsableMethods ?? requirement.usableMethods);
  const mfa = options?.MfaMethods ?? requirement.mfaMethods;
  const methods: StepUpMethod[] = [];

  if (usable.has('mfa')) {
    if (mfa.includes('totp')) methods.push('totp');

    if (mfa.includes('passkey') && passkeys) methods.push('passkey');

    if (mfa.includes('passkey_approval')) methods.push('passkey_approval');

    if (mfa.includes('federated')) methods.push('federated');
  }

  if (usable.has('sso')) methods.push('sso');

  if (usable.has('password')) methods.push('password');

  return methods;
}

interface PendingStepUp {
  /** Which sheet this is: a result that arrives after its sheet closed never closes, answers or marks a later one. */
  id: number;
  requirement: StepUpRequirement;
  options: AreaStepUpOptionsData | null;
}

export interface StepUpState {
  pending: PendingStepUp | null;
  isVerifying: boolean;
  /** Why the last attempt failed: the server's problem type, `passkey_*`, `sso_*` or `approval_*`. Never a code or password. */
  lastError: string | null;
  /** Areas whose sheet the member closed: queued replays wait for the member instead of opening it again on their own. */
  dismissedAreas: StepUpArea[];
}

const INITIAL: StepUpState = { pending: null, isVerifying: false, lastError: null, dismissedAreas: [] };

export const stepUpStore = create<StepUpState>()(() => ({ ...INITIAL }));

interface StepUpWaiter {
  area: StepUpArea;
  resolve: (verified: boolean) => void;
}

let waiters: StepUpWaiter[] = [];

/** Areas asked for while another area's sheet is open, in order; each opens when the one before it settles. */
let queued: StepUpRequirement[] = [];
let lastSheetId = 0;
const verifiedListeners = new Set<(area: StepUpArea) => void>();

/** Runs after every completed step-up (an outbox drains the writes that were waiting for it). */
export function onStepUpVerified(listener: (area: StepUpArea) => void): () => void {
  verifiedListeners.add(listener);

  return () => verifiedListeners.delete(listener);
}

/** The sheet `id` while it is still the open one, else null (closed, or replaced by the next area's). */
function openSheetOf(id: number): PendingStepUp | null {
  const pending = stepUpStore.getState().pending;

  return pending?.id === id ? pending : null;
}

async function loadOptions(id: number, area: StepUpArea): Promise<void> {
  try {
    const options = await authData<AreaStepUpOptionsData>(getAuthApiContext(), stepUpEndpoints.options, { params: { area } });
    const pending = openSheetOf(id);

    if (pending) stepUpStore.setState({ pending: { ...pending, options } });
  } catch (error) {
    // A refusal already carries the methods (the options only add the passkey ceremony); a sheet opened without them says why.
    const pending = openSheetOf(id);

    if (pending && pending.requirement.usableMethods.length === 0) stepUpStore.setState({ lastError: stepUpErrorCode(error) });
  }
}

function openSheet(requirement: StepUpRequirement): void {
  lastSheetId += 1;
  stepUpStore.setState({ pending: { id: lastSheetId, requirement, options: null }, lastError: null, isVerifying: false });
  void loadOptions(lastSheetId, requirement.area);
}

/** Shows why an attempt failed, on its own sheet only: a later sheet keeps its own state. */
function failOn(id: number, lastError: string): void {
  if (openSheetOf(id)) stepUpStore.setState({ isVerifying: false, lastError });
}

/** Tells every caller waiting for an area how it ended, then opens the next area asked for meanwhile. */
function settle(area: StepUpArea, verified: boolean): void {
  const done = waiters.filter((waiter) => waiter.area === area);

  waiters = waiters.filter((waiter) => waiter.area !== area);

  for (const waiter of done) waiter.resolve(verified);

  const next = queued.shift();

  if (next) openSheet(next);
}

/**
 * Opens the step-up sheet for an area and resolves true once the member verified, false when they close it. One sheet at a time:
 * a request for the open area joins it, and another area waits for its turn. `interactive: false` (a queued write replaying in the
 * background) never opens a sheet the member already closed for that area.
 */
export function requestStepUp(requirement: StepUpRequirement, options: { interactive?: boolean } = {}): Promise<boolean> {
  const state = stepUpStore.getState();

  if (options.interactive === false && state.dismissedAreas.includes(requirement.area)) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    waiters.push({ area: requirement.area, resolve });

    if (state.pending?.requirement.area === requirement.area || queued.some((item) => item.area === requirement.area)) return;

    if (state.pending) queued.push(requirement);
    else openSheet(requirement);
  });
}

/** The member closed the sheet: every caller waiting for it gets false, and background replays stop prompting for that area. */
export function cancelStepUp(): void {
  const area = stepUpStore.getState().pending?.requirement.area;

  if (!area) return;
  stepUpStore.setState((state) => ({ pending: null, isVerifying: false, lastError: null, dismissedAreas: state.dismissedAreas.includes(area) ? state.dismissedAreas : [...state.dismissedAreas, area] }));
  settle(area, false);
}

/** A refusal's problem type, when it is one the sheet can name (lower-case words). */
const PROBLEM_TYPE = z.object({ type: z.string().regex(/^[a-z_]{2,64}$/) });

/** What `StepUp/Verify` takes besides the area and the method: the one proof the method needs. Never logged. */
interface StepUpVerifyFields {
  Code?: string;
  Password?: string;
  RequestId?: string;
  Credential?: Awaited<ReturnType<typeof getPasskeyAssertion>>;
  ApprovalRequestId?: string;
  SsoTransactionId?: string;
  SsoCode?: string;
  CodeVerifier?: string;
}

/** The error code a failed verification shows (problem type, or the passkey / SSO round-trip reason). */
export function stepUpErrorCode(cause: unknown): string {
  if (isPasskeyCeremonyError(cause)) return `passkey_${cause.reason}`;

  const failure = httpFailureOf(cause);

  if (!failure?.answered) return 'network';

  const problem = PROBLEM_TYPE.safeParse(bodyOf(failure.data));

  if (problem.success) return problem.data.type;

  return failure.status === 429 ? 'too_many_attempts' : 'step_up_failed';
}

/** Protected data is verified only once its grant is held: one that expired in transit (or none at all) leaves the reveal refused. */
function holdsGrant(area: StepUpArea, data: AreaStepUpVerifyData | null | undefined): boolean {
  if (area !== 'protected_data') return true;

  if (!data?.GrantToken || !data.GrantExpiresAt) return false;

  return adoptProtectedGrant(data.GrantToken, data.GrantExpiresAt);
}

/**
 * Verifies one method with `StepUp/Verify` for the sheet `sheetId` (the open one by default); on success that sheet closes
 * and every caller waiting for it sends its request again. Nothing is sent once that sheet is no longer the open one, and a
 * result that comes back after it closed (cancelled, signed out, or replaced by the next area's) leaves the open sheet alone.
 */
async function verify(body: StepUpVerifyFields, method: StepUpMethod, sheetId: number | undefined = stepUpStore.getState().pending?.id): Promise<boolean> {
  const pending = sheetId === undefined ? null : openSheetOf(sheetId);

  if (!pending) return false;

  const area = pending.requirement.area;

  stepUpStore.setState({ isVerifying: true, lastError: null });

  try {
    const data = await authData<AreaStepUpVerifyData>(getAuthApiContext(), stepUpEndpoints.verify, { body: { Area: area, Method: method, ...body } });
    // The server issued the grant either way: it is kept even when the sheet that asked for it has closed meanwhile.
    const granted = holdsGrant(area, data);

    if (!openSheetOf(pending.id)) return false;

    if (!granted) {
      authLogger.warn({ message: 'Step-up verified but the protected-data grant could not be held', context: { area, method } });
      failOn(pending.id, 'grant_not_adopted');

      return false;
    }

    stepUpStore.setState((state) => ({ pending: null, isVerifying: false, lastError: null, dismissedAreas: state.dismissedAreas.filter((item) => item !== area) }));
    settle(area, true);

    for (const listener of [...verifiedListeners]) listener(area);

    return true;
  } catch (error) {
    const code = stepUpErrorCode(error);

    // The method and the refusal's type only: never the code, the password or the credential.
    authLogger.warn({ message: 'Step-up verification failed', context: { area, method, errorType: code } });
    failOn(pending.id, code);

    return false;
  }
}

/** The authenticator code (TOTP). */
export const verifyStepUpCode = (code: string): Promise<boolean> => verify({ Code: code.trim() }, 'totp');

/** Re-entering the account password, where the department allows it. */
export const verifyStepUpPassword = (password: string): Promise<boolean> => verify({ Password: password }, 'password');

/** A passkey of this app, with the ceremony `StepUp/Options` handed out. */
export async function verifyStepUpPasskey(): Promise<boolean> {
  const sheet = stepUpStore.getState().pending;
  const passkey = sheet?.options?.Passkey;

  if (!sheet || !passkey?.RequestId || !passkey.Options) {
    stepUpStore.setState({ lastError: 'passkey_unavailable' });

    return false;
  }

  try {
    const credential = await getPasskeyAssertion(passkey.Options);

    // The ceremony cannot be stopped: its assertion goes only to the sheet that started it.
    return await verify({ RequestId: passkey.RequestId, Credential: credential }, 'passkey', sheet.id);
  } catch (error) {
    failOn(sheet.id, stepUpErrorCode(error));

    return false;
  }
}

/** Why an approval that was not granted failed (expired, canceled and consumed read as expired). */
const APPROVAL_ERRORS = new Map<ApprovalWaitResult, string>([
  ['denied', 'approval_denied'],
  ['unavailable', 'network'],
]);

const approvalBody = (area: StepUpArea): Record<string, string> => (area === 'protected_data' ? { Purpose: 'adp' } : { Purpose: 'step_up', Operation: 'sensitive_operation' });

/** Asks Responder to approve: the number to show on this screen, then the decision; a granted approval is verified. */
export async function startStepUpApproval(onNumber: (number: string) => void, signal?: AbortSignal): Promise<boolean> {
  const sheet = stepUpStore.getState().pending;

  if (!sheet) return false;

  const area = sheet.requirement.area;

  stepUpStore.setState({ lastError: null });

  try {
    const ctx = getAuthApiContext();
    const started = await authData<ApprovalRequestData>(ctx, mfaApprovalEndpoints.request, { body: approvalBody(area) });

    onNumber(started.MatchNumber);

    const decided: ApprovalWaitResult = await waitForApproval(() => authData<ApprovalStatusData>(ctx, mfaApprovalEndpoints.status, { body: { ApprovalRequestId: started.ApprovalRequestId } }), signal);

    if (decided === 'aborted') {
      await authData(ctx, mfaApprovalEndpoints.cancel, { body: { ApprovalRequestId: started.ApprovalRequestId } }).catch(() => undefined);

      return false;
    }

    if (decided !== 'approved') {
      failOn(sheet.id, APPROVAL_ERRORS.get(decided) ?? 'approval_expired');

      return false;
    }

    // Approved for this sheet's area: verified only while this sheet is still the open one.
    return await verify({ ApprovalRequestId: started.ApprovalRequestId }, 'passkey_approval', sheet.id);
  } catch (error) {
    failOn(sheet.id, stepUpErrorCode(error));

    return false;
  }
}

const ssoBegin = (purpose: Record<string, string>) => (secrets: SsoRoundTripSecrets) =>
  authData<SsoBeginData>(getAuthApiContext(), ssoEndpoints.begin, {
    body: { ...purpose, ReturnTarget: secrets.returnTarget, State: secrets.state, CodeChallenge: secrets.codeChallenge, CodeChallengeMethod: 'S256', Platform: secrets.platform },
  });

/** The round trip through the system auth session (ASWebAuthenticationSession / Custom Tabs; the desktop loopback in Electron). */
async function viaSso(method: 'sso' | 'federated', purpose: Record<string, string>): Promise<boolean> {
  const sheet = stepUpStore.getState().pending;

  if (!sheet) return false;
  stepUpStore.setState({ lastError: null });

  const trip = await runSsoRoundTrip(ssoBegin(purpose));

  if (!trip.ok) {
    failOn(sheet.id, trip.code ?? `sso_${trip.reason}`);

    return false;
  }

  // The round trip cannot be stopped: its result goes only to the sheet that started it.
  return verify({ SsoTransactionId: trip.trip.ssoTransactionId, SsoCode: trip.trip.ssoCode, CodeVerifier: trip.trip.codeVerifier }, method, sheet.id);
}

/** Signing in again with the organization's SSO (the broker asks the provider for a fresh login). */
export const verifyStepUpSso = (): Promise<boolean> => viaSso('sso', { Purpose: 'reauth' });

/** The department's provider MFA. */
export const verifyStepUpProvider = (): Promise<boolean> => {
  const area = stepUpStore.getState().pending?.requirement.area;

  return viaSso('federated', area === 'protected_data' ? { Purpose: 'adp_step_up' } : { Purpose: 'step_up', Operation: 'sensitive_operation' });
};

/**
 * Runs a step-up-protected request; when it is refused with `step_up_required`, asks for the step-up and sends it once more.
 * Throws StepUpCancelledError when the member does not verify, and the request's own error otherwise.
 */
export async function withStepUp<T>(run: () => Promise<T>, options: { interactive?: boolean } = {}): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const requirement = stepUpRequirementOf(error);

    if (!requirement) throw error;

    if (!(await requestStepUp(requirement, options))) throw new StepUpCancelledError(requirement);

    return run();
  }
}

/** Sign-out: no sheet survives the session; waiting callers are told it was not completed. */
export function resetStepUp(): void {
  const resolve = waiters;

  waiters = [];
  queued = [];
  stepUpStore.setState({ ...INITIAL });

  for (const waiter of resolve) waiter.resolve(false);
}

registerStoreReset('auth.step-up', resetStepUp);

export const useStepUpPending = (): PendingStepUp | null => stepUpStore((state) => state.pending);
