import { featureFlagsStore, securityStore, terminologyStore, useAuthStore } from '@resgrid/auth';
import type { VariantId } from '@resgrid/config';
import { useBadgeCountsStore } from '@resgrid/data';
import type { DepartmentRightsResultData } from '@resgrid/models';
import { useInboxUnreadCount } from '@resgrid/notifications';
import { ColorSchemeProvider, computeFormFactor, type FormFactorInfo, getThemeColors, ScreenHeader, SYNC_NOTICE_DELAY_MS, useFormFactor, useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { MapIcon, MessageCircleIcon, SettingsIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { activateVariant } from '../../__tests__/helpers/variants';
import { mockNavigationState, resetMockNavigation, router } from '../../__tests__/mocks/expo-router';
import { sessionInit, startupInit } from '../../init/app-init';
import { defineNav } from '../../nav/define-nav';
import { defineRoutes } from '../../routes/define-routes';
import { setRouteContract } from '../../routes/href';
import { resetShellStateForTests, setShellState } from '../../runtime/shell-state';
import { registerShellOverlay, registerShellProvider, registerSidebarContent, resetShellSlotsForTests, type SidebarContentProps } from '../../runtime/slots';
import { createAppShell } from '../create-app-shell';
import { findNavEntryForPath, isTopLevelScreen, resolveHeaderLeading, SESSION_INIT_INDICATOR_DELAY_MS } from '../header';
import { NavMenu } from '../sidebar';
import { permanentSidebarWidth, resolveSidebarMode } from '../sidebar-mode';

jest.mock('@resgrid/ui', () => ({ ...jest.requireActual('@resgrid/ui'), useFormFactor: jest.fn() }));

let mockInboxStatus: 'loading' | 'ready' | 'unavailable' = 'loading';

jest.mock('../../providers/inbox-provider', () => ({ ...jest.requireActual('../../providers/inbox-provider'), useShellInboxStatus: () => mockInboxStatus }));

const mockUseInboxUnreadCount = jest.mocked(useInboxUnreadCount);

const mockUseFormFactor = useFormFactor as jest.MockedFunction<typeof useFormFactor>;

const FORM_FACTORS = {
  phone: { width: 390, height: 844, platform: 'ios' as const, isElectron: false },
  phoneLandscape: { width: 844, height: 390, platform: 'ios' as const, isElectron: false },
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
  await render(<Shell />);
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

  it('drawer-slot (Dispatch): header + a header-less stack, no tab bar', async () => {
    await renderShell('dispatch');
    expect(screen.getByTestId('app-shell-drawer-slot')).toBeTruthy();
    // A stack, not a Slot: the screen under a call or chat stays mounted, so Back finds it as it was (Home on its Calls tab).
    expect(screen.getByTestId('mock-stack')).toBeTruthy();
    expect(screen.queryByTestId('mock-slot')).toBeNull();
    expect(mockNavigationState.stack?.screenOptions).toEqual({ headerShown: false, animation: 'none' });
    expect(screen.queryByTestId('mock-tabs')).toBeNull();
    expect(screen.getByTestId('shell-header-title')).toHaveTextContent('Map');
  });

  // One design system (Dispatch's): the app bar is the raised surface with body text in every app and both schemes. It was the
  // primary fill, which the reversed dark ramp turned into a pale bar with dark text.
  it.each(['light', 'dark'] as const)('draws the Dispatch app bar in %s mode', async (scheme) => {
    const variant = activateVariant('responder');
    const Shell = createAppShell(variant, { nav });
    await render(
      <ColorSchemeProvider mode={scheme}>
        <Shell />
      </ColorSchemeProvider>
    );
    await act(async () => undefined);
    const colors = getThemeColors(scheme);

    expect(StyleSheet.flatten(screen.getByTestId('shell-header').props.style)).toMatchObject({ backgroundColor: colors.surface, borderBottomColor: colors.border });
    expect(StyleSheet.flatten(screen.getByTestId('shell-header-title').props.style).color).toBe(colors.text);
  });

  it.each(['unit', 'ic'] as const)('tabs (%s): hides sidebar and detail buttons without disabling their routes', async (variant) => {
    await renderShell(variant);
    expect(screen.getByTestId('app-shell-tabs')).toBeTruthy();
    expect(mockNavigationState.tabs?.screens.map((s) => [s.name, s.options.tabBarButton ? 'hidden' : 'tab'])).toEqual([
      ['index', 'tab'],
      ['settings', 'tab'],
      ['chat', 'hidden'],
      ['account-security', 'hidden'],
    ]);

    for (const route of mockNavigationState.tabs?.screens ?? []) {
      expect(route.options.href).toBeUndefined();
    }

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
    await fireEvent.press(screen.getByTestId('shell-menu-button'));
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

  // Legacy Responder showed its menu as a permanent column whenever the screen was wider than tall, phones included.
  it('phone landscape: Responder keeps the permanent sidebar, Unit and the others use the drawer', async () => {
    setFormFactor('phoneLandscape');
    await renderShell('responder');
    expect(screen.getByTestId('shell-sidebar-permanent')).toBeTruthy();
    expect(screen.queryByTestId('shell-menu-button')).toBeNull();

    await renderShell('unit');
    expect(screen.queryByTestId('shell-sidebar-permanent')).toBeNull();
    expect(screen.getByTestId('shell-menu-button')).toBeTruthy();
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

    await fireEvent.press(screen.getByTestId('shell-menu-button'));
    expect(screen.getByTestId('shell-sidebar-panel')).toHaveStyle({ width: 280 });

    await fireEvent.press(screen.getByTestId('shell-menu-button'));
    expect(screen.queryByTestId('shell-sidebar-panel')).toBeNull();
  });

  it('the menu lists available entries and navigates', async () => {
    featureFlagsStore.setState({ flags: { 'Chat.System': { enabled: true } } as never });
    setFormFactor('tabletLandscape');
    await renderShell('responder');
    expect(screen.getByTestId('nav-chat')).toBeTruthy();
    expect(screen.queryByTestId('nav-account-security')).toBeNull();

    await fireEvent.press(screen.getByTestId('nav-settings'));
    expect(router.navigate).toHaveBeenCalledWith('/settings');
  });

  it('a menu hop in a drawer shell goes back to the first screen before opening the section, so the stack stays short', async () => {
    setFormFactor('tabletLandscape');
    mockNavigationState.canGoBack = true;
    await renderShell('responder');

    await fireEvent.press(screen.getByTestId('nav-settings'));

    expect(router.dismissAll).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith('/settings');
    expect(jest.mocked(router.dismissAll).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(router.navigate).mock.invocationCallOrder[0]);
  });

  it('the menu entry of the section already showing keeps that screen (its search and tab) and only closes the menu', async () => {
    setFormFactor('tabletLandscape');
    mockNavigationState.canGoBack = true;
    mockNavigationState.pathname = '/settings';
    await renderShell('responder');

    await fireEvent.press(screen.getByTestId('nav-settings'));

    expect(router.dismissAll).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('a menu hop in a tabs shell only switches tabs', async () => {
    setFormFactor('tabletLandscape');
    mockNavigationState.canGoBack = true;
    await renderShell('ic');
    // IC's menu is a drawer at every size.
    await fireEvent.press(screen.getByTestId('shell-menu-button'));
    await act(async () => undefined);

    await fireEvent.press(screen.getByTestId('nav-settings', { includeHiddenElements: true }));

    expect(router.dismissAll).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith('/settings');
  });

  it('the menu opens with who is signed in: avatar, name and department', async () => {
    securityStore.setState({ rights: { FullName: ' Jane Doe ', DepartmentName: 'Station 9 Fire' } as unknown as DepartmentRightsResultData });
    setFormFactor('tabletLandscape');
    await renderShell('responder');
    expect(screen.getByTestId('shell-nav-profile-name')).toHaveTextContent('Jane Doe');
    expect(screen.getByTestId('shell-nav-profile-department')).toHaveTextContent('Station 9 Fire');
    expect(screen.getByText('JD')).toBeTruthy();
    expect(screen.getByTestId('shell-nav-profile-avatar').props.source).toEqual({ uri: expect.stringMatching(/\/api\/v4\/Avatars\/Get\?id=user-1$/) });
  });

  it('the drawer menu shows the profile header too', async () => {
    securityStore.setState({ rights: { FullName: 'Jane Doe', DepartmentName: 'Station 9 Fire' } as unknown as DepartmentRightsResultData });
    await renderShell('responder');
    await fireEvent.press(screen.getByTestId('shell-menu-button'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });
    expect(screen.getByTestId('shell-nav-profile-name', { includeHiddenElements: true })).toHaveTextContent('Jane Doe');
  });

  it('no profile header until the rights load', async () => {
    securityStore.setState({ rights: null });
    setFormFactor('tabletLandscape');
    await renderShell('responder');
    expect(screen.getByTestId('shell-nav-menu')).toBeTruthy();
    expect(screen.queryByTestId('shell-nav-profile')).toBeNull();
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

  // Responder's menu is the shared menu with its voice and stream buttons between the profile and the entries (legacy
  // Responder side menu); IC, Dispatch and BigBoard keep the plain menu (manifest `shell.sidebarContent: "menu"`).
  it("Responder's sidebar shows the registered member menu: the variant's nav with its actions above the entries", async () => {
    const received: SidebarContentProps[] = [];

    function MemberMenu(props: SidebarContentProps) {
      received.push(props);

      return <NavMenu {...props} actions={<Text testID="member-actions">voice</Text>} />;
    }

    registerSidebarContent('member-menu', MemberMenu);
    setFormFactor('tabletLandscape');
    await renderShell('responder');
    expect(received.at(-1)?.nav).toBe(nav);
    const menu = screen.getByTestId('shell-nav-menu');
    expect(within(screen.getByTestId('shell-nav-actions')).getByTestId('member-actions')).toBeTruthy();
    expect(within(menu).getAllByRole('menuitem').length).toBeGreaterThan(0);
  });

  // Sync state used to flash at the top of the screen on every queued write and connectivity blip: the app bar shows it
  // only once it has lasted, and only changes that need the user toast.
  describe('sync status', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      useToastStore.getState().clearToasts();
    });

    afterEach(() => {
      useToastStore.getState().clearToasts();
      jest.useRealTimers();
    });

    const waitForSettle = async () => {
      await act(async () => {
        jest.advanceTimersByTime(SYNC_NOTICE_DELAY_MS);
      });
    };

    it('shows "changes waiting" once the outbox has held them for a moment, as a link only when the variant has the storage screen', async () => {
      setShellState({ unsentChanges: 3 });
      await renderShell('dispatch');
      expect(screen.queryByTestId('shell-pending-changes')).toBeNull();

      await waitForSettle();
      expect(screen.getByTestId('shell-pending-changes')).toHaveTextContent('Changes waiting: 3');
      await fireEvent.press(screen.getByTestId('shell-pending-changes'));
      expect(router.push).not.toHaveBeenCalled();
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it('shows nothing for a write that sends before the delay', async () => {
      setShellState({ unsentChanges: 1 });
      await renderShell('responder');
      await act(async () => {
        jest.advanceTimersByTime(SYNC_NOTICE_DELAY_MS - 1);
        setShellState({ unsentChanges: 0 });
      });
      await waitForSettle();

      expect(screen.queryByTestId('shell-pending-changes')).toBeNull();
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it('shows offline in the app bar instead of a toast', async () => {
      setShellState({ isOffline: true });
      await renderShell('responder');
      await waitForSettle();
      expect(screen.getByTestId('shell-pending-changes')).toHaveTextContent('Offline');

      await act(async () => {
        setShellState({ unsentChanges: 2 });
      });
      expect(screen.getByTestId('shell-pending-changes')).toHaveTextContent('Offline: 2 waiting');
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    // Seen in the web app: reconnecting showed "Changes waiting: 1" for half a second while the queue drained.
    it('drops the offline chip on reconnect and shows "changes waiting" only if sending then takes a while', async () => {
      setShellState({ isOffline: true, unsentChanges: 1 });
      await renderShell('responder');
      await waitForSettle();
      expect(screen.getByTestId('shell-pending-changes')).toHaveTextContent('Offline: 1 waiting');

      await act(async () => {
        setShellState({ isOffline: false });
      });
      expect(screen.queryByTestId('shell-pending-changes')).toBeNull();

      await waitForSettle();
      expect(screen.getByTestId('shell-pending-changes')).toHaveTextContent('Changes waiting: 1');
    });

    it('toasts only for changes that need the user, and marks the app bar chip', async () => {
      setShellState({ unsentChanges: 1, changesNeedingAttention: 1 });
      await renderShell('unit');
      expect(useToastStore.getState().toasts).toHaveLength(0);

      await waitForSettle();
      expect(screen.getByTestId('shell-pending-changes')).toHaveTextContent('Needs attention: 1');
      expect(useToastStore.getState().toasts).toEqual([expect.objectContaining({ type: 'error', title: 'Changes not sent' })]);
    });
  });

  describe('notification bell', () => {
    beforeEach(() => {
      mockInboxStatus = 'loading';
      mockUseInboxUnreadCount.mockReturnValue(0);
      // The bell reads the badge counts store, which the inbox provider's one Novu subscription feeds.
      useBadgeCountsStore.setState({ unreadNotifications: 0 });
      setRouteContract(defineRoutes(['home', 'notifications']));
    });

    it('is absent where the variant has no inbox route (BigBoard)', async () => {
      setRouteContract(defineRoutes(['home']));
      mockInboxStatus = 'ready';
      await renderShell('bigboard');

      expect(screen.queryByTestId('shell-notifications-button')).toBeNull();
    });

    it('is absent where Novu is unavailable (web without the inbox, no department settings)', async () => {
      mockInboxStatus = 'unavailable';
      await renderShell('responder');

      expect(screen.queryByTestId('shell-notifications-button')).toBeNull();
    });

    it('shows without a count until the inbox is ready and opens the inbox', async () => {
      useBadgeCountsStore.setState({ unreadNotifications: 7 });
      await renderShell('responder');

      expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
      expect(screen.queryByTestId('shell-notifications-badge')).toBeNull();
      expect(mockUseInboxUnreadCount).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByTestId('shell-notifications-button'));

      expect(router.push).toHaveBeenCalledWith('/notifications');
    });

    it.each([
      ['unit', 5, '5'],
      ['ic', 1, '1'],
      ['dispatch', 120, '99+'],
    ] as const)('%s: shows the unread count once the inbox is ready', async (variant, count, shown) => {
      mockInboxStatus = 'ready';
      useBadgeCountsStore.setState({ unreadNotifications: count });
      await renderShell(variant);

      expect(screen.getByTestId('shell-notifications-badge')).toHaveTextContent(shown);
      expect(screen.getByRole('button', { name: `Notifications, ${count} unread` })).toBeTruthy();
    });

    // The Text primitive's 24px default line (text-base) ignored the badge's inline fontSize on native: in the 18px pill
    // the white digits sat below the red and read as cut off. The count pins a line that fits and the pill can grow.
    it('keeps the count on a line that fits inside its pill', async () => {
      mockInboxStatus = 'ready';
      useBadgeCountsStore.setState({ unreadNotifications: 120 });
      await renderShell('responder');

      const badge = screen.getByTestId('shell-notifications-badge');
      const pill = StyleSheet.flatten(badge.props.style);
      const digits = StyleSheet.flatten(within(badge).getByText('99+').props.style);

      expect(pill).toEqual(expect.objectContaining({ minHeight: 18 }));
      expect(pill.height).toBeUndefined();
      expect(digits).toEqual(expect.objectContaining({ fontSize: 11, lineHeight: 14 }));
    });

    it('hides the badge when nothing is unread and does not reopen the inbox from the inbox', async () => {
      mockInboxStatus = 'ready';
      mockNavigationState.pathname = '/notifications';
      await renderShell('responder');

      expect(screen.queryByTestId('shell-notifications-badge')).toBeNull();

      await fireEvent.press(screen.getByTestId('shell-notifications-button'));

      expect(router.push).not.toHaveBeenCalled();
    });
  });

  // Launch never puts a spinner over the app: on Android the session bootstrap's full-screen overlay sat over
  // Responder's status buttons for seconds on every cold start, and no one could set a status until it went. The chip that
  // replaced it still covered the top of the content (search fields, tab buttons), so it is a spinner in the app bar now,
  // just left of the bell. A quick bootstrap shows nothing at all (it only flashed).
  it('shows the session bootstrap as an app-bar spinner beside the bell once it takes a moment, with the screens usable underneath', async () => {
    jest.useFakeTimers();

    try {
      mockInboxStatus = 'loading';
      setRouteContract(defineRoutes(['home', 'notifications']));
      sessionInit.reset();
      await renderShell('responder');
      expect(screen.getByTestId('mock-stack')).toBeTruthy();
      expect(screen.queryByTestId('shell-init-loading')).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(SESSION_INIT_INDICATOR_DELAY_MS);
      });
      expect(screen.getByTestId('shell-init-loading').props.pointerEvents).toBe('none');
      expect(screen.getByRole('progressbar', { name: 'Loading…' })).toBeTruthy();
      expect(screen.queryByText('Loading…')).toBeNull();
      // In the app bar's actions, immediately before the bell — not laid over the content.
      const actions = within(screen.getByTestId('shell-header-actions'));
      expect(actions.getAllByTestId(/^shell-(init-loading|notifications-button)$/).map((node) => node.props.testID)).toEqual(['shell-init-loading', 'shell-notifications-button']);
      expect(screen.queryByTestId('shell-init-failed')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports a failed bootstrap in a banner under the app bar, and keeps it through automatic retries until a run succeeds', async () => {
    let attempts = 0;
    let finishRetry: () => void = () => undefined;

    const removeStep = sessionInit.register({
      id: 'test.flaky',
      run: () => {
        attempts += 1;

        if (attempts === 1) throw new Error('offline');

        return new Promise<void>((resolve) => {
          finishRetry = resolve;
        });
      },
    });

    try {
      sessionInit.reset();
      await sessionInit.run();
      await renderShell('dispatch');

      expect(screen.getByTestId('shell-init-failed')).toBeTruthy();
      expect(screen.getByTestId('shell-init-retry')).toBeTruthy();
      expect(screen.getByTestId('mock-stack')).toBeTruthy();
      expect(screen.queryByTestId('shell-init-loading')).toBeNull();

      // The automatic retry (attempt 2) keeps the banner: no flicker between it and the loading chip.
      let retry: Promise<unknown> = Promise.resolve();
      await act(async () => {
        retry = sessionInit.run();
      });
      expect(sessionInit.getStatus()).toMatchObject({ state: 'running', attempt: 2 });
      expect(screen.getByTestId('shell-init-failed')).toBeTruthy();
      expect(screen.getByTestId('shell-init-retry')).toBeDisabled();
      expect(screen.queryByTestId('shell-init-loading')).toBeNull();

      await act(async () => {
        finishRetry();
        await retry;
      });
      expect(screen.queryByTestId('shell-init-failed')).toBeNull();
      expect(screen.queryByTestId('shell-init-loading')).toBeNull();
    } finally {
      removeStep();
      await act(async () => {
        sessionInit.reset();
      });
    }
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
    await fireEvent.press(screen.getByTestId('shell-back-button'));
    expect(router.back).toHaveBeenCalled();
  });

  it.each<[string, boolean]>([
    ['the app bar shows back: the detail header leaves its own out', true],
    ['no history: the detail header keeps its back button', false],
  ])('one back button on a detail screen — %s', async (_case, canGoBack) => {
    mockNavigationState.pathname = '/settings/account-security';
    mockNavigationState.canGoBack = canGoBack;
    mockNavigationState.slot = <ScreenHeader title="Account security" onBack={jest.fn()} />;
    await renderShell('dispatch');
    expect(screen.queryByTestId('shell-back-button')).toEqual(canGoBack ? expect.anything() : null);
    expect(screen.queryByTestId('back-button')).toEqual(canGoBack ? null : expect.anything());
    expect(screen.getByRole('header', { name: 'Account security' })).toBeTruthy();
  });

  it("puts a detail screen's title and actions in the app bar instead of a second header row", async () => {
    mockNavigationState.pathname = '/call/12';
    mockNavigationState.canGoBack = true;
    mockNavigationState.slot = <ScreenHeader title="Call Details" onBack={jest.fn()} right={<Text testID="call-detail-menu-button">menu</Text>} />;
    await renderShell('dispatch');
    expect(screen.getByTestId('shell-header-title')).toHaveTextContent('Call Details');
    expect(within(screen.getByTestId('shell-header')).getByTestId('call-detail-menu-button')).toBeTruthy();
    expect(screen.queryByTestId('screen-header')).toBeNull();
    expect(screen.getAllByRole('header', { name: 'Call Details' })).toHaveLength(1);
  });
});

describe('resolveSidebarMode', () => {
  it.each<[VariantId, keyof typeof FORM_FACTORS, string]>([
    ['responder', 'phone', 'drawer'],
    ['responder', 'phoneLandscape', 'permanent'],
    ['unit', 'phoneLandscape', 'drawer'],
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

describe('permanentSidebarWidth', () => {
  it('is a quarter of the window, grown by the left inset it pads (a landscape phone notch)', () => {
    expect(permanentSidebarWidth(1180, 0)).toBe(295);
    expect(permanentSidebarWidth(844, 59)).toBe(270);
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
    await act(() => {
      useAuthStore.setState({ status: 'signedOut', accessToken: null, userId: null });
    });

    await renderShell('dispatch');
    expect(screen.getByTestId('shell-gate')).toBeTruthy();
    expect(mounted).not.toHaveBeenCalled();
  });
});

// Menu and tab counts (open calls, unread messages / chats / notifications, severe weather): drawn from the badge counts
// store, asked for by the shell for the entries it shows (the drawer's rows unmount when it closes).
describe('badge counts', () => {
  const badgeNav = defineNav([
    { id: 'map', href: '/', placement: 'tab', icon: MapIcon, labelKey: 'tabs.map', defaultLabel: 'Map' },
    { id: 'calls', href: '/calls', placement: 'tab', icon: MapIcon, labelKey: 'tabs.calls', defaultLabel: 'Calls', badge: 'calls' },
    { id: 'chat', href: '/chat', placement: 'sidebar', icon: MessageCircleIcon, labelKey: 'tabs.chat', defaultLabel: 'Chat', requiresFlag: 'Chat.System', badge: 'chats' },
    { id: 'notifications', href: '/notifications', placement: 'sidebar', labelKey: 'notifications.title', defaultLabel: 'Notifications', badge: 'notifications' },
    { id: 'settings', href: '/settings', placement: 'sidebar', icon: SettingsIcon, labelKey: 'tabs.settings', defaultLabel: 'Settings' },
  ]);

  const renderBadgeShell = async (variantId: VariantId) => {
    const Shell = createAppShell(activateVariant(variantId), { nav: badgeNav });
    await render(<Shell />);
    await act(async () => undefined);
  };

  beforeEach(async () => {
    resetMockNavigation();
    resetShellStateForTests();
    resetShellSlotsForTests();
    setRouteContract(defineRoutes(['home']));
    setShellState({ onboardingRequired: false });
    featureFlagsStore.setState({ flags: {} });
    terminologyStore.setState({ names: {} });
    useAuthStore.setState({ status: 'signedIn', accessToken: 'access', userId: 'user-1', authMethod: 'sso' });
    useBadgeCountsStore.setState({ counts: {}, wanted: [], unsupported: false, unreadNotifications: 0 });
    startupInit.reset();
    await startupInit.run();
    sessionInit.reset();
    await sessionInit.run();
    setFormFactor('tabletLandscape');
  });

  it('shows each menu entry its count, labelled with it, and none at zero', async () => {
    featureFlagsStore.setState({ flags: { 'Chat.System': { enabled: true } } });
    useBadgeCountsStore.setState({ counts: { chats: 4, calls: 0 }, unreadNotifications: 120 });
    // Responder keeps the menu as a permanent column on a landscape tablet.
    await renderBadgeShell('responder');

    expect(screen.getByTestId('nav-chat-badge')).toHaveTextContent('4');
    expect(screen.getByRole('menuitem', { name: 'Chat (4)' })).toBeTruthy();
    expect(screen.getByTestId('nav-notifications-badge')).toHaveTextContent('99+');
    expect(screen.queryByTestId('nav-calls-badge')).toBeNull();
    expect(screen.queryByTestId('nav-settings-badge')).toBeNull();
  });

  it('asks once the session is ready for the counts of the entries the app shows', async () => {
    const request = jest.spyOn(useBadgeCountsStore.getState(), 'requestBadgeCounts');
    await renderBadgeShell('dispatch');

    // Chat is hidden without Chat.System, so its count is not asked for.
    expect(request).toHaveBeenLastCalledWith(['calls', 'notifications'], { activeUnitId: null });

    featureFlagsStore.setState({ flags: { 'Chat.System': { enabled: true } } });
    await act(async () => undefined);
    expect(request).toHaveBeenLastCalledWith(['calls', 'chats', 'notifications'], { activeUnitId: null });
    request.mockRestore();
  });

  it('tabs (Unit): a tab shows its count on the tab bar', async () => {
    useBadgeCountsStore.setState({ counts: { calls: 3 } });
    await renderBadgeShell('unit');

    const calls = mockNavigationState.tabs?.screens.find((tab) => tab.name === 'calls');
    const map = mockNavigationState.tabs?.screens.find((tab) => tab.name === 'index');

    expect(calls?.options.tabBarBadge).toBe('3');
    expect(calls?.options.tabBarAccessibilityLabel).toBe('Calls (3)');
    expect(map?.options.tabBarBadge).toBeUndefined();
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
