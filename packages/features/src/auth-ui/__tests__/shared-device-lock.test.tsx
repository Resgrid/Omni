/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run before imports, so they require their stand-ins. */
import '../../settings/__tests__/test-setup';

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { activateTestVariant } from '../../settings/__tests__/variant';
import { SharedDeviceLockScreen } from '../screens/shared-device-lock-screen';
import { resetFakeAuth } from './auth-fake';

const mockLockSession = jest.fn();
const mockGetUnlockOptions = jest.fn();
const mockCompleteUnlock = jest.fn();
const mockAfterUnlock = jest.fn();
const mockEndShift = jest.fn();
const mockApply = jest.fn();

jest.mock('@resgrid/auth', () => ({
  ...require('./auth-fake').buildAuthMock(jest.requireActual('@resgrid/auth')),
  lockSession: (...args: unknown[]) => mockLockSession(...args),
  getUnlockOptions: (...args: unknown[]) => mockGetUnlockOptions(...args),
  completeUnlock: (...args: unknown[]) => mockCompleteUnlock(...args),
  afterSharedUnlock: (...args: unknown[]) => mockAfterUnlock(...args),
  endSharedShift: (...args: unknown[]) => mockEndShift(...args),
  applySharedSessionStatus: (...args: unknown[]) => mockApply(...args),
  markSharedSessionLocked: jest.fn(),
}));

jest.mock('../lib/api-context', () => ({ authUiApi: () => ({}), hasAuthUiApi: () => true }));

describe('SharedDeviceLockScreen', () => {
  beforeEach(() => {
    resetFakeAuth();
    activateTestVariant('unit');
    mockLockSession.mockResolvedValue({ Locked: true, LockVersion: 4 });
    mockGetUnlockOptions.mockResolvedValue({ Operator: 'J. Doe', LockVersion: 4, Methods: ['totp'], Preferred: 'totp', Passkey: null });
    mockEndShift.mockResolvedValue(undefined);
  });

  it('locks on the server first, then unlocks the same session with the operator code', async () => {
    mockCompleteUnlock.mockResolvedValue({ Locked: false });
    await render(<SharedDeviceLockScreen />);
    expect(await screen.findByText('shared_session.locked_operator [operator=J. Doe]')).toBeTruthy();
    expect(mockLockSession).toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('shared-lock-code'), '123456');
    await fireEvent.press(screen.getByTestId('shared-lock-unlock'));
    await waitFor(() => expect(mockCompleteUnlock).toHaveBeenCalledWith({}, 4, { Method: 'totp', Code: '123456' }));
    expect(mockAfterUnlock).toHaveBeenCalled();
  });

  it('shows a refused code and lets anyone end the shift', async () => {
    mockCompleteUnlock.mockRejectedValue({ response: { status: 400, data: { type: 'invalid_totp' } } });
    await render(<SharedDeviceLockScreen />);
    await fireEvent.changeText(await screen.findByTestId('shared-lock-code'), '000000');
    await fireEvent.press(screen.getByTestId('shared-lock-unlock'));
    expect(await screen.findByText('mfa.errors.invalid_totp')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('shared-lock-end-shift'));
    expect(mockEndShift).toHaveBeenCalledWith(false);
    await waitFor(() => expect(screen.getByTestId('shared-lock-end-shift')).not.toBeDisabled());
  });

  it('says the shift cannot be unlocked here when its only method needs a passkey this device cannot use', async () => {
    const auth = jest.requireMock<{ passkeysSupported: jest.Mock }>('@resgrid/auth');
    auth.passkeysSupported.mockReturnValue(false);
    mockGetUnlockOptions.mockResolvedValue({ Operator: 'J. Doe', LockVersion: 4, Methods: ['passkey'], Preferred: 'passkey', Passkey: { RequestId: 'req-1', Options: {} } });

    try {
      await render(<SharedDeviceLockScreen />);
      expect(await screen.findByTestId('shared-lock-no-methods')).toHaveTextContent('shared_session.no_unlock');
      expect(screen.queryByTestId('shared-lock-passkey')).toBeNull();
      expect(screen.getByTestId('shared-lock-end-shift')).toBeTruthy();
    } finally {
      auth.passkeysSupported.mockReturnValue(true);
    }
  });
});
