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

const renderGate = () =>
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
    useAuthStore.setState({ status: 'signedOut', accessToken: null, userId: null, authMethod: null });
    useSharedSessionStore.setState({ locked: false });
    securityStore.setState({ rights: null });
    startupInit.reset();
    await startupInit.run();
  });

  it('shows the loading screen until startup is ready', () => {
    startupInit.reset();
    renderGate();
    expect(screen.getByTestId('shell-gate-loading')).toBeTruthy();
    expect(screen.queryByTestId('app-content')).toBeNull();
  });

  it('shows the login fallback (with the app name) when signed out, and the app once signed in', () => {
    renderGate();
    expect(screen.getByTestId('shell-gate-login')).toBeTruthy();
    expect(screen.getByTestId('shell-app-name')).toHaveTextContent('Resgrid Dispatch');

    act(() => signIn());

    expect(screen.queryByTestId('shell-gate')).toBeNull();
    expect(screen.getByTestId('app-content')).toBeTruthy();
  });

  it('shows onboarding first and completes it through onComplete', () => {
    setShellState({ onboardingRequired: true });
    renderGate();
    expect(screen.getByTestId('shell-gate-onboarding')).toBeTruthy();

    fireEvent.press(screen.getByTestId('shell-onboarding-continue'));

    expect(getShellState().onboardingRequired).toBe(false);
    expect(screen.getByTestId('shell-gate-login')).toBeTruthy();
  });

  it('denies a member without the app-access right, then returns to sign in', () => {
    signIn();
    securityStore.setState({ rights: { CanLoginToDispatchApp: false } as unknown as DepartmentRightsResultData });
    renderGate();
    expect(screen.getByTestId('shell-gate-access-denied')).toBeTruthy();

    // enforceAppAccess signs the member out and leaves the notice up until it is dismissed.
    act(() => {
      useAuthStore.setState({ status: 'signedOut', accessToken: null });
      setShellState({ accessDeniedNotice: true });
    });
    expect(screen.getByTestId('shell-gate-access-denied')).toBeTruthy();

    fireEvent.press(screen.getByTestId('shell-access-denied-continue'));
    expect(screen.getByTestId('shell-gate-login')).toBeTruthy();
  });

  it('locks a shared-device session (variants with sharedDevice)', () => {
    signIn();
    useSharedSessionStore.setState({ locked: true });
    renderGate();
    expect(screen.getByTestId('shell-gate-shared-lock')).toBeTruthy();
  });

  it('ignores the shared lock in a variant without shared devices', () => {
    activateVariant('responder');
    signIn();
    useSharedSessionStore.setState({ locked: true });
    renderGate();
    expect(screen.getByTestId('app-content')).toBeTruthy();
  });

  it('renders registered screens instead of the fallbacks and passes the gate props', () => {
    const seen: ShellGateScreenProps[] = [];
    function CustomLogin(props: ShellGateScreenProps) {
      seen.push(props);
      return <Text testID="custom-login">custom</Text>;
    }
    const unregister = registerShellScreens({ Login: CustomLogin });
    renderGate();

    expect(screen.getByTestId('custom-login')).toBeTruthy();
    expect(seen[0]).toEqual(expect.objectContaining({ step: 'login', appName: 'Resgrid Dispatch' }));

    act(() => unregister());
    expect(screen.getByTestId('shell-gate-login')).toBeTruthy();
  });

  it.each([
    ['maintenance', 'shell-gate-maintenance'],
    ['personal-lock', 'shell-gate-personal-lock'],
  ] as const)('maps the %s step to its screen', (step, testID) => {
    render(<ShellGate step={step} />);
    expect(screen.getByTestId(testID)).toBeTruthy();
  });

  it('skips onboarding where the variant has none (BigBoard)', () => {
    activateVariant('bigboard');
    setShellState({ onboardingRequired: true });
    renderGate();
    expect(screen.getByTestId('shell-gate-login')).toBeTruthy();
  });
});
