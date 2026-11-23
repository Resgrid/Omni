import { featureFlagsStore, terminologyStore, useAuthStore } from '@resgrid/auth';
import type { VariantId } from '@resgrid/config';
import { computeFormFactor, ScreenHeader, useFormFactor } from '@resgrid/ui';
import { act, render, screen, within } from '@testing-library/react-native';
import { HomeIcon, PlusIcon } from 'lucide-react-native';
import React from 'react';
import { Text } from 'react-native';

import { activateVariant } from '../../__tests__/helpers/variants';
import { mockNavigationState, resetMockNavigation } from '../../__tests__/mocks/expo-router';
import { sessionInit, startupInit } from '../../init/app-init';
import { defineNav } from '../../nav/define-nav';
import { defineRoutes } from '../../routes/define-routes';
import { setRouteContract } from '../../routes/href';
import { resetShellStateForTests, setShellState } from '../../runtime/shell-state';
import { resetShellSlotsForTests } from '../../runtime/slots';
import { createAppShell } from '../create-app-shell';
import { type HeaderLeading, resolveAppBarExit } from '../header';

// How a screen's own header (ScreenHeader) and the app bar share the top of the screen: one header, whatever way the
// screen was reached. Dispatch's New Call is a menu entry (`/call/new`), so its app bar shows the menu button; it used to
// get a second row under the bar with its own back arrow and the same title (about 60 pt on a phone).

jest.mock('@resgrid/ui', () => ({ ...jest.requireActual('@resgrid/ui'), useFormFactor: jest.fn() }));

const mockUseFormFactor = jest.mocked(useFormFactor);

const PHONE = { width: 390, height: 844, platform: 'ios' as const, isElectron: false };
const TABLET_LANDSCAPE = { width: 1180, height: 820, platform: 'ios' as const, isElectron: false };

// Dispatch's shape: the console at `/`, New Call in the menu, the call detail reached from somewhere else.
const nav = defineNav([
  { id: 'console', href: '/', placement: 'sidebar', icon: HomeIcon, labelKey: 'tabs.console', defaultLabel: 'Console' },
  { id: 'call-new', href: '/call/new', placement: 'sidebar', icon: PlusIcon, labelKey: 'tabs.new_call', defaultLabel: 'New Call' },
  { id: 'call-detail', href: '/call/[id]', placement: 'hidden', labelKey: 'tabs.call', defaultLabel: 'Call' },
]);

async function renderShell(pathname: string, canGoBack: boolean, header: React.ReactElement, variantId: VariantId = 'dispatch') {
  mockNavigationState.pathname = pathname;
  mockNavigationState.canGoBack = canGoBack;
  mockNavigationState.slot = header;
  const Shell = createAppShell(activateVariant(variantId), { nav });
  await render(<Shell />);
  await act(async () => undefined);
}

describe('ScreenHeader inside the app shell', () => {
  beforeEach(async () => {
    resetMockNavigation();
    resetShellStateForTests();
    resetShellSlotsForTests();
    setRouteContract(defineRoutes(['home']));
    setShellState({ onboardingRequired: false });
    featureFlagsStore.setState({ flags: {} });
    terminologyStore.setState({ names: {} });
    useAuthStore.setState({ status: 'signedIn', accessToken: 'access', userId: 'user-1', authMethod: 'sso' });
    startupInit.reset();
    await startupInit.run();
    sessionInit.reset();
    await sessionInit.run();
    mockUseFormFactor.mockReturnValue(computeFormFactor(PHONE));
  });

  it.each<[string, boolean]>([
    ['opened from the menu', true],
    ['opened by a deep link or a web reload (no history)', false],
  ])('a top-level screen titles the app bar beside the menu button, with no second row or back arrow — %s', async (_case, canGoBack) => {
    await renderShell('/call/new', canGoBack, <ScreenHeader title="Correct Queued Call" onBack={jest.fn()} right={<Text testID="call-new-action">action</Text>} />);
    expect(screen.getByTestId('shell-menu-button')).toBeTruthy();
    expect(screen.queryByTestId('shell-back-button')).toBeNull();
    expect(screen.queryByTestId('back-button')).toBeNull();
    expect(screen.queryByTestId('screen-header')).toBeNull();
    expect(screen.getByTestId('shell-header-title')).toHaveTextContent('Correct Queued Call');
    expect(within(screen.getByTestId('shell-header')).getByTestId('call-new-action')).toBeTruthy();
    expect(screen.getAllByRole('header')).toHaveLength(1);
  });

  // Responder on a landscape tablet keeps its sidebar on screen: the app bar shows no leading button at all.
  it('beside a permanent sidebar a top-level screen titles the app bar, with no back arrow either', async () => {
    mockUseFormFactor.mockReturnValue(computeFormFactor(TABLET_LANDSCAPE));
    await renderShell('/call/new', true, <ScreenHeader title="Correct Queued Call" onBack={jest.fn()} />, 'responder');
    expect(screen.queryByTestId('shell-menu-button')).toBeNull();
    expect(screen.queryByTestId('shell-back-button')).toBeNull();
    expect(screen.queryByTestId('back-button')).toBeNull();
    expect(screen.getByTestId('shell-header-title')).toHaveTextContent('Correct Queued Call');
    expect(screen.getAllByRole('header')).toHaveLength(1);
  });

  it('a detail screen with history titles the app bar and leaves back to it', async () => {
    await renderShell('/call/12', true, <ScreenHeader title="Call Details" onBack={jest.fn()} />);
    expect(screen.getByTestId('shell-back-button')).toBeTruthy();
    expect(screen.queryByTestId('back-button')).toBeNull();
    expect(screen.getByTestId('shell-header-title')).toHaveTextContent('Call Details');
    expect(screen.getAllByRole('header')).toHaveLength(1);
  });

  it('a detail screen with no history (a deep link) keeps its own back: the menu would not lead back to where it belongs', async () => {
    await renderShell('/call/12', false, <ScreenHeader title="Call Details" onBack={jest.fn()} />);
    expect(screen.getByTestId('shell-menu-button')).toBeTruthy();
    expect(screen.getByTestId('back-button')).toBeTruthy();
    expect(screen.getByTestId('shell-header-title')).toHaveTextContent('Call');
    expect(within(screen.getByTestId('screen-header')).getByRole('header', { name: 'Call Details' })).toBeTruthy();
  });
});

describe('resolveAppBarExit', () => {
  it.each<[boolean, HeaderLeading, string]>([
    [false, 'back', 'back'],
    [true, 'menu', 'menu'],
    [true, 'none', 'menu'],
    [false, 'menu', 'none'],
    [false, 'none', 'none'],
  ])('top level %s, leading %s → %s', (isTopLevel, leading, exit) => {
    expect(resolveAppBarExit({ isTopLevel, leading })).toBe(exit);
  });
});
