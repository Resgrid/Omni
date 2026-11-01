/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run before imports, so they require their stand-ins. */
import '../../settings/__tests__/test-setup';

import { unlockPersonalSession } from '@resgrid/auth';
import { createMemoryKvBackend, DurableKv } from '@resgrid/offline';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import { activateTestVariant } from '../../settings/__tests__/variant';
import { setDevicePreferencesKv } from '../lib/device-kv';
import { AccessDeniedScreen } from '../screens/access-denied-screen';
import { MaintenanceScreen } from '../screens/maintenance-screen';
import { isOnboardingComplete, OnboardingScreen } from '../screens/onboarding-screen';
import { PersonalLockScreen } from '../screens/personal-lock-screen';
import { fakeAuthStore, resetFakeAuth } from './auth-fake';

jest.mock('@resgrid/auth', () => require('./auth-fake').buildAuthMock(jest.requireActual('@resgrid/auth')));
jest.mock('@resgrid/core', () => ({
  ...jest.requireActual('@resgrid/core'),
  getAppVersionInfo: () => ({ version: '8.12', buildNumber: 100012 }),
}));

const mockUnlock = unlockPersonalSession as jest.Mock;

describe('MaintenanceScreen', () => {
  it('explains the downtime and names the build', () => {
    activateTestVariant('bigboard');
    render(<MaintenanceScreen />);
    expect(screen.getByRole('header', { name: 'maintenance.title' })).toBeTruthy();
    expect(screen.getByTestId('maintenance-why')).toBeTruthy();
    expect(screen.getByTestId('maintenance-downtime')).toBeTruthy();
    expect(screen.getByTestId('maintenance-support-email')).toHaveTextContent('support@resgrid.com');
    expect(screen.getByTestId('maintenance-version')).toHaveTextContent('settings.version_value [version=8.12,build=100012]');
  });
});

describe('OnboardingScreen', () => {
  let kv: DurableKv;
  beforeEach(() => {
    kv = new DurableKv(createMemoryKvBackend('onboarding'));
    setDevicePreferencesKv(kv);
  });
  afterEach(() => setDevicePreferencesKv(undefined));

  it('shows the variant slides and finishes on the last one', () => {
    activateTestVariant('unit');
    const onComplete = jest.fn();
    render(<OnboardingScreen onComplete={onComplete} />);
    expect(screen.getByTestId('onboarding-title')).toHaveTextContent('onboarding.pages.unit.location.title');
    fireEvent.press(screen.getByTestId('onboarding-next'));
    expect(screen.getByTestId('onboarding-title')).toHaveTextContent('onboarding.pages.unit.notifications.title');
    fireEvent.press(screen.getByTestId('onboarding-next'));
    expect(screen.queryByTestId('onboarding-skip')).toBeNull();
    fireEvent.press(screen.getByTestId('onboarding-finish'));
    expect(onComplete).toHaveBeenCalled();
    expect(isOnboardingComplete()).toBe(true);
    expect(kv.getBoolean('IS_FIRST_TIME')).toBe(false);
  });

  it('skips straight to sign-in', () => {
    activateTestVariant('dispatch');
    render(<OnboardingScreen />);
    expect(screen.getByTestId('onboarding-title')).toHaveTextContent('onboarding.pages.dispatch.calls.title');
    fireEvent.press(screen.getByTestId('onboarding-skip'));
    expect(router.replace).toHaveBeenCalledWith('/login');
    expect(isOnboardingComplete()).toBe(true);
  });
});

describe('PersonalLockScreen', () => {
  beforeEach(() => {
    resetFakeAuth();
    activateTestVariant('dispatch');
  });

  it('unlocks with the right password', async () => {
    mockUnlock.mockResolvedValueOnce('unlocked');
    const onUnlocked = jest.fn();
    render(<PersonalLockScreen onUnlocked={onUnlocked} />);
    fireEvent.changeText(screen.getByLabelText('lockscreen.password'), 'secret');
    fireEvent.press(screen.getByRole('button', { name: 'lockscreen.unlock_button' }));
    await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
    expect(mockUnlock).toHaveBeenCalledWith('secret');
  });

  it('refuses a wrong password and clears it', async () => {
    mockUnlock.mockResolvedValueOnce('wrong_password');
    render(<PersonalLockScreen />);
    fireEvent.changeText(screen.getByTestId('lock-password'), 'nope');
    fireEvent.press(screen.getByTestId('lock-unlock'));
    expect(await screen.findByText('lockscreen.unlock_failed')).toBeTruthy();
    expect(screen.getByTestId('lock-password').props.value).toBe('');
  });

  it('asks to sign in again when the session has no verifier', async () => {
    mockUnlock.mockResolvedValueOnce('no_verifier');
    render(<PersonalLockScreen />);
    fireEvent.changeText(screen.getByTestId('lock-password'), 'secret');
    fireEvent.press(screen.getByTestId('lock-unlock'));
    expect(await screen.findByText('lockscreen.relogin_required')).toBeTruthy();
  });

  it('signs out from "Not you?"', () => {
    render(<PersonalLockScreen />);
    fireEvent.press(screen.getByTestId('lock-not-you'));
    expect(fakeAuthStore.getState().logout).toHaveBeenCalled();
  });
});

describe('AccessDeniedScreen', () => {
  beforeEach(() => resetFakeAuth());

  it('names the app and signs a still-signed-in member out', () => {
    activateTestVariant('ic');
    fakeAuthStore.setState({ status: 'signedIn', accessToken: 'token' });
    render(<AccessDeniedScreen />);
    expect(screen.getByTestId('access-denied-message')).toHaveTextContent('access_denied.message [appName=Resgrid IC]');
    fireEvent.press(screen.getByTestId('access-denied-back'));
    expect(fakeAuthStore.getState().logout).toHaveBeenCalledWith('app_access_denied', 'access-denied');
  });

  it('still signs out before handing back to the caller', () => {
    activateTestVariant('ic');
    fakeAuthStore.setState({ status: 'signedIn', accessToken: 'token' });
    const onDismiss = jest.fn();
    render(<AccessDeniedScreen onDismiss={onDismiss} />);
    fireEvent.press(screen.getByTestId('access-denied-back'));
    expect(fakeAuthStore.getState().logout).toHaveBeenCalledWith('app_access_denied', 'access-denied');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
