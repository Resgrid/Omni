import { featureFlagsStore, terminologyStore, useAuthStore } from '@resgrid/auth';
import type { VariantId } from '@resgrid/config';
import { computeFormFactor, type FormFactorInfo, useFormFactor } from '@resgrid/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { MapIcon, MessageCircleIcon, SettingsIcon } from 'lucide-react-native';
import React from 'react';
import { Text } from 'react-native';

import { activateVariant } from '../../__tests__/helpers/variants';
import { mockNavigationState, resetMockNavigation, router } from '../../__tests__/mocks/expo-router';
import { sessionInit, startupInit } from '../../init/app-init';
import { defineNav } from '../../nav/define-nav';
import { defineRoutes } from '../../routes/define-routes';
import { setRouteContract } from '../../routes/href';
import { resetShellStateForTests, setShellState } from '../../runtime/shell-state';
import { registerShellOverlay, registerShellProvider, registerSidebarContent, resetShellSlotsForTests, type SidebarContentProps } from '../../runtime/slots';
import { createAppShell } from '../create-app-shell';
import { findNavEntryForPath, isTopLevelScreen, resolveHeaderLeading } from '../header';
import { resolveSidebarMode } from '../sidebar-mode';

jest.mock('@resgrid/ui', () => ({ ...jest.requireActual('@resgrid/ui'), useFormFactor: jest.fn() }));

const mockUseFormFactor = useFormFactor as jest.MockedFunction<typeof useFormFactor>;

const FORM_FACTORS = {
  phone: { width: 390, height: 844, platform: 'ios' as const, isElectron: false },
  tabletPortrait: { width: 820, height: 1180, platform: 'ios' as const, isElectron: false },
  tabletLandscape: { width: 1180, height: 820, platform: 'ios' as const, isElectron: false },
  desktop: { width: 1440, height: 900, platform: 'web' as const, isElectron: false },
};

const setFormFactor = (name: keyof typeof FORM_FACTORS): FormFactorInfo => {
  const info = computeFormFactor(FORM_FACTORS[name]);
  mockUseFormFactor.mockReturnValue(info);
  return info;
};

const nav = defineNav([
  { id: 'map', href: '/', placement: 'tab', icon: MapIcon, labelKey: 'tabs.map', defaultLabel: 'Map', termKey: 'module.mapping' },
  { id: 'settings', href: '/settings', placement: 'tab', icon: SettingsIcon, labelKey: 'tabs.settings', defaultLabel: 'Settings' },
  { id: 'chat', href: '/chat', placement: 'sidebar', icon: MessageCircleIcon, labelKey: 'tabs.chat', defaultLabel: 'Chat', requiresFlag: 'Chat.System' },
  { id: 'account-security', href: '/account-security', placement: 'hidden', labelKey: 'mfa.account.title', defaultLabel: 'Account security' },
]);

async function renderShell(variantId: VariantId) {
  const variant = activateVariant(variantId);
  const Shell = createAppShell(variant, { nav });
  render(<Shell />);
  await act(async () => undefined);
  return variant;
}

describe('createAppShell', () => {
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
    setFormFactor('phone');
  });

  it('drawer-slot (Dispatch): header + Slot, no tab bar', async () => {
    await renderShell('dispatch');
    expect(screen.getByTestId('app-shell-drawer-slot')).toBeTruthy();
    expect(screen.getByTestId('mock-slot')).toBeTruthy();
    expect(screen.queryByTestId('mock-tabs')).toBeNull();
    expect(screen.getByTestId('shell-header-title')).toHaveTextContent('Map');
  });

  it('tabs (Unit): tab bar generated from the registry with hidden routes as href: null', async () => {
    await renderShell('unit');
    expect(screen.getByTestId('app-shell-tabs')).toBeTruthy();
    expect(mockNavigationState.tabs?.screens.map((s) => [s.name, s.options.href === null ? 'hidden' : 'tab'])).toEqual([
      ['index', 'tab'],
      ['settings', 'tab'],
      ['chat', 'hidden'],
      ['account-security', 'hidden'],
    ]);
    expect(screen.getByTestId('map-tab')).toHaveTextContent('Map');
    expect(screen.queryByTestId('chat-tab')).toBeNull();
  });

  it('labels tabs with department terminology', async () => {
    terminologyStore.setState({ names: { 'module.mapping': 'Area Map' } });
    await renderShell('unit');
    expect(screen.getByTestId('map-tab')).toHaveTextContent('Area Map');
  });

  it('dev check: a route without a registry entry fails', async () => {
    await renderShell('unit');
    const listeners = mockNavigationState.tabs?.screenListeners;
    expect(() => listeners?.({ route: { name: 'orphan' } })).toThrow(/no nav registry entry/);
    expect(() => listeners?.({ route: { name: 'settings' } })).not.toThrow();
  });

  it('phone: the sidebar is a drawer opened from the header menu button', async () => {
    await renderShell('responder');
    expect(screen.queryByTestId('shell-sidebar-permanent')).toBeNull();
    fireEvent.press(screen.getByTestId('shell-menu-button'));
    // Let the drawer arm its backdrop (SideDrawer's opening-tap guard) inside act.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });
    expect(screen.getByTestId('shell-nav-menu', { includeHiddenElements: true })).toBeTruthy();
  });

  it('tablet landscape: permanent quarter-width sidebar for Responder and Unit, no menu button', async () => {
    setFormFactor('tabletLandscape');
    await renderShell('responder');
    expect(screen.getByTestId('shell-sidebar-permanent')).toBeTruthy();
    expect(screen.queryByTestId('shell-menu-button')).toBeNull();
  });

  it('tablet portrait: Responder falls back to the drawer', async () => {
    setFormFactor('tabletPortrait');
    await renderShell('responder');
    expect(screen.queryByTestId('shell-sidebar-permanent')).toBeNull();
    expect(screen.getByTestId('shell-menu-button')).toBeTruthy();
  });

  it('IC always uses the side drawer, even on a landscape tablet', async () => {
    setFormFactor('tabletLandscape');
    await renderShell('ic');
    expect(screen.queryByTestId('shell-sidebar-permanent')).toBeNull();
    expect(screen.getByTestId('shell-menu-button')).toBeTruthy();
  });

  it('Dispatch desktop: a 280 px panel toggled by the menu button', async () => {
    setFormFactor('desktop');
    await renderShell('dispatch');
    expect(screen.queryByTestId('shell-sidebar-panel')).toBeNull();

    fireEvent.press(screen.getByTestId('shell-menu-button'));
    expect(screen.getByTestId('shell-sidebar-panel')).toHaveStyle({ width: 280 });

    fireEvent.press(screen.getByTestId('shell-menu-button'));
    expect(screen.queryByTestId('shell-sidebar-panel')).toBeNull();
  });

  it('the menu lists available entries and navigates', async () => {
    featureFlagsStore.setState({ flags: { 'Chat.System': { enabled: true } } as never });
    setFormFactor('tabletLandscape');
    await renderShell('responder');
    expect(screen.getByTestId('nav-chat')).toBeTruthy();
    expect(screen.queryByTestId('nav-account-security')).toBeNull();

    fireEvent.press(screen.getByTestId('nav-settings'));
    expect(router.navigate).toHaveBeenCalledWith('/settings');
  });

  it("Unit's sidebar shows the registered unit-status content instead of the menu", async () => {
    function UnitStatus(_props: SidebarContentProps) {
      return <Text testID="unit-status">status</Text>;
    }
    registerSidebarContent('unit-status', UnitStatus);
    setFormFactor('tabletLandscape');
    await renderShell('unit');
    expect(screen.getByTestId('unit-status')).toBeTruthy();
    expect(screen.queryByTestId('shell-nav-menu')).toBeNull();
  });

  it('shows "changes waiting" from the outbox count, as a link only when the variant has the storage screen', async () => {
    setShellState({ unsentChanges: 3 });
    await renderShell('dispatch');
    expect(screen.getByTestId('shell-pending-changes')).toHaveTextContent('Changes waiting: 3');
    fireEvent.press(screen.getByTestId('shell-pending-changes'));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('keeps the navigator mounted under the loading overlay while the session bootstrap runs', async () => {
    sessionInit.reset();
    await renderShell('dispatch');
    expect(screen.getByTestId('mock-slot')).toBeTruthy();
    expect(screen.getByTestId('shell-init-loading')).toBeTruthy();
  });

  it('is gated: signed out shows the login screen instead of the shell', async () => {
    useAuthStore.setState({ status: 'signedOut', accessToken: null });
    await renderShell('dispatch');
    expect(screen.getByTestId('shell-gate-login')).toBeTruthy();
    expect(screen.queryByTestId('app-shell-drawer-slot')).toBeNull();
  });

  it('shows a back button below the top level', async () => {
    mockNavigationState.pathname = '/settings/account-security';
    mockNavigationState.canGoBack = true;
    await renderShell('dispatch');
    fireEvent.press(screen.getByTestId('shell-back-button'));
    expect(router.back).toHaveBeenCalled();
  });
});

describe('resolveSidebarMode', () => {
  it.each<[VariantId, keyof typeof FORM_FACTORS, string]>([
    ['responder', 'phone', 'drawer'],
    ['responder', 'tabletLandscape', 'permanent'],
    ['responder', 'tabletPortrait', 'drawer'],
    ['unit', 'tabletLandscape', 'permanent'],
    ['ic', 'tabletLandscape', 'drawer'],
    ['dispatch', 'desktop', 'panel'],
    ['dispatch', 'tabletLandscape', 'drawer'],
    ['bigboard', 'desktop', 'drawer'],
  ])('%s on %s → %s', (variantId, formFactor, expected) => {
    const variant = activateVariant(variantId);
    expect(resolveSidebarMode(variant.shell, computeFormFactor(FORM_FACTORS[formFactor]))).toBe(expected);
  });
});

describe('findNavEntryForPath', () => {
  const detailNav = defineNav([
    { id: 'calls', href: '/calls', placement: 'sidebar', labelKey: 'calls.title' },
    { id: 'call-detail', href: '/call/[id]', placement: 'hidden', labelKey: 'call_detail.title' },
    { id: 'settings', href: '/settings', placement: 'sidebar', labelKey: 'settings.title' },
  ]);

  it('matches hidden detail entries by pattern, static hrefs exactly, and falls back to the closest ancestor', () => {
    expect(findNavEntryForPath(detailNav, '/call/42')).toEqual({ entry: detailNav.get('call-detail'), exact: true });
    expect(findNavEntryForPath(detailNav, '/calls')?.entry.id).toBe('calls');
    expect(findNavEntryForPath(detailNav, '/settings/storage-sync')).toEqual({ entry: detailNav.get('settings'), exact: false });
    expect(findNavEntryForPath(detailNav, '/elsewhere')).toBeNull();
  });
});

describe('isTopLevelScreen', () => {
  const homeNav = defineNav([
    { id: 'home', href: '/home', placement: 'sidebar', labelKey: 'tabs.home', nestedTabs: true },
    { id: 'records', href: '/records', placement: 'sidebar', labelKey: 'records.title' },
    { id: 'call-detail', href: '/call/[id]', placement: 'hidden', labelKey: 'call_detail.title' },
  ]);
  const topLevel = (path: string) => isTopLevelScreen(findNavEntryForPath(homeNav, path), path);

  it('menu entries, the tabs of a nested tab layout and the root are top level; details and hidden entries are not', () => {
    expect(topLevel('/')).toBe(true);
    expect(topLevel('/home')).toBe(true);
    expect(topLevel('/home/calls')).toBe(true);
    expect(topLevel('/records')).toBe(true);
    expect(topLevel('/records/12')).toBe(false);
    expect(topLevel('/call/12')).toBe(false);
    expect(topLevel('/elsewhere')).toBe(false);
  });
});

describe('registered providers', () => {
  beforeEach(async () => {
    resetMockNavigation();
    resetShellStateForTests();
    resetShellSlotsForTests();
    setShellState({ onboardingRequired: false });
    useAuthStore.setState({ status: 'signedIn', accessToken: 'access', userId: 'user-1', authMethod: 'sso' });
    startupInit.reset();
    await startupInit.run();
    sessionInit.reset();
    await sessionInit.run();
    setFormFactor('phone');
  });

  it('wrap the signed-in frame (header and routes), inside the gate', async () => {
    const Marker = React.createContext('none');
    function MarkerProbe() {
      return <Text testID="provider-marker">{React.useContext(Marker)}</Text>;
    }
    registerShellProvider('marker', ({ children }) => <Marker.Provider value="mounted">{children}</Marker.Provider>);
    registerShellOverlay('marker-probe', MarkerProbe);

    await renderShell('dispatch');
    expect(screen.getByTestId('app-shell-drawer-slot')).toBeTruthy();
    expect(screen.getByTestId('provider-marker')).toHaveTextContent('mounted');
  });

  it('do not mount while the gate shows a sign-in screen', async () => {
    const mounted = jest.fn();
    registerShellProvider('marker', ({ children }) => {
      mounted();
      return <>{children}</>;
    });
    act(() => useAuthStore.setState({ status: 'signedOut', accessToken: null, userId: null }));

    await renderShell('dispatch');
    expect(screen.getByTestId('shell-gate')).toBeTruthy();
    expect(mounted).not.toHaveBeenCalled();
  });
});

describe('resolveHeaderLeading', () => {
  it('back below the top level when there is history, else the menu (none beside a permanent sidebar)', () => {
    expect(resolveHeaderLeading({ isTopLevel: false, canGoBack: true, sidebarMode: 'drawer' })).toBe('back');
    expect(resolveHeaderLeading({ isTopLevel: false, canGoBack: false, sidebarMode: 'drawer' })).toBe('menu');
    expect(resolveHeaderLeading({ isTopLevel: true, canGoBack: true, sidebarMode: 'panel' })).toBe('menu');
    expect(resolveHeaderLeading({ isTopLevel: true, canGoBack: false, sidebarMode: 'permanent' })).toBe('none');
  });
});
