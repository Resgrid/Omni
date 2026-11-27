import { ApiError } from '@resgrid/api';

import { dataProtectionStore, getProtectedGrantHeaders } from '../data-protection/grant-store';
import { refreshEngine, useAuthStore } from '../session/auth-store';
import {
  type AreaStepUpOptionsData,
  type AreaStepUpVerifyData,
  cancelStepUp,
  offeredMethods,
  onStepUpVerified,
  requestStepUp,
  resetStepUp,
  startStepUpApproval,
  StepUpCancelledError,
  stepUpErrorCode,
  type StepUpRequirement,
  stepUpRequirementOf,
  stepUpStore,
  verifyStepUpCode,
  verifyStepUpPasskey,
  verifyStepUpPassword,
  verifyStepUpProvider,
  verifyStepUpSso,
  withStepUp,
} from '../step-up/step-up';
import { __resetWebBrowserFake, __setNextAuthSessionResult, calls as authSessionCalls } from './fakes/expo-web-browser';
import { __setPasskeyOutcome } from './fakes/react-native-passkey';
import { type FakeServer, v4 } from './helpers/fake-server';
import { flush, type Harness, setupHarness } from './helpers/harness';
import { tokenResponse } from './helpers/jwt';

/** Core's one refusal shape for a step-up-protected v4 action (round 10 A5). */
interface RefusalBody {
  type: string;
  title: string;
  status: number;
  area: string;
  required: boolean;
  allowedMethods: string[];
  usableMethods: string[];
  mfaMethods: string[];
  windowMinutes: number;
  canComplete: boolean;
}

const problem = (overrides: Partial<RefusalBody> = {}): RefusalBody => ({
  type: 'step_up_required',
  title: 'Verify it is you to continue.',
  status: 403,
  area: 'acknowledgments',
  required: true,
  allowedMethods: ['mfa', 'sso', 'password'],
  usableMethods: ['mfa', 'sso', 'password'],
  mfaMethods: ['totp', 'passkey', 'passkey_approval', 'federated'],
  windowMinutes: 15,
  canComplete: true,
  ...overrides,
});

const refusal = (overrides: Partial<RefusalBody> = {}) => new ApiError({ kind: 'http', status: 403, problemType: 'step_up_required', data: problem(overrides) });

const requirementFor = (overrides: Partial<RefusalBody> = {}): StepUpRequirement => {
  const requirement = stepUpRequirementOf(refusal(overrides));

  if (!requirement) throw new Error('not a step-up refusal');

  return requirement;
};

const options = (overrides: Partial<AreaStepUpOptionsData> = {}) =>
  v4({
    Area: 'acknowledgments',
    Required: true,
    AllowedMethods: ['mfa', 'sso', 'password'],
    UsableMethods: ['mfa', 'sso', 'password'],
    MfaMethods: ['totp', 'passkey', 'passkey_approval', 'federated'],
    WindowMinutes: 15,
    CanComplete: true,
    Satisfied: false,
    SatisfiedUntil: null,
    Passkey: { RequestId: 'pk-req-1', Options: { challenge: 'abc', rpId: 'responder.resgrid.com' } },
    ...overrides,
  });

const verified = (area = 'acknowledgments', method = 'totp', extra: Partial<AreaStepUpVerifyData> = {}) =>
  v4({ Area: area, Method: method, MethodClass: method === 'sso' ? 'sso' : method === 'password' ? 'password' : 'mfa', VerifiedAt: '2026-11-26T10:00:00Z', ExpiresAt: '2026-11-26T10:15:00Z', ...extra });

/** Opens the sheet for an area and waits for `StepUp/Options` to arrive; `verified` settles when the sheet does. */
const openSheet = async (requirement: StepUpRequirement = requirementFor()): Promise<{ verified: Promise<boolean> }> => {
  const verified = requestStepUp(requirement);
  await flush(10);

  return { verified };
};

/** The SSO broker: answers `Sso/Begin` and has the system auth session come back to the return target with a one-time code. */
const ssoBroker = (server: FakeServer, ssoCode = 'one-time'): void => {
  server.on('POST', '/Sso/Begin', (request) => {
    __setNextAuthSessionResult({ type: 'success', url: `${String(request.body.ReturnTarget)}?sso_code=${ssoCode}&state=${String(request.body.State)}` });

    return { data: v4({ AuthorizeUrl: 'https://broker.resgrid.com/authorize', SsoTransactionId: 'sso-tx-1', ExpiresIn: 300 }) };
  });
};

describe('step-up for an area (in the app, every method)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = setupHarness('responder');
    resetStepUp();
    __resetWebBrowserFake();
    h.server.on('POST', '/connect/token', { data: tokenResponse() });
    await useAuthStore.getState().login({ username: 'member', password: 'pw' });
    h.server.on('GET', '/StepUp/Options', { data: options() });
  });

  afterEach(() => {
    resetStepUp();
    refreshEngine.endSession();
  });

  it('reads the one 403 refusal shape and nothing else as a step-up', () => {
    expect(requirementFor()).toEqual({
      area: 'acknowledgments',
      required: true,
      allowedMethods: ['mfa', 'sso', 'password'],
      usableMethods: ['mfa', 'sso', 'password'],
      mfaMethods: ['totp', 'passkey', 'passkey_approval', 'federated'],
      windowMinutes: 15,
      canComplete: true,
    });
    expect(stepUpRequirementOf(new ApiError({ kind: 'http', status: 403, data: { type: 'protected_access_denied' } }))).toBeNull();
    expect(stepUpRequirementOf(new ApiError({ kind: 'http', status: 401, data: problem() }))).toBeNull();
    expect(stepUpRequirementOf(new ApiError({ kind: 'http', status: 403, data: problem({ area: 'unknown_area' }) }))).toBeNull();
    expect(stepUpRequirementOf(new ApiError({ kind: 'network' }))).toBeNull();
  });

  it('offers only what the department allows and the member can use here, passkeys only where the platform has them', () => {
    expect(offeredMethods(requirementFor(), null, true)).toEqual(['totp', 'passkey', 'passkey_approval', 'federated', 'sso', 'password']);
    expect(offeredMethods(requirementFor(), null, false)).toEqual(['totp', 'passkey_approval', 'federated', 'sso', 'password']);
    expect(offeredMethods(requirementFor({ usableMethods: ['sso'], mfaMethods: [] }), null, true)).toEqual(['sso']);
    // StepUp/Options, once loaded, is the newer word.
    expect(offeredMethods(requirementFor(), options({ UsableMethods: ['password'], MfaMethods: [] }).Data, true)).toEqual(['password']);
  });

  it('verifies with an authenticator code (trimmed, never logged) and sends the refused request again', async () => {
    h.server.on('POST', '/StepUp/Verify', { data: verified() });
    const run = jest.fn<Promise<string>, []>().mockRejectedValueOnce(refusal()).mockResolvedValue('signed');
    const result = withStepUp(run);
    await flush(10);
    expect(stepUpStore.getState().pending?.requirement.area).toBe('acknowledgments');
    expect(h.server.requestsTo('GET', '/StepUp/Options')[0].url).toContain('area=acknowledgments');

    await expect(verifyStepUpCode(' 123456 ')).resolves.toBe(true);
    await expect(result).resolves.toBe('signed');
    expect(run).toHaveBeenCalledTimes(2);
    expect(h.server.requestsTo('POST', '/StepUp/Verify')[0].body).toEqual({ Area: 'acknowledgments', Method: 'totp', Code: '123456' });
    expect(stepUpStore.getState().pending).toBeNull();
  });

  it('verifies with the password where the department allows it, and says so when the account has no password', async () => {
    const { verified: pending } = await openSheet();
    h.server.once('POST', '/StepUp/Verify', { status: 409, data: { type: 'password_not_available' } });
    await expect(verifyStepUpPassword('hunter2')).resolves.toBe(false);
    expect(stepUpStore.getState().lastError).toBe('password_not_available');
    expect(stepUpStore.getState().pending).not.toBeNull();

    h.server.once('POST', '/StepUp/Verify', { status: 401, data: { type: 'invalid_password' } });
    await expect(verifyStepUpPassword('wrong')).resolves.toBe(false);
    expect(stepUpStore.getState().lastError).toBe('invalid_password');

    h.server.on('POST', '/StepUp/Verify', { data: verified('acknowledgments', 'password') });
    await expect(verifyStepUpPassword('hunter2')).resolves.toBe(true);
    await expect(pending).resolves.toBe(true);
    expect(h.server.requestsTo('POST', '/StepUp/Verify')[2].body).toEqual({ Area: 'acknowledgments', Method: 'password', Password: 'hunter2' });
  });

  it('shows the rate limit and keeps the sheet open', async () => {
    await openSheet();
    h.server.on('POST', '/StepUp/Verify', { status: 429, data: { type: 'too_many_attempts' } });
    await expect(verifyStepUpCode('000000')).resolves.toBe(false);
    expect(stepUpStore.getState().lastError).toBe('too_many_attempts');
    // A 429 without a problem body reads the same.
    expect(stepUpErrorCode(new ApiError({ kind: 'http', status: 429, data: '' }))).toBe('too_many_attempts');
    expect(stepUpStore.getState().pending).not.toBeNull();
  });

  it('verifies with a passkey from the ceremony StepUp/Options handed out', async () => {
    const { verified: pending } = await openSheet();
    __setPasskeyOutcome({ ok: false, error: { error: 'UserCancelled' } });
    await expect(verifyStepUpPasskey()).resolves.toBe(false);
    expect(stepUpStore.getState().lastError).toBe('passkey_cancelled');

    __setPasskeyOutcome({ ok: true, value: { id: 'cred', response: { authenticatorData: 'ad', clientDataJSON: 'cd', signature: 'sig' } } });
    h.server.on('POST', '/StepUp/Verify', { data: verified('acknowledgments', 'passkey') });
    await expect(verifyStepUpPasskey()).resolves.toBe(true);
    await expect(pending).resolves.toBe(true);
    expect(h.server.requestsTo('POST', '/StepUp/Verify')[0].body).toMatchObject({ Area: 'acknowledgments', Method: 'passkey', RequestId: 'pk-req-1', Credential: { id: 'cred', rawId: 'cred' } });
  });

  it('asks Responder to approve (step_up purpose), shows the number, and verifies the granted approval', async () => {
    const { verified: pending } = await openSheet(requirementFor({ area: 'approvals' }));
    h.server.on('POST', '/MfaApproval/Request', { data: v4({ ApprovalRequestId: 'ap-1', MatchNumber: '42', ExpiresIn: 120 }) });
    h.server.on('POST', '/MfaApproval/Status', { data: v4({ State: 'approved', ExpiresAt: null }) });
    h.server.on('POST', '/StepUp/Verify', { data: verified('approvals', 'passkey_approval') });
    const shown = jest.fn();
    await expect(startStepUpApproval(shown)).resolves.toBe(true);
    await expect(pending).resolves.toBe(true);
    expect(shown).toHaveBeenCalledWith('42');
    expect(h.server.requestsTo('POST', '/MfaApproval/Request')[0].body).toEqual({ Purpose: 'step_up', Operation: 'sensitive_operation' });
    expect(h.server.requestsTo('POST', '/StepUp/Verify')[0].body).toEqual({ Area: 'approvals', Method: 'passkey_approval', ApprovalRequestId: 'ap-1' });
  });

  it('says a declined approval was declined and keeps the sheet for another way', async () => {
    await openSheet();
    h.server.on('POST', '/MfaApproval/Request', { data: v4({ ApprovalRequestId: 'ap-2', MatchNumber: '7', ExpiresIn: 120 }) });
    h.server.on('POST', '/MfaApproval/Status', { data: v4({ State: 'denied', ExpiresAt: null }) });
    await expect(startStepUpApproval(() => undefined)).resolves.toBe(false);
    expect(stepUpStore.getState().lastError).toBe('approval_denied');
    expect(h.server.requestsTo('POST', '/StepUp/Verify')).toHaveLength(0);
  });

  it("verifies with the organization's provider MFA through the system auth session (step_up purpose)", async () => {
    const { verified: pending } = await openSheet();
    ssoBroker(h.server, 'provider-code');
    h.server.on('POST', '/StepUp/Verify', { data: verified('acknowledgments', 'federated') });
    await expect(verifyStepUpProvider()).resolves.toBe(true);
    await expect(pending).resolves.toBe(true);
    expect(h.server.requestsTo('POST', '/Sso/Begin')[0].body).toMatchObject({ Purpose: 'step_up', Operation: 'sensitive_operation', CodeChallengeMethod: 'S256' });
    const body = h.server.requestsTo('POST', '/StepUp/Verify')[0].body;
    expect(body).toMatchObject({ Area: 'acknowledgments', Method: 'federated', SsoTransactionId: 'sso-tx-1', SsoCode: 'provider-code' });
    expect(body.CodeVerifier).toEqual(expect.any(String));
    // The in-app auth session, never the web app.
    expect(authSessionCalls[0]?.authorizeUrl).toBe('https://broker.resgrid.com/authorize');
  });

  it('signs in again with the organization SSO (reauth, PKCE) and shows a refusal from an IdP that skipped the fresh login', async () => {
    const { verified: pending } = await openSheet(requirementFor({ area: 'signatures' }));
    ssoBroker(h.server);
    h.server.once('POST', '/StepUp/Verify', { status: 401, data: { type: 'sso_reauthentication_not_satisfied' } });
    await expect(verifyStepUpSso()).resolves.toBe(false);
    expect(stepUpStore.getState().lastError).toBe('sso_reauthentication_not_satisfied');

    h.server.on('POST', '/StepUp/Verify', { data: verified('signatures', 'sso') });
    await expect(verifyStepUpSso()).resolves.toBe(true);
    await expect(pending).resolves.toBe(true);
    const begin = h.server.requestsTo('POST', '/Sso/Begin')[0].body;
    expect(begin).toMatchObject({ Purpose: 'reauth', CodeChallengeMethod: 'S256' });
    expect(begin.CodeChallenge).toEqual(expect.any(String));
    expect(begin.State).toEqual(expect.any(String));
    expect(h.server.requestsTo('POST', '/StepUp/Verify')[1].body).toMatchObject({ Area: 'signatures', Method: 'sso', SsoTransactionId: 'sso-tx-1', SsoCode: 'one-time' });
  });

  it('keeps the sheet when the member closes the SSO window', async () => {
    await openSheet();
    h.server.on('POST', '/Sso/Begin', { data: v4({ AuthorizeUrl: 'https://broker.resgrid.com/authorize', SsoTransactionId: 'sso-tx-2', ExpiresIn: 300 }) });
    __setNextAuthSessionResult({ type: 'cancel' });
    await expect(verifyStepUpSso()).resolves.toBe(false);
    expect(stepUpStore.getState().lastError).toBe('sso_cancelled');
    expect(h.server.requestsTo('POST', '/StepUp/Verify')).toHaveLength(0);
  });

  it('adopts the protected-data grant StepUp/Verify answers for the ADP reveal (adp purpose for approval and provider MFA)', async () => {
    h.server.on('GET', '/StepUp/Options', { data: options({ Area: 'protected_data' }) });
    const { verified: pending } = await openSheet(requirementFor({ area: 'protected_data' }));
    h.server.on('POST', '/MfaApproval/Request', { data: v4({ ApprovalRequestId: 'ap-3', MatchNumber: '9', ExpiresIn: 120 }) });
    h.server.on('POST', '/MfaApproval/Status', { data: v4({ State: 'approved', ExpiresAt: null }) });
    h.server.on('POST', '/StepUp/Verify', { data: verified('protected_data', 'passkey_approval', { GrantId: 'g-1', GrantToken: 'grant-token', GrantExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString() }) });
    await expect(startStepUpApproval(() => undefined)).resolves.toBe(true);
    await expect(pending).resolves.toBe(true);
    expect(h.server.requestsTo('POST', '/MfaApproval/Request')[0].body).toEqual({ Purpose: 'adp' });
    expect(getProtectedGrantHeaders()).toEqual({ 'X-Resgrid-Protected-Grant': 'grant-token' });
    expect(dataProtectionStore.getState().isPromptOpen).toBe(false);

    await openSheet(requirementFor({ area: 'protected_data' }));
    ssoBroker(h.server);
    await verifyStepUpProvider();
    expect(h.server.requestsTo('POST', '/Sso/Begin')[0].body).toMatchObject({ Purpose: 'adp_step_up' });
  });

  it('tells a member with nothing usable to enrol (canComplete false) and verifies nothing', async () => {
    h.server.on('GET', '/StepUp/Options', { data: options({ UsableMethods: [], MfaMethods: [], CanComplete: false, Passkey: null }) });
    const { verified: pending } = await openSheet(requirementFor({ usableMethods: [], mfaMethods: [], canComplete: false }));
    const state = stepUpStore.getState().pending;
    expect(state?.requirement.canComplete).toBe(false);
    expect(state?.options?.CanComplete).toBe(false);
    expect(offeredMethods(state?.requirement ?? requirementFor(), state?.options, true)).toEqual([]);
    cancelStepUp();
    await expect(pending).resolves.toBe(false);
  });

  it('throws StepUpCancelledError with the requirement when the member closes the sheet, and passes other failures through', async () => {
    const run = jest.fn<Promise<string>, []>().mockRejectedValue(refusal());
    const result = withStepUp(run);
    await flush(10);
    cancelStepUp();
    await expect(result).rejects.toBeInstanceOf(StepUpCancelledError);
    await expect(result).rejects.toMatchObject({ code: 'step_up_cancelled', area: 'acknowledgments', requirement: requirementFor() });
    expect(run).toHaveBeenCalledTimes(1);

    const other = new ApiError({ kind: 'http', status: 409 });
    await expect(withStepUp(() => Promise.reject(other))).rejects.toBe(other);
  });

  it('never reopens a sheet the member closed from a background replay, but does when the member asks again', async () => {
    const { verified: first } = await openSheet();
    cancelStepUp();
    await expect(first).resolves.toBe(false);
    expect(stepUpStore.getState().dismissedAreas).toEqual(['acknowledgments']);

    await expect(requestStepUp(requirementFor(), { interactive: false })).resolves.toBe(false);
    expect(stepUpStore.getState().pending).toBeNull();
    // Another area is not affected.
    void requestStepUp(requirementFor({ area: 'signatures' }), { interactive: false });
    expect(stepUpStore.getState().pending?.requirement.area).toBe('signatures');
    cancelStepUp();

    const { verified: asked } = await openSheet();
    expect(stepUpStore.getState().pending?.requirement.area).toBe('acknowledgments');
    h.server.on('POST', '/StepUp/Verify', { data: verified() });
    await verifyStepUpCode('123456');
    await expect(asked).resolves.toBe(true);
    expect(stepUpStore.getState().dismissedAreas).toEqual(['signatures']);
  });

  it('joins callers of the open area, queues another area behind it, and tells listeners what was verified', async () => {
    const heard: string[] = [];
    const stop = onStepUpVerified((area) => heard.push(area));
    const { verified: first } = await openSheet();
    const joined = requestStepUp(requirementFor());
    const later = requestStepUp(requirementFor({ area: 'signatures' }));
    expect(stepUpStore.getState().pending?.requirement.area).toBe('acknowledgments');

    h.server.on('POST', '/StepUp/Verify', { data: verified() });
    await verifyStepUpCode('123456');
    await expect(first).resolves.toBe(true);
    await expect(joined).resolves.toBe(true);
    expect(stepUpStore.getState().pending?.requirement.area).toBe('signatures');

    cancelStepUp();
    await expect(later).resolves.toBe(false);
    expect(heard).toEqual(['acknowledgments']);
    stop();
  });

  it('answers waiting callers false on sign-out and closes the sheet', async () => {
    const { verified: pending } = await openSheet();
    resetStepUp();
    await expect(pending).resolves.toBe(false);
    expect(stepUpStore.getState()).toMatchObject({ pending: null, dismissedAreas: [] });
  });

  it('says why when the options cannot be loaded for a sheet opened without methods', async () => {
    h.server.on('GET', '/StepUp/Options', { network: true });
    await openSheet(requirementFor({ area: 'protected_data', usableMethods: [], mfaMethods: [] }));
    await flush(50);
    expect(stepUpStore.getState()).toMatchObject({ lastError: 'network', pending: { options: null } });
  });
});
