/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run before imports, so they require their stand-ins. */
import '../../settings/__tests__/test-setup';

import { createMemoryKvBackend, DurableKv } from '@resgrid/offline';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import { activateTestVariant } from '../../settings/__tests__/variant';
import { setDevicePreferencesKv } from '../lib/device-kv';
import { LoginScreen } from '../screens/login-screen';
import { fakeAuthStore, fakeInstallation, resetFakeAuth } from './auth-fake';

jest.mock('@resgrid/auth', () => require('./auth-fake').buildAuthMock(jest.requireActual('@resgrid/auth')));
jest.mock('../lib/api-context', () => ({ authUiApi: () => ({}), hasAuthUiApi: () => false }));

const fillAndSubmit = async (username = 'jdoe', password = 'secret') => {
  await fireEvent.changeText(screen.getByTestId('login-username'), username);
  await fireEvent.changeText(screen.getByTestId('login-password'), password);
  await fireEvent.press(screen.getByTestId('login-submit'));
  await waitFor(() => expect(fakeAuthStore.getState().login).toHaveBeenCalled());
};

describe('LoginScreen', () => {
  let kv: DurableKv;

  beforeEach(() => {
    resetFakeAuth();
    activateTestVariant('responder');
    kv = new DurableKv(createMemoryKvBackend('test'));
    setDevicePreferencesKv(kv);
  });

  afterEach(() => setDevicePreferencesKv(undefined));

  it('labels the inputs and the submit button for assistive technology', async () => {
    await render(<LoginScreen />);
    expect(screen.getByLabelText('login.username')).toBeTruthy();
    expect(screen.getByLabelText('login.password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'login.login_button' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'login.show_password' })).toBeTruthy();
  });

  it('signs in with the trimmed credentials and replaces the navigation with the home route (never push)', async () => {
    await render(<LoginScreen />);
    await fillAndSubmit('  jdoe ', 'secret');
    expect(fakeAuthStore.getState().login).toHaveBeenCalledWith({ username: 'jdoe', password: 'secret' });

    await act(() => fakeAuthStore.setState({ status: 'signedIn', accessToken: 'token' }));

    expect(router.replace).toHaveBeenCalledWith('/home');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('hands a completed sign-in to ShellGate when it passes onSignedIn', async () => {
    const onSignedIn = jest.fn();
    fakeAuthStore.setState({ status: 'signedIn', accessToken: 'token' });
    await render(<LoginScreen onSignedIn={onSignedIn} />);
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('requires a username and password before calling the server', async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText('login.username_required')).toBeTruthy();
    expect(screen.getByText('login.password_required')).toBeTruthy();
    expect(fakeAuthStore.getState().login).not.toHaveBeenCalled();
  });

  it('explains a refused sign-in from the server login_error, naming the server', async () => {
    fakeAuthStore.setState({ status: 'error', error: 'account_locked_out', loginFailure: { code: 'account_locked_out', lockoutMinutes: 5 } });
    await render(<LoginScreen />);
    expect(screen.getByText('login.errors.account_locked_out.title')).toBeTruthy();
    expect(screen.getAllByText('login.errors.account_locked_out.message [minutes=5,server=login.server.us_west]').length).toBeGreaterThan(0);
  });

  it('says an administrator must lift a lockout without an end', async () => {
    fakeAuthStore.setState({ status: 'error', error: 'account_locked_out', loginFailure: { code: 'account_locked_out' } });
    await render(<LoginScreen />);
    expect(screen.getByText('login.errors.account_locked.title')).toBeTruthy();
  });

  it('falls back to the generic message for an unknown error and never shows its text', async () => {
    fakeAuthStore.setState({ status: 'error', error: 'TypeError: cannot read token of undefined' });
    await render(<LoginScreen />);
    expect(screen.getAllByText('login.errorModal.message').length).toBeGreaterThan(0);
    expect(screen.queryByText(/TypeError/)).toBeNull();
  });

  it('explains an ended shared shift and an ended MFA transaction', async () => {
    fakeAuthStore.setState({ status: 'error', error: 'shift_ended' });
    const { unmount } = await render(<LoginScreen />);
    expect(screen.getAllByText('shared_session.shift_ended').length).toBeGreaterThan(0);
    await unmount();

    fakeAuthStore.setState({ status: 'error', error: 'mfa_transaction_expired' });
    await render(<LoginScreen />);
    expect(screen.getAllByText('mfa.errors.mfa_transaction_expired').length).toBeGreaterThan(0);
  });

  it('dismisses the error dialog', async () => {
    fakeAuthStore.setState({ status: 'error', error: 'invalid_credentials', loginFailure: { code: 'invalid_credentials' } });
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-error-dialog-confirm'));
    expect(screen.queryByTestId('login-error-dialog-message')).toBeNull();
  });

  it('offers the shared-device entry only where the variant has shared devices', async () => {
    const { unmount } = await render(<LoginScreen />);
    expect(screen.queryByTestId('login-shared-device')).toBeNull();
    await unmount();

    activateTestVariant('unit');
    fakeInstallation.set({ configured: true, shared: true, label: 'Engine 12' });
    await render(<LoginScreen />);
    expect(screen.getByTestId('login-shared-device')).toBeTruthy();
    expect(screen.getByText('shared_session.device_on_label [label=Engine 12]')).toBeTruthy();
  });

  it('opens the shared-device setup in place and saves it', async () => {
    activateTestVariant('unit');
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-shared-device'));
    await fireEvent.changeText(screen.getByTestId('shared-device-label'), 'Engine 12');
    await fireEvent.press(screen.getByTestId('shared-device-save'));
    expect(fakeInstallation.get()).toEqual({ configured: true, shared: true, label: 'Engine 12' });
    expect(screen.getByTestId('login-submit')).toBeTruthy();
  });

  it('prompts for the authenticator code on a server without the login transaction and resends with it', async () => {
    await render(<LoginScreen />);
    await fillAndSubmit();
    await act(() => fakeAuthStore.setState({ status: 'mfaRequired', mfaChallenge: { kind: 'legacy', methods: ['totp'], enrolled: ['totp'], preferred: 'totp', expiresAt: null, source: 'password' } }));

    await fireEvent.changeText(screen.getByTestId('login-otp-code'), '123456');
    await fireEvent.press(screen.getByTestId('login-otp-submit'));

    expect(fakeAuthStore.getState().login).toHaveBeenLastCalledWith({ username: 'jdoe', password: 'secret', otpCode: '123456' });
  });

  it('opens factor recovery in place from the MFA sheet', async () => {
    fakeAuthStore.setState({ status: 'mfaRequired', mfaChallenge: { kind: 'verify', methods: ['totp'], enrolled: ['totp'], preferred: 'totp', expiresAt: null, source: 'password' } });
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-mfa-lost'));
    expect(screen.getByTestId('factor-recovery')).toBeTruthy();
  });

  it('switches the language and saves it under the legacy key', async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-language-trigger'));
    await fireEvent.press(screen.getByTestId('login-language-sheet-option-de'));
    return waitFor(() => expect(kv.getString('local')).toBe('de'));
  });
});
