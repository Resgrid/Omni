import { abandonFactorRecovery, finishFactorRecovery, hasLoginTransaction, recoveryReplacementKey } from '../mfa/login-mfa';
import { refreshEngine, useAuthStore } from '../session/auth-store';
import { saveSharedInstallation } from '../session/shared-installation';
import { __resetWebBrowserFake, __setNextAuthSessionResult, calls as browserCalls } from './fakes/expo-web-browser';
import { __setPasskeyOutcome } from './fakes/react-native-passkey';
import { v4 } from './helpers/fake-server';
import { flush, type Harness, setupHarness } from './helpers/harness';
import { tokenResponse } from './helpers/jwt';

const completion = (overrides: Record<string, unknown> = {}) => v4({ CompletionCode: 'completion-1', ExpiresIn: 60, Recovery: false, RecoveryCodes: null, ...overrides });

const startTransaction = async (h: Harness): Promise<void> => {
  h.server.once('POST', '/connect/token', {
    status: 400,
    data: { error: 'mfa_required', mfa_transaction: 'tx-1', mfa_methods: 'totp passkey passkey_approval federated', mfa_enrolled: 'totp passkey', mfa_expires_in: 300 },
  });
  await useAuthStore.getState().login({ username: 'member', password: 'secret' });
  expect(useAuthStore.getState().status).toBe('mfaRequired');
};

describe('finishing a sign-in on the login transaction', () => {
  let h: Harness;
  beforeEach(async () => {
    h = setupHarness('unit');
    __resetWebBrowserFake();
    await startTransaction(h);
  });
  afterEach(() => refreshEngine.endSession());

  it('refuses without a transaction and sends the member back to the start', async () => {
    useAuthStore.getState().cancelLoginMfa();
    await expect(useAuthStore.getState().verifyLoginMfa({ method: 'totp', code: '123456' })).resolves.toEqual({ ok: false, code: 'mfa_transaction_invalid', restart: true });
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', error: 'mfa_transaction_invalid' });
  });

  it('signs in with a code, spends the completion once (with the client id), and forgets the transaction', async () => {
    h.server.on('POST', '/Authentication/CompleteTotp', { data: completion() });
    h.server.on('POST', '/connect/token', { data: tokenResponse() });
    await expect(useAuthStore.getState().verifyLoginMfa({ method: 'totp', code: ' 123456 ' })).resolves.toEqual({ ok: true, recovery: false });

    const [step] = h.server.requestsTo('POST', '/Authentication/CompleteTotp');
    expect(step.body).toEqual({ Transaction: 'tx-1', Code: '123456' });
    expect(step.headers.Authorization).toBeUndefined();
    expect(step.headers['X-Resgrid-Client']).toBe('unit');
    const grant = h.server.requestsTo('POST', '/connect/token')[1];
    expect(grant.body).toMatchObject({ grant_type: 'urn:resgrid:params:oauth:grant-type:mfa_completion', transaction: 'tx-1', completion_code: 'completion-1', client_id: 'unit' });
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', mfaChallenge: null });
    expect(hasLoginTransaction()).toBe(false);
  });

  it('keeps the sign-in open after a wrong code, and ends it when the server says it is over', async () => {
    h.server.once('POST', '/Authentication/CompleteTotp', { status: 400, data: { type: 'invalid_totp' } });
    await expect(useAuthStore.getState().verifyLoginMfa({ method: 'totp', code: '000000' })).resolves.toEqual({ ok: false, code: 'invalid_totp', restart: false });
    expect(useAuthStore.getState().status).toBe('mfaRequired');

    h.server.once('POST', '/Authentication/CompleteTotp', { status: 400, data: { type: 'too_many_attempts' } });
    await expect(useAuthStore.getState().verifyLoginMfa({ method: 'totp', code: '000000' })).resolves.toEqual({ ok: false, code: 'too_many_attempts', restart: true });
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', error: 'too_many_attempts', mfaChallenge: null });
    expect(hasLoginTransaction()).toBe(false);
  });

  it('restarts as mfa_transaction_invalid when the token endpoint refuses the completion with a code the app has no message for (Unit)', async () => {
    h.server.on('POST', '/Authentication/CompleteTotp', { data: completion() });
    h.server.on('POST', '/connect/token', { status: 400, data: { error: 'invalid_grant' } });
    await expect(useAuthStore.getState().verifyLoginMfa({ method: 'totp', code: '123456' })).resolves.toEqual({ ok: false, code: 'mfa_transaction_invalid', restart: true });
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', error: 'mfa_transaction_invalid' });
  });

  it('keeps a known refusal code from the completion grant', async () => {
    h.server.on('POST', '/Authentication/CompleteTotp', { data: completion() });
    h.server.on('POST', '/connect/token', { status: 400, data: { error: 'policy_changed' } });
    await expect(useAuthStore.getState().verifyLoginMfa({ method: 'totp', code: '123456' })).resolves.toEqual({ ok: false, code: 'policy_changed', restart: true });
  });

  it('ends the sign-in (no stuck spinner) when the tokens cannot be used (Responder)', async () => {
    h.server.on('POST', '/Authentication/CompleteTotp', { data: completion() });
    h.server.on('POST', '/connect/token', { data: tokenResponse({ id_token: null }) });
    await expect(useAuthStore.getState().verifyLoginMfa({ method: 'totp', code: '123456' })).resolves.toEqual({ ok: false, code: 'unknown_error', restart: true });
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', accessToken: null });
  });

  it('does not sign in when the member cancels while the completion grant is in flight (Dispatch abandoned check)', async () => {
    let release: () => void = () => undefined;
    h.server.on('POST', '/Authentication/CompleteTotp', { data: completion() });
    h.server.on('POST', '/connect/token', () => new Promise((resolve) => (release = () => resolve({ data: tokenResponse() }))));
    const pending = useAuthStore.getState().verifyLoginMfa({ method: 'totp', code: '123456' });
    await flush(20);
    useAuthStore.getState().cancelLoginMfa();
    release();
    await expect(pending).resolves.toEqual({ ok: false, code: 'mfa_transaction_invalid', restart: false });
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', accessToken: null });
  });

  it('does not spend the completion when the member cancels while the second factor is in flight', async () => {
    let release: () => void = () => undefined;
    h.server.on('POST', '/Authentication/CompleteTotp', () => new Promise((resolve) => (release = () => resolve({ data: completion() }))));
    const pending = useAuthStore.getState().verifyLoginMfa({ method: 'totp', code: '123456' });
    await flush(20);
    useAuthStore.getState().cancelLoginMfa();
    release();
    await expect(pending).resolves.toMatchObject({ ok: false, restart: false });
    expect(h.server.requestsTo('POST', '/connect/token')).toHaveLength(1);
  });

  it('finishes setting up the required authenticator and hands the recovery codes over once', async () => {
    h.server.on('POST', '/Authentication/CompleteTotpSetup', { data: completion({ RecoveryCodes: ['a', 'b'] }) });
    h.server.on('POST', '/connect/token', { data: tokenResponse() });
    await expect(useAuthStore.getState().verifyLoginMfa({ method: 'setup', code: '123456' })).resolves.toEqual({ ok: true, recovery: false });
    expect(useAuthStore.getState().pendingRecoveryCodes).toEqual(['a', 'b']);
    useAuthStore.getState().dismissRecoveryCodes();
    expect(useAuthStore.getState().pendingRecoveryCodes).toBeNull();
  });

  it('runs a passkey prompt for this sign-in; a closed prompt is not a failure', async () => {
    h.server.on('POST', '/Authentication/PasskeyOptions', { data: v4({ RequestId: 'req-1', Options: { challenge: 'abc', rpId: 'unit.resgrid.com' } }) });
    __setPasskeyOutcome({ ok: false, error: { error: 'UserCancelled' } });
    await expect(useAuthStore.getState().verifyLoginMfa({ method: 'passkey' })).resolves.toEqual({ ok: false, code: 'passkey_cancelled', restart: false });
    expect(useAuthStore.getState().status).toBe('mfaRequired');

    __setPasskeyOutcome({ ok: true, value: { id: 'cred', response: { authenticatorData: 'ad', clientDataJSON: 'cd', signature: 'sig' } } });
    h.server.on('POST', '/Authentication/CompletePasskey', { data: completion() });
    h.server.on('POST', '/connect/token', { data: tokenResponse() });
    await expect(useAuthStore.getState().verifyLoginMfa({ method: 'passkey' })).resolves.toEqual({ ok: true, recovery: false });
    expect(h.server.requestsTo('POST', '/Authentication/CompletePasskey')[0].body).toMatchObject({ Transaction: 'tx-1', RequestId: 'req-1', Credential: { id: 'cred', rawId: 'cred' } });
  });

  it("refuses a passkey for a relying party outside the variant's associated domains (self-hosted server)", async () => {
    h.server.on('POST', '/Authentication/PasskeyOptions', { data: v4({ RequestId: 'req-1', Options: { challenge: 'abc', rpId: 'resgrid.example.org' } }) });
    __setPasskeyOutcome({ ok: true, value: { id: 'cred', response: {} } });
    await expect(useAuthStore.getState().verifyLoginMfa({ method: 'passkey' })).resolves.toEqual({ ok: false, code: 'passkey_not_supported', restart: false });
  });

  it('runs the provider step-up for this sign-in and redeems it with this round trip only', async () => {
    h.server.on('POST', '/Sso/Begin', { data: v4({ AuthorizeUrl: 'https://broker.example/authorize', SsoTransactionId: 'sso-1', ExpiresIn: 300 }) });
    __setNextAuthSessionResult((_url, returnUrl) => {
      const state = h.server.requestsTo('POST', '/Sso/Begin')[0].body.State as string;
      return { type: 'success', url: `${returnUrl}?sso_code=code-1&state=${state}` };
    });
    h.server.on('POST', '/Authentication/CompleteFederated', { data: completion() });
    h.server.on('POST', '/connect/token', { data: tokenResponse() });

    await expect(useAuthStore.getState().verifyLoginMfa({ method: 'federated' })).resolves.toEqual({ ok: true, recovery: false });
    const begin = h.server.requestsTo('POST', '/Sso/Begin')[0];
    expect(begin.body).toMatchObject({ Purpose: 'step_up', Transaction: 'tx-1', ReturnTarget: 'resgridunit://sso-return', CodeChallengeMethod: 'S256' });
    const federated = h.server.requestsTo('POST', '/Authentication/CompleteFederated')[0].body;
    expect(federated).toMatchObject({ Transaction: 'tx-1', SsoTransactionId: 'sso-1', SsoCode: 'code-1' });
    expect(typeof federated.CodeVerifier).toBe('string');
  });

  it('asks Responder to approve this sign-in and finishes with the approved request', async () => {
    h.server.on('POST', '/MfaApproval/Request', { data: v4({ ApprovalRequestId: 'ap-1', MatchNumber: '42', ExpiresIn: 120 }) });
    await expect(useAuthStore.getState().requestLoginApproval()).resolves.toEqual({ ApprovalRequestId: 'ap-1', MatchNumber: '42', ExpiresIn: 120 });
    expect(h.server.requestsTo('POST', '/MfaApproval/Request')[0].body).toEqual({ Purpose: 'login', Transaction: 'tx-1' });

    h.server.on('POST', '/MfaApproval/Status', { data: v4({ State: 'approved', ExpiresAt: null }) });
    await expect(useAuthStore.getState().waitForLoginApproval('ap-1')).resolves.toBe('approved');

    h.server.on('POST', '/Authentication/CompleteApproval', { data: completion() });
    h.server.on('POST', '/connect/token', { data: tokenResponse() });
    await expect(useAuthStore.getState().verifyLoginMfa({ method: 'passkey_approval', approvalRequestId: 'ap-1' })).resolves.toEqual({ ok: true, recovery: false });
  });

  it('sends the member back to the start when the sign-in itself ends while Responder is deciding', async () => {
    h.server.on('POST', '/MfaApproval/Status', { status: 400, data: { type: 'mfa_transaction_expired' } });
    await expect(useAuthStore.getState().waitForLoginApproval('ap-1')).resolves.toBe('unavailable');
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', error: 'mfa_transaction_expired' });
  });

  it('keeps the sign-in when a status check fails for another reason', async () => {
    h.server.on('POST', '/MfaApproval/Status', { network: true });
    await expect(useAuthStore.getState().waitForLoginApproval('ap-1')).resolves.toBe('unavailable');
    expect(useAuthStore.getState().status).toBe('mfaRequired');
  });
});

describe('brokered single sign-on (preferred SSO path)', () => {
  let h: Harness;
  beforeEach(() => {
    h = setupHarness('dispatch');
    __resetWebBrowserFake();
    h.server.on('POST', '/Sso/Begin', { data: v4({ AuthorizeUrl: 'https://broker.example/authorize', SsoTransactionId: 'sso-1', ExpiresIn: 300 }) });
    __setNextAuthSessionResult((_url, returnUrl) => {
      const state = h.server.requestsTo('POST', '/Sso/Begin').slice(-1)[0].body.State as string;
      return { type: 'success', url: `${returnUrl}?sso_code=code-1&state=${state}` };
    });
  });
  afterEach(() => refreshEngine.endSession());

  it('signs in directly when the provider sign-in needs no second factor, returning to the manifest scheme', async () => {
    h.server.on('POST', '/Sso/Redeem', {
      data: v4({ Outcome: 'completed', Transaction: 'tx-sso', CompletionCode: 'cc', ExpiresIn: 60, MfaMethods: null, MfaEnrolled: null, MfaPreferred: null, MfaSatisfiedBy: null, VerifiedAt: null }),
    });
    h.server.on('POST', '/connect/token', { data: tokenResponse() });
    await expect(useAuthStore.getState().loginWithBrokeredSso({ departmentToken: 'dept-token' })).resolves.toEqual({ outcome: 'signed_in' });

    const begin = h.server.requestsTo('POST', '/Sso/Begin')[0];
    expect(begin.body).toMatchObject({ Purpose: 'login', DepartmentToken: 'dept-token', ReturnTarget: 'resgriddispatch://sso-return', CodeChallengeMethod: 'S256' });
    expect(begin.headers.Authorization).toBeUndefined();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', authMethod: 'sso' });
  });

  it('continues on the transaction the redemption started, with the methods as arrays', async () => {
    h.server.on('POST', '/Sso/Redeem', {
      data: v4({
        Outcome: 'mfa_required',
        Transaction: 'tx-sso',
        CompletionCode: null,
        ExpiresIn: 300,
        MfaMethods: ['totp', 'passkey'],
        MfaEnrolled: ['totp'],
        MfaPreferred: 'totp',
        MfaSatisfiedBy: null,
        VerifiedAt: null,
      }),
    });
    const result = await useAuthStore.getState().loginWithBrokeredSso({ departmentCode: 'ABC' });
    expect(result).toMatchObject({ outcome: 'challenge', challenge: { kind: 'verify', methods: ['totp', 'passkey'], enrolled: ['totp'], source: 'sso' } });
    expect(useAuthStore.getState().status).toBe('mfaRequired');
    expect(hasLoginTransaction()).toBe(true);
  });

  it('continues as the setup transaction when the department requires MFA the account does not have', async () => {
    h.server.on('POST', '/Sso/Redeem', { status: 400, data: { type: 'mfa_enrollment_required', mfa_setup_transaction: 'setup-1', mfa_expires_in: 300 } });
    const result = await useAuthStore.getState().loginWithBrokeredSso({ departmentCode: 'ABC' });
    expect(result).toMatchObject({ outcome: 'challenge', challenge: { kind: 'setup', methods: ['totp'], source: 'sso' } });
  });

  it('reports a closed browser as cancelled, a state mismatch and a refusal by code', async () => {
    __setNextAuthSessionResult({ type: 'cancel' });
    await expect(useAuthStore.getState().loginWithBrokeredSso({ departmentCode: 'ABC' })).resolves.toEqual({ outcome: 'cancelled' });
    expect(useAuthStore.getState().status).toBe('signedOut');

    __setNextAuthSessionResult({ type: 'success', url: 'resgriddispatch://sso-return?sso_code=x&state=forged' });
    await expect(useAuthStore.getState().loginWithBrokeredSso({ departmentCode: 'ABC' })).resolves.toEqual({ outcome: 'failed', code: 'sso_state_mismatch' });

    h.server.on('POST', '/Sso/Begin', { status: 400, data: { type: 'sso_unavailable' } });
    await expect(useAuthStore.getState().loginWithBrokeredSso({ departmentCode: 'ABC' })).resolves.toEqual({ outcome: 'failed', code: 'sso_unavailable' });
    expect(useAuthStore.getState()).toMatchObject({ status: 'error', error: 'sso_unavailable' });
  });

  it('runs a shared installation in an ephemeral browser session', async () => {
    saveSharedInstallation({ shared: true, label: 'Dispatch 3' });
    __setNextAuthSessionResult({ type: 'cancel' });
    await useAuthStore.getState().loginWithBrokeredSso({ departmentCode: 'ABC' });
    expect(browserCalls[0].options).toEqual({ preferEphemeralSession: true });
    expect(h.server.requestsTo('POST', '/Sso/Begin')[0].headers['X-Resgrid-Shared-Installation']).toBe('true');
  });
});

describe('"I lost my authenticator"', () => {
  let h: Harness;
  beforeEach(async () => {
    h = setupHarness('unit');
    await startTransaction(h);
  });

  it('spends a recovery code on the sign-in, replaces the authenticator, and hands the new codes over once', async () => {
    h.server.on('POST', '/AccountSecurity/BeginFactorRecovery', { data: v4({ Transaction: 'rec-1', State: 'pending', ExpiresIn: 600, NextActions: null, Passkeys: [] }) });
    await expect(useAuthStore.getState().beginFactorRecovery(' code-1 ')).resolves.toMatchObject({ passkeys: [] });
    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(hasLoginTransaction()).toBe(false);

    h.server.on('POST', '/AccountSecurity/PrepareReplacement', { data: v4({ SharedKey: 'KEY', AuthenticatorUri: 'otpauth://x', ExpiresIn: 600 }) });
    await expect(recoveryReplacementKey()).resolves.toMatchObject({ SharedKey: 'KEY' });

    h.server.on('POST', '/AccountSecurity/CompleteFactorRecovery', { data: v4({ RecoveryCodes: ['n1', 'n2'], SignInAgain: true }) });
    await expect(finishFactorRecovery('123456', [])).resolves.toEqual({ recoveryCodes: ['n1', 'n2'] });
    expect(h.server.requestsTo('POST', '/AccountSecurity/CompleteFactorRecovery')[0].body).toEqual({ Transaction: 'rec-1', Code: '123456', RemovePasskeyIds: [] });
  });

  it('keeps the recovery open after a wrong code, and cancels it on request', async () => {
    h.server.on('POST', '/AccountSecurity/BeginFactorRecovery', { data: v4({ Transaction: 'rec-1', State: 'pending', ExpiresIn: 600, NextActions: null, Passkeys: null }) });
    await useAuthStore.getState().beginFactorRecovery('code-1');
    h.server.on('POST', '/AccountSecurity/CompleteFactorRecovery', { status: 400, data: { type: 'invalid_totp' } });
    await expect(finishFactorRecovery('000000', [])).resolves.toEqual({ code: 'invalid_totp', ended: false });

    h.server.on('POST', '/AccountSecurity/CancelFactorRecovery', { data: v4({ Transaction: null, State: 'canceled', ExpiresIn: 0, NextActions: null, Passkeys: null }) });
    await abandonFactorRecovery();
    expect(h.server.requestsTo('POST', '/AccountSecurity/CancelFactorRecovery')).toHaveLength(1);
    await expect(finishFactorRecovery('123456', [])).resolves.toEqual({ code: 'recovery_transaction_invalid', ended: true });
  });
});
