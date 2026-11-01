/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run before imports, so they require their stand-ins. */
import './test-setup';

import { useUnitsStore } from '@resgrid/data';
import { createMemoryKvBackend, DurableKv } from '@resgrid/offline';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { fakeAuthStore, resetFakeAuth } from '../../auth-ui/__tests__/auth-fake';
import { setDevicePreferencesKv } from '../../auth-ui/lib/device-kv';
import { getLocationPreferences, getThemeMode } from '../lib/preferences';
import { registerSettingsSection, resetSettingsSectionsForTests } from '../registry';
import { configureSettings, resetSettingsRuntimeForTests } from '../runtime';
import { SettingsScreen } from '../screens/settings-screen';
import { mockRealtimeStore, mockSoundService, mockTransmitter } from './native-mocks';
import { activateTestVariant } from './variant';

jest.mock('@resgrid/auth', () => require('../../auth-ui/__tests__/auth-fake').buildAuthMock(jest.requireActual('@resgrid/auth')));
jest.mock('@resgrid/voice', () => require('./native-mocks').voiceModule());
jest.mock('@resgrid/notifications', () => require('./native-mocks').notificationsModule());
jest.mock('@resgrid/realtime', () => require('./native-mocks').realtimeModule());
jest.mock('@resgrid/location', () => require('./native-mocks').locationModule());
jest.mock('../../auth-ui/lib/api-context', () => ({ authUiApi: () => ({}), hasAuthUiApi: () => false }));

const sectionIds = (): string[] => screen.getAllByTestId(/^settings-section-/).map((node) => String(node.props.testID).replace('settings-section-', ''));

describe('SettingsScreen', () => {
  let kv: DurableKv;

  beforeEach(() => {
    resetFakeAuth();
    resetSettingsSectionsForTests();
    resetSettingsRuntimeForTests();
    fakeAuthStore.setState({ status: 'signedIn', accessToken: 'token' });
    kv = new DurableKv(createMemoryKvBackend('settings'));
    setDevicePreferencesKv(kv);
  });

  afterEach(() => setDevicePreferencesKv(undefined));

  it.each([
    ['unit', ['account', 'unit', 'preferences', 'notifications', 'location', 'voice', 'advanced', 'about', 'logout']],
    ['responder', ['account', 'preferences', 'notifications', 'location', 'voice', 'advanced', 'about', 'logout']],
    ['ic', ['account', 'preferences', 'notifications', 'voice', 'advanced', 'about', 'logout']],
    ['dispatch', ['account', 'preferences', 'notifications', 'voice', 'advanced', 'about', 'logout']],
    ['bigboard', ['account', 'preferences', 'notifications', 'advanced', 'about', 'logout']],
  ] as const)('shows the sections the %s capabilities allow', async (variant, expected) => {
    activateTestVariant(variant);
    await render(<SettingsScreen />);
    expect(sectionIds()).toEqual(expected);
  });

  it('hides the account, unit and sign-out sections when signed out', async () => {
    activateTestVariant('unit');
    fakeAuthStore.setState({ status: 'signedOut', accessToken: null });
    await render(<SettingsScreen />);
    expect(sectionIds()).toEqual(['preferences', 'notifications', 'location', 'voice', 'advanced', 'about']);
  });

  it('places a registered section by order and lets a variant replace a built-in one', async () => {
    activateTestVariant('dispatch');
    registerSettingsSection({ id: 'weather-sources', order: 35, title: 'weather_alerts.settings_title', render: () => <Text>Weather sources</Text>, visible: (context) => context.capabilities.weatherAlerts.admin });
    registerSettingsSection({ id: 'about', order: 90, title: 'settings.about', render: () => <Text>Custom about</Text> });
    registerSettingsSection({ id: 'hidden', order: 5, title: 'x', render: () => null, visible: () => false });
    await render(<SettingsScreen />);
    expect(sectionIds()).toEqual(['account', 'preferences', 'weather-sources', 'notifications', 'voice', 'advanced', 'about', 'logout']);
    expect(screen.getByText('Custom about')).toBeTruthy();
  });

  it('re-renders when a section registers after the screen mounted', async () => {
    activateTestVariant('bigboard');
    await render(<SettingsScreen />);
    await act(() => {
      registerSettingsSection({ id: 'widgets', order: 45, title: 'bigboard.widgets', render: () => <Text>Widgets</Text> });
    });
    expect(screen.getByText('Widgets')).toBeTruthy();
  });

  it('offers account rows by capability', async () => {
    activateTestVariant('responder');
    const { unmount } = await render(<SettingsScreen />);
    expect(screen.getByTestId('settings-account-security')).toBeTruthy();
    expect(screen.getByTestId('settings-approve-sign-in')).toBeTruthy();
    expect(screen.queryByTestId('settings-shared-device')).toBeNull();
    await unmount();

    activateTestVariant('unit');
    await render(<SettingsScreen />);
    expect(screen.getByTestId('settings-shared-device')).toBeTruthy();
    expect(screen.queryByTestId('settings-approve-sign-in')).toBeNull();
    await fireEvent.press(screen.getByTestId('settings-account-security'));
    expect(router.push).toHaveBeenCalledWith('/settings/account-security');
  });

  it('saves the navigation app choice for this device', async () => {
    activateTestVariant('unit');
    await render(<SettingsScreen />);
    expect(screen.getByTestId('settings-navigation-app')).toHaveTextContent(/settings\.navigation_app\.default/);
    await fireEvent.press(screen.getByTestId('settings-navigation-app'));
    await fireEvent.press(screen.getByTestId('navigation-app-sheet-option-waze'));
    expect(kv.getString('NAVIGATION_APP')).toBe('waze');
    expect(screen.getByTestId('settings-navigation-app')).toHaveTextContent(/settings\.navigation_app\.waze/);
  });

  it('saves the theme under the legacy key', async () => {
    activateTestVariant('responder');
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByTestId('settings-theme'));
    await fireEvent.press(screen.getByTestId('theme-sheet-option-dark'));
    expect(kv.getString('SELECTED_THEME')).toBe('dark');
    expect(getThemeMode()).toBe('dark');
  });

  it('turns realtime geolocation off and leaves the geolocation hub', async () => {
    activateTestVariant('unit');
    await render(<SettingsScreen />);
    const toggle = screen.getByTestId('settings-realtime-geolocation');
    expect(toggle.props.value).toBe(true);
    await fireEvent(toggle, 'onValueChange', false);
    await waitFor(() => expect(mockRealtimeStore.getState().disconnectGeolocationHub).toHaveBeenCalled());
    expect(getLocationPreferences().realtimeGeolocation).toBe(false);
  });

  it('keeps background geolocation off when "always" is not granted', async () => {
    activateTestVariant('responder');
    mockTransmitter.requestBackgroundTracking.mockResolvedValueOnce({ outcome: 'foreground-only', foreground: 'granted', background: 'denied' });
    await render(<SettingsScreen />);
    await fireEvent(screen.getByTestId('settings-background-geolocation'), 'onValueChange', true);
    expect(await screen.findByTestId('settings-location-message')).toHaveTextContent('settings.background_geolocation_denied');
    expect(getLocationPreferences().backgroundGeolocation).toBe(false);

    mockTransmitter.requestBackgroundTracking.mockResolvedValueOnce({ outcome: 'granted', foreground: 'granted', background: 'granted' });
    await fireEvent(screen.getByTestId('settings-background-geolocation'), 'onValueChange', true);
    await waitFor(() => expect(getLocationPreferences().backgroundGeolocation).toBe(true));
  });

  it('plays the modern alert sounds', async () => {
    activateTestVariant('unit');
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'settings.sounds.play [name=settings.sounds.call_emergency]' }));
    expect(mockSoundService.play).toHaveBeenCalledWith('moderncallemergency');
  });

  it('selects the active unit through the shell adapter', async () => {
    activateTestVariant('unit');
    const setActiveUnit = jest.fn(async () => undefined);
    configureSettings({ activeUnit: { useActiveUnitId: () => null, setActiveUnit } });
    useUnitsStore.setState({ units: [{ UnitId: '5', Name: 'Engine 5', Type: 'Engine' } as never], fetchedAt: { units: Date.now() } });
    await render(<SettingsScreen />);
    expect(screen.getByTestId('settings-active-unit')).toHaveTextContent(/settings\.none_selected/);
    await fireEvent.press(screen.getByTestId('settings-active-unit'));
    await fireEvent.press(screen.getByTestId('unit-item-5'));
    await waitFor(() => expect(setActiveUnit).toHaveBeenCalledWith('5'));
  });

  it('confirms before signing out', async () => {
    activateTestVariant('ic');
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByTestId('settings-logout'));
    const dialog = screen.getByTestId('logout-dialog');
    expect(within(dialog).getByText('settings.logout_confirm_message')).toBeTruthy();
    expect(fakeAuthStore.getState().logout).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('logout-dialog-confirm'));
    await waitFor(() => expect(fakeAuthStore.getState().logout).toHaveBeenCalledTimes(1));
  });

  it('shows the pending count on the Storage & sync entry and opens it', async () => {
    activateTestVariant('dispatch');
    const snapshot = {
      counts: { unsent: 3, pending: 3, processing: 0, failed: 0, dead: 0, stuck: 0, awaitingConfirmation: 0, held: 0, total: 3 },
      items: [],
      isDraining: false,
      lastDrainAt: null,
      lastDrainStatus: null,
      recentlyDropped: [],
      updatedAt: 1,
    };
    configureSettings({ storageSync: { storage: {} as never, outbox: { getSnapshot: () => snapshot, subscribe: () => () => undefined } as never } });
    await render(<SettingsScreen />);
    expect(screen.getByTestId('settings-storage-sync')).toHaveTextContent(/storage_sync\.pending_count \[count=3\]/);
    await fireEvent.press(screen.getByTestId('settings-storage-sync'));
    expect(router.push).toHaveBeenCalledWith('/settings/storage-sync');
  });
});
