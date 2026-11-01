/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run before imports, so they require their stand-ins. */
import '../../settings/__tests__/test-setup';

import type { AccountMethodsData } from '@resgrid/auth';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { activateTestVariant } from '../../settings/__tests__/variant';
import { AccountSecurityScreen } from '../screens/account-security-screen';
import { resetFakeAuth } from './auth-fake';

const mockGetAccountMethods = jest.fn();
const mockRevokePasskey = jest.fn();
const mockReauthenticate = jest.fn();

jest.mock('@resgrid/auth', () => ({
  ...require('./auth-fake').buildAuthMock(jest.requireActual('@resgrid/auth')),
  getAccountMethods: (...args: unknown[]) => mockGetAccountMethods(...args),
  revokePasskey: (...args: unknown[]) => mockRevokePasskey(...args),
  reauthenticateWithPassword: (...args: unknown[]) => mockReauthenticate(...args),
}));
jest.mock('../lib/api-context', () => ({ authUiApi: () => ({}), hasAuthUiApi: () => true }));

const methods = (): AccountMethodsData => ({
  CurrentClient: 'responder',
  Totp: { Enrolled: true, EnrolledOn: '2026-01-01T00:00:00Z', LastUsedOn: null, RecoveryCodesRemaining: 2, RecoveryCodeWarning: true, SetUpOnSharedInstallation: false, CanTurnOff: true },
  PasskeyGroups: [
    {
      Client: 'responder',
      RegistrationAvailable: true,
      Passkeys: [
        {
          PasskeyId: 'pk-1',
          DisplayName: 'Pixel 9',
          Client: 'responder',
          CreatedOn: '2026-02-01T00:00:00Z',
          CreatedPlatform: 'android',
          CreatedInstallation: null,
          CreatedOnSharedInstallation: false,
          Attachment: 'platform',
          BackupEligible: true,
          BackedUp: true,
          LastUsedOn: null,
          LastUsedClient: null,
          LastUsedInstallation: null,
          ApprovalEnabled: true,
        },
      ],
    },
    { Client: 'unit', RegistrationAvailable: false, Passkeys: [{ PasskeyId: 'pk-2' } as never] },
  ],
  ApprovalInstallations: [],
  LinkedIdentities: [],
  RecentActivity: [],
});

describe('AccountSecurityScreen', () => {
  beforeEach(() => {
    resetFakeAuth();
    activateTestVariant('responder');
    mockGetAccountMethods.mockResolvedValue(methods());
  });

  it('shows the authenticator, recovery codes left, this app’s passkeys and the others', async () => {
    render(<AccountSecurityScreen />);
    expect(await screen.findByTestId('passkey-pk-1')).toBeTruthy();
    expect(screen.getByTestId('account-recovery-codes')).toHaveTextContent('mfa.account.recovery_codes_left [count=2]');
    expect(screen.getByTestId('account-passkeys-unit')).toHaveTextContent('mfa.account.passkeys_elsewhere [app=Resgrid Unit,count=1]');
    expect(screen.getByTestId('account-add-passkey')).toBeTruthy();
  });

  it('asks for the password when the server wants fresh proof, then retries the change', async () => {
    mockRevokePasskey.mockRejectedValueOnce({ response: { status: 403, data: { type: 'reauthentication_required' } } }).mockResolvedValueOnce({ Revoked: 1, SessionsEnded: 0, CurrentSessionEnded: false });
    mockReauthenticate.mockResolvedValue({ VerifiedAt: '2026-11-01T00:00:00Z' });
    render(<AccountSecurityScreen />);
    fireEvent.press(await screen.findByTestId('passkey-remove-pk-1'));

    fireEvent.changeText(await screen.findByTestId('account-verify-secret'), 'secret');
    fireEvent.press(screen.getByTestId('account-verify-submit'));

    await waitFor(() => expect(mockRevokePasskey).toHaveBeenCalledTimes(2));
    expect(mockReauthenticate).toHaveBeenCalledWith({}, 'secret');
    expect(await screen.findByTestId('account-notice')).toHaveTextContent('mfa.account.passkey_removed');
  });

  it('hides passkeys in a variant without them', async () => {
    activateTestVariant('bigboard');
    render(<AccountSecurityScreen />);
    expect(await screen.findByTestId('account-totp')).toBeTruthy();
    expect(screen.queryByTestId('account-passkeys')).toBeNull();
  });
});
