/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run before imports, so they require their stand-ins. */
import '../../settings/__tests__/test-setup';

import { getSettingsSections, resetSettingsSectionsForTests, type SettingsSectionContext } from '@resgrid/features/settings';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import { activateTestVariant } from '../../settings/__tests__/variant';
import { offlineMapsNav } from '../nav';
import { OFFLINE_MAPS_ROUTE_PATTERNS, offlineMapsRoutes } from '../routes';
import { configureOfflineMaps, resetOfflineMapsRuntimeForTests } from '../runtime';
import { OFFLINE_MAPS_SETTINGS_SECTION_ID, registerOfflineMapsSettings } from '../settings-section';
import { createFakeController, offlineState } from './fake-controller';

jest.mock('@resgrid/auth', () => require('../../auth-ui/__tests__/auth-fake').buildAuthMock(jest.requireActual('@resgrid/auth')));
jest.mock('@resgrid/voice', () => require('../../settings/__tests__/native-mocks').voiceModule());
jest.mock('@resgrid/notifications', () => require('../../settings/__tests__/native-mocks').notificationsModule());

const contextFor = (platform: string): SettingsSectionContext => {
  const manifest = activateTestVariant('responder');
  return { manifest, capabilities: manifest.capabilities, isAuthenticated: true, platform };
};
const ids = (platform = 'ios'): string[] => getSettingsSections(contextFor(platform)).map((section) => section.id);

let dispose: (() => void) | null = null;

beforeEach(() => {
  resetOfflineMapsRuntimeForTests();
  resetSettingsSectionsForTests();
});

afterEach(() => {
  dispose?.();
  dispose = null;
});

describe('registerOfflineMapsSettings', () => {
  it('shows the section only while offline maps are available, and never on web', () => {
    dispose = registerOfflineMapsSettings();
    expect(ids()).not.toContain(OFFLINE_MAPS_SETTINGS_SECTION_ID);

    const fake = createFakeController(offlineState({ availability: 'disabled' }));
    act(() => configureOfflineMaps({ controller: fake.controller }));
    expect(ids()).not.toContain(OFFLINE_MAPS_SETTINGS_SECTION_ID);

    act(() => fake.setState({ availability: 'available' }));
    expect(ids()).toContain(OFFLINE_MAPS_SETTINGS_SECTION_ID);
    expect(ids('web')).not.toContain(OFFLINE_MAPS_SETTINGS_SECTION_ID);

    act(() => fake.setState({ availability: 'disabled' }));
    expect(ids()).not.toContain(OFFLINE_MAPS_SETTINGS_SECTION_ID);
  });

  it('renders a row with the status and size that opens Settings → Offline maps', () => {
    const fake = createFakeController(offlineState({ isInstalled: true, updateAvailable: false, installedBytes: 5 * 1024 * 1024 }));
    configureOfflineMaps({ controller: fake.controller });
    dispose = registerOfflineMapsSettings();
    const section = getSettingsSections(contextFor('android')).find((entry) => entry.id === OFFLINE_MAPS_SETTINGS_SECTION_ID);
    if (!section) throw new Error('section missing');
    render(<>{section.render(contextFor('android'))}</>);
    const row = screen.getByTestId('settings-offline-maps');
    expect(row).toHaveTextContent(/offline_maps\.status\.up_to_date/);
    expect(row).toHaveTextContent(/5\.0 MB/);
    fireEvent.press(row);
    expect(router.push).toHaveBeenCalledWith('/settings/offline-maps');
  });

  it('removes the section on dispose', () => {
    configureOfflineMaps({ controller: createFakeController().controller });
    const stop = registerOfflineMapsSettings();
    expect(ids()).toContain(OFFLINE_MAPS_SETTINGS_SECTION_ID);
    stop();
    expect(ids()).not.toContain(OFFLINE_MAPS_SETTINGS_SECTION_ID);
  });
});

describe('routes and nav', () => {
  it('exposes the Settings → Offline maps route', () => {
    expect(offlineMapsRoutes.offlineMaps()).toBe(OFFLINE_MAPS_ROUTE_PATTERNS.offlineMaps);
    expect(offlineMapsNav).toEqual([expect.objectContaining({ id: 'offline-maps', href: '/settings/offline-maps', labelKey: 'offline_maps.title' })]);
  });
});
