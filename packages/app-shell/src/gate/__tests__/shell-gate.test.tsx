import { securityStore, useAuthStore, useSharedSessionStore } from '@resgrid/auth';
import type { DepartmentRightsResultData } from '@resgrid/models';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { activateVariant } from '../../__tests__/helpers/variants';
import { startupInit } from '../../init/app-init';
import { getShellState, resetShellStateForTests, setShellState } from '../../runtime/shell-state';
import { registerShellScreens, resetShellSlotsForTests, type ShellGateScreenProps } from '../../runtime/slots';
import { ShellGate } from '../shell-gate';

const signIn = (): void => {
  useAuthStore.setState({ status: 'signedIn', accessToken: 'access', userId: 'user-1', authMethod: 'password' });
};

const renderGate = async () =>
  render(
    <ShellGate>
      <Text testID="app-content">app</Text>
    </ShellGate>
  );

describe('ShellGate', () => {
  beforeEach(async () => {
    activateVariant('dispatch');
    resetShellStateForTests();
    resetShellSlotsForTests();
    setShellState({ onboardingRequired: false });
    useAuthStore.setState({ status: 'signedOut', accessToken: null, refreshToken: null, userId: null, authMethod: null });
    useSharedSessionStore.setState({ locked: false });
    securityStore.setState({ rights: null });
    startupInit.reset();
    await startupInit.run();
  });

  it('shows the loading screen until startup is ready', async () => {
    startupInit.reset();
    await renderGate();
    expect(screen.getByTestId('shell-gate-loading')).toBeTruthy();
    expect(screen.queryByTestId('app-content')).toBeNull();
  });

  // A cold start that holds only a refresh token renews it before it has an access token. The sign-in screen in that gap
  // looked like being signed out (and a sign-in started there could discard the session being restored).
  it('waits on the loading screen while a stored session renews, and opens the app when it has', async () => {
    useAuthStore.setState({ status: 'loading', accessToken: null, refreshToken: 'refresh', userId: 'user-1' });
    await renderGate();
    expect(screen.getByTestId('shell-gate-loading')).toBeTruthy();
    expect(screen.queryByTestId('shell-gate-login')).toBeNull();

    await act(() => signIn());

    expect(screen.getByTestId('app-content')).toBeTruthy();
  });

  it('keeps a session restored offline (refresh token only) in the app instead of on the sign-in screen', async () => {
    useAuthStore.setState({ status: 'signedIn', accessToken: null, refreshToken: 'refresh', userId: 'user-1' });
    await renderGate();
    expect(screen.queryByTestId('shell-gate-login')).toBeNull();
    expect(screen.getByTestId('app-content')).toBeTruthy();
  });

  it('shows the login fallback (with the app name) when signed out, and the app once signed in', async () => {
    await renderGate();
    expect(screen.getByTestId('shell-gate-login')).toBeTruthy();
    expect(screen.getByTestId('shell-app-name')).toHaveTextContent('Resgrid Dispatch');

    await act(() => signIn());

    expect(screen.queryByTestId('shell-gate')).toBeNull();
    expect(screen.getByTestId('app-content')).toBeTruthy();
  });

  it('shows onboarding first and completes it through onComplete', async () => {
    setShellState({ onboardingRequired: true });
    await renderGate();
    expect(screen.getByTestId('shell-gate-onboarding')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('shell-onboarding-continue'));

    expect(getShellState().onboardingRequired).toBe(false);
    expect(screen.getByTestId('shell-gate-login')).toBeTruthy();
  });

  it('denies a member without the app-access right, then returns to sign in', async () => {
    signIn();
    securityStore.setState({ rights: { CanLoginToDispatchApp: false } as unknown as DepartmentRightsResultData });
    await renderGate();
    expect(screen.getByTestId('shell-gate-access-denied')).toBeTruthy();

    // enforceAppAccess signs the member out and leaves the notice up until it is dismissed.
    await act(() => {
      useAuthStore.setState({ status: 'signedOut', accessToken: null });
      setShellState({ accessDeniedNotice: true });
    });
    expect(screen.getByTestId('shell-gate-access-denied')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('shell-access-denied-continue'));
    expect(screen.getByTestId('shell-gate-login')).toBeTruthy();
  });

  it('locks a shared-device session (variants with sharedDevice)', async () => {
    signIn();
    useSharedSessionStore.setState({ locked: true });
    await renderGate();
    expect(screen.getByTestId('shell-gate-shared-lock')).toBeTruthy();
  });

  it('ignores the shared lock in a variant without shared devices', async () => {
    activateVariant('responder');
    signIn();
    useSharedSessionStore.setState({ locked: true });
    await renderGate();
    expect(screen.getByTestId('app-content')).toBeTruthy();
  });

  it('renders registered screens instead of the fallbacks and passes the gate props', async () => {
    const seen: ShellGateScreenProps[] = [];
    function CustomLogin(props: ShellGateScreenProps) {
      seen.push(props);
      return <Text testID="custom-login">custom</Text>;
    }
    const unregister = registerShellScreens({ Login: CustomLogin });
    await renderGate();

    expect(screen.getByTestId('custom-login')).toBeTruthy();
    expect(seen[0]).toEqual(expect.objectContaining({ step: 'login', appName: 'Resgrid Dispatch' }));

    await act(() => unregister());
    expect(screen.getByTestId('shell-gate-login')).toBeTruthy();
  });

  it.each([
    ['maintenance', 'shell-gate-maintenance'],
    ['personal-lock', 'shell-gate-personal-lock'],
  ] as const)('maps the %s step to its screen', async (step, testID) => {
    await render(<ShellGate step={step} />);
    expect(screen.getByTestId(testID)).toBeTruthy();
  });

  it('skips onboarding where the variant has none (BigBoard)', async () => {
    activateVariant('bigboard');
    setShellState({ onboardingRequired: true });
    await renderGate();
    expect(screen.getByTestId('shell-gate-login')).toBeTruthy();
  });
});
