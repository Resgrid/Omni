/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run before imports, so they require their stand-ins. */
import '../../settings/__tests__/test-setup';

import { type DepartmentSsoConfig, fetchSsoConfigForUser, startSamlSignIn, useOidcLogin } from '@resgrid/auth';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { activateTestVariant } from '../../settings/__tests__/variant';
import { SsoSignIn } from '../components/sso-sign-in';
import { fakeAuthStore, fakeInstallation, resetFakeAuth } from './auth-fake';

jest.mock('@resgrid/auth', () => require('./auth-fake').buildAuthMock(jest.requireActual('@resgrid/auth')));
jest.mock('../lib/api-context', () => ({ authUiApi: () => ({}), hasAuthUiApi: () => false }));

const mockLookup = fetchSsoConfigForUser as jest.Mock;

const config = (overrides: Partial<DepartmentSsoConfig> = {}): DepartmentSsoConfig => ({
  ssoEnabled: true,
  providerType: 'oidc',
  authority: 'https://idp.example.org',
  clientId: 'client',
  metadataUrl: null,
  entityId: null,
  samlLoginUrl: null,
  allowLocalLogin: true,
  requireSso: false,
  requireMfa: false,
  oidcRedirectUri: '',
  oidcScopes: '',
  departmentCode: null,
  departmentName: 'Station 1',
  departmentId: 7,
  departmentToken: 'dept-token',
  brokeredSsoAvailable: true,
  ...overrides,
});

const lookUp = async (username = 'jdoe') => {
  fireEvent.changeText(screen.getByTestId('sso-username'), username);
  fireEvent.press(screen.getByTestId('sso-continue'));
  await waitFor(() => expect(mockLookup).toHaveBeenCalled());
};

describe('SsoSignIn', () => {
  beforeEach(() => {
    resetFakeAuth();
    activateTestVariant('responder');
  });

  it('requires a username and a numeric department id', async () => {
    render(<SsoSignIn onBack={jest.fn()} />);
    fireEvent.changeText(screen.getByTestId('sso-department-id'), 'abc');
    fireEvent.press(screen.getByTestId('sso-continue'));
    expect(await screen.findByText('login.sso.username_required')).toBeTruthy();
    expect(screen.getByText('login.sso.department_id_invalid')).toBeTruthy();
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('says when the account is unknown, has no SSO, or the lookup failed', async () => {
    mockLookup.mockResolvedValueOnce({ config: null, userExists: false, failed: false });
    render(<SsoSignIn onBack={jest.fn()} />);
    await lookUp();
    expect(await screen.findByText('login.sso.user_not_found')).toBeTruthy();

    mockLookup.mockResolvedValueOnce({ config: config({ ssoEnabled: false }), userExists: true, failed: false });
    fireEvent.press(screen.getByTestId('sso-continue'));
    expect(await screen.findByText('login.sso.sso_not_enabled')).toBeTruthy();

    mockLookup.mockResolvedValueOnce({ config: null, userExists: false, failed: true });
    fireEvent.press(screen.getByTestId('sso-continue'));
    expect(await screen.findByText('login.sso.lookup_network_error')).toBeTruthy();
  });

  it('uses the brokered sign-in when the variant and the department have the broker', async () => {
    fakeInstallation.set({ configured: true, shared: true, label: null });
    mockLookup.mockResolvedValueOnce({ config: config(), userExists: true, failed: false });
    render(<SsoSignIn onBack={jest.fn()} />);
    await lookUp();
    fireEvent.press(await screen.findByTestId('sso-brokered'));
    await waitFor(() => expect(fakeAuthStore.getState().loginWithBrokeredSso).toHaveBeenCalledWith({ departmentToken: 'dept-token' }, { ephemeral: true }));
    expect(screen.queryByTestId('sso-oidc')).toBeNull();
  });

  it('shows a failed brokered sign-in in the member language', async () => {
    fakeAuthStore.getState().loginWithBrokeredSso.mockResolvedValueOnce({ outcome: 'failed', code: 'sso_denied' });
    mockLookup.mockResolvedValueOnce({ config: config(), userExists: true, failed: false });
    render(<SsoSignIn onBack={jest.fn()} />);
    await lookUp();
    fireEvent.press(await screen.findByTestId('sso-brokered'));
    expect(await screen.findByText('mfa.errors.sso_denied')).toBeTruthy();
  });

  it('falls back to the app-side OIDC flow when the variant has no brokered SSO', async () => {
    activateTestVariant('responder', { auth: { brokeredSso: false } });
    const promptAsync = jest.fn(async () => ({ type: 'dismiss' }));
    (useOidcLogin as jest.Mock).mockReturnValue({ request: {}, response: null, ready: true, promptAsync, completeSignIn: jest.fn(), signInOnDesktop: jest.fn() });
    mockLookup.mockResolvedValueOnce({ config: config(), userExists: true, failed: false });
    render(<SsoSignIn onBack={jest.fn()} />);
    await lookUp();
    expect(screen.queryByTestId('sso-brokered')).toBeNull();
    fireEvent.press(await screen.findByTestId('sso-oidc'));
    await waitFor(() => expect(promptAsync).toHaveBeenCalled());
    expect(fakeAuthStore.getState().loginWithBrokeredSso).not.toHaveBeenCalled();
  });

  it('starts SAML from the server page when the department uses SAML without the broker', async () => {
    mockLookup.mockResolvedValueOnce({ config: config({ providerType: 'saml2', brokeredSsoAvailable: false, samlLoginUrl: 'https://api.resgrid.com/saml/start' }), userExists: true, failed: false });
    render(<SsoSignIn onBack={jest.fn()} />);
    await lookUp();
    fireEvent.press(await screen.findByTestId('sso-saml'));
    await waitFor(() => expect(startSamlSignIn).toHaveBeenCalledWith('https://api.resgrid.com/saml/start', 'dept-token'));
  });

  it('hides the password way back when the department requires SSO', async () => {
    mockLookup.mockResolvedValueOnce({ config: config({ allowLocalLogin: false }), userExists: true, failed: false });
    render(<SsoSignIn onBack={jest.fn()} />);
    await lookUp();
    await screen.findByTestId('sso-providers');
    expect(screen.queryByTestId('sso-password')).toBeNull();
    fireEvent.press(screen.getByTestId('sso-change-user'));
    expect(screen.getByTestId('sso-lookup')).toBeTruthy();
  });
});
