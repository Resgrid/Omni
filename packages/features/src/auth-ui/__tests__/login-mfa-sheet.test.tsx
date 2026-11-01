/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run before imports, so they require their stand-ins. */
import '../../settings/__tests__/test-setup';

import type { MfaChallenge } from '@resgrid/auth';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { activateTestVariant } from '../../settings/__tests__/variant';
import { LoginMfaSheet } from '../mfa/login-mfa-sheet';
import { fakeAuthStore, resetFakeAuth } from './auth-fake';

jest.mock('@resgrid/auth', () => require('./auth-fake').buildAuthMock(jest.requireActual('@resgrid/auth')));

const challenge = (overrides: Partial<MfaChallenge> = {}): MfaChallenge => ({
  kind: 'verify',
  methods: ['totp', 'passkey', 'passkey_approval'],
  enrolled: ['totp', 'passkey'],
  preferred: 'totp',
  expiresAt: null,
  source: 'password',
  ...overrides,
});

const renderSheet = (value: MfaChallenge = challenge()) => {
  fakeAuthStore.setState({ status: 'mfaRequired', mfaChallenge: value });
  const onLostFactor = jest.fn();
  render(<LoginMfaSheet isOpen onLostFactor={onLostFactor} />);
  return { onLostFactor };
};

describe('LoginMfaSheet', () => {
  beforeEach(() => {
    resetFakeAuth();
    activateTestVariant('responder');
  });

  it('offers only the accepted methods the member has enrolled', () => {
    renderSheet();
    expect(screen.getByTestId('login-mfa-code')).toBeTruthy();
    expect(screen.getByTestId('login-mfa-passkey')).toBeTruthy();
    // passkey_approval is accepted by the sign-in but not enrolled by the member.
    expect(screen.queryByTestId('login-mfa-approval')).toBeNull();
  });

  it('hides passkeys where the variant has none', () => {
    activateTestVariant('bigboard');
    renderSheet();
    expect(screen.queryByTestId('login-mfa-passkey')).toBeNull();
  });

  it('verifies the authenticator code and clears it', async () => {
    renderSheet();
    fireEvent.changeText(screen.getByTestId('login-mfa-code'), ' 123456 ');
    fireEvent.press(screen.getByTestId('login-mfa-submit'));
    await waitFor(() => expect(fakeAuthStore.getState().verifyLoginMfa).toHaveBeenCalledWith({ method: 'totp', code: '123456' }));
    expect(screen.getByTestId('login-mfa-code').props.value).toBe('');
  });

  it('shows a refusal in the member language and stops the spinner', async () => {
    fakeAuthStore.getState().verifyLoginMfa.mockResolvedValueOnce({ ok: false, code: 'invalid_totp', restart: false });
    renderSheet();
    fireEvent.changeText(screen.getByTestId('login-mfa-code'), '000000');
    fireEvent.press(screen.getByTestId('login-mfa-submit'));
    expect(await screen.findByText('mfa.errors.invalid_totp')).toBeTruthy();
    expect(screen.getByText('mfa.login.verify')).toBeTruthy();
  });

  it('never leaves the spinner running when a step throws (try/finally)', async () => {
    fakeAuthStore.getState().verifyLoginMfa.mockRejectedValueOnce(new Error('boom'));
    renderSheet();
    fireEvent.press(screen.getByTestId('login-mfa-passkey'));
    expect(await screen.findByText('mfa.errors.unknown_error')).toBeTruthy();
    expect(screen.getByTestId('login-mfa-passkey')).not.toBeDisabled();
  });

  it('switches to a recovery code and sends it as one', async () => {
    renderSheet();
    fireEvent.press(screen.getByTestId('login-mfa-recovery-toggle'));
    fireEvent.changeText(screen.getByTestId('login-mfa-code'), 'abcd-efgh');
    fireEvent.press(screen.getByTestId('login-mfa-submit'));
    await waitFor(() => expect(fakeAuthStore.getState().verifyLoginMfa).toHaveBeenCalledWith({ method: 'recovery_code', code: 'abcd-efgh' }));
  });

  it('cancels the sign-in, dropping the transaction', () => {
    renderSheet();
    fireEvent.press(screen.getByTestId('login-mfa-cancel'));
    expect(fakeAuthStore.getState().cancelLoginMfa).toHaveBeenCalledTimes(1);
  });

  it('offers the lost-authenticator recovery', () => {
    const { onLostFactor } = renderSheet();
    fireEvent.press(screen.getByTestId('login-mfa-lost'));
    expect(onLostFactor).toHaveBeenCalled();
  });

  it('waits for an approval in Responder, showing the number, then completes with it', async () => {
    let decide: (value: string) => void = () => undefined;
    const state = fakeAuthStore.getState();
    state.requestLoginApproval.mockResolvedValue({ ApprovalRequestId: 'req-1', MatchNumber: '42', ExpiresIn: 120 });
    state.waitForLoginApproval.mockImplementation(() => new Promise((resolve) => (decide = resolve)));
    renderSheet(challenge({ methods: ['passkey_approval'], enrolled: ['passkey_approval'], preferred: null }));

    fireEvent.press(screen.getByTestId('login-mfa-approval'));
    expect(await screen.findByTestId('mfa-approval-number')).toHaveTextContent('42');

    await act(async () => decide('approved'));
    await waitFor(() => expect(state.verifyLoginMfa).toHaveBeenCalledWith({ method: 'passkey_approval', approvalRequestId: 'req-1' }));
    expect(screen.queryByTestId('mfa-approval-panel')).toBeNull();
  });

  it('reports a denied approval', async () => {
    const state = fakeAuthStore.getState();
    state.requestLoginApproval.mockResolvedValue({ ApprovalRequestId: 'req-1', MatchNumber: '42', ExpiresIn: 120 });
    state.waitForLoginApproval.mockResolvedValue('denied');
    renderSheet(challenge({ methods: ['passkey_approval'], enrolled: [], preferred: null }));
    fireEvent.press(screen.getByTestId('login-mfa-approval'));
    expect(await screen.findByText('mfa.errors.approval_denied')).toBeTruthy();
    expect(state.verifyLoginMfa).not.toHaveBeenCalled();
  });

  it('sets up the authenticator a department requires', async () => {
    renderSheet(challenge({ kind: 'setup', methods: ['totp'], enrolled: [], preferred: null }));
    expect(await screen.findByTestId('mfa-setup-shared-key')).toHaveTextContent('ABCD EFGH');
    fireEvent.changeText(screen.getByTestId('login-mfa-code'), '654321');
    fireEvent.press(screen.getByTestId('login-mfa-submit'));
    await waitFor(() => expect(fakeAuthStore.getState().verifyLoginMfa).toHaveBeenCalledWith({ method: 'setup', code: '654321' }));
    expect(screen.queryByTestId('login-mfa-lost')).toBeNull();
  });
});
