// Permission flow ("when in use" then "always", rationale text) and the on-demand fix (ported from Responder
// src/services/__tests__/location-fix.test.ts, plus the browser path).
import { initI18n } from '@resgrid/i18n';

import { LOCATION_I18N_FALLBACKS, LOCATION_I18N_KEYS } from '../i18n-keys';
import { acquireLocationFix, FIX_TIMEOUT_MS, getLocationFixErrorMessage } from '../location-fix';
import { getCurrentLocation, resetLocationStores } from '../location-store';
import { getLocationPermissionRationale, PERMISSION_TIMEOUT_MS, requestBackgroundLocationPermission, runLocationPermissionFlow } from '../permissions';
import {
  __resetLocation,
  __setBackground,
  __setBackgroundAnswer,
  __setForeground,
  __setForegroundAnswer,
  getCurrentPositionAsync,
  getLastKnownPositionAsync,
  hasServicesEnabledAsync,
  makeLocation,
  requestBackgroundPermissionsAsync,
  requestForegroundPermissionsAsync,
} from './fakes/expo-location';
import { __resetReactNative, Platform } from './fakes/react-native';
import { flushPromises } from './helpers';

const setNavigator = (value: unknown): void => {
  Object.defineProperty(globalThis, 'navigator', { value, writable: true, configurable: true });
};
const originalNavigator = globalThis.navigator;

beforeEach(() => {
  __resetReactNative();
  __resetLocation();
  resetLocationStores();
});

afterEach(() => {
  jest.useRealTimers();
  setNavigator(originalNavigator);
});

describe('runLocationPermissionFlow', () => {
  it('asks "when in use" first, then "always"', async () => {
    __setForeground('undetermined');
    __setBackground('undetermined');
    const result = await runLocationPermissionFlow({ background: true });
    expect(result.outcome).toBe('granted');
    expect(requestForegroundPermissionsAsync.mock.invocationCallOrder[0]).toBeLessThan(requestBackgroundPermissionsAsync.mock.invocationCallOrder[0]);
  });

  it('never asks for "always" before "when in use" is granted', async () => {
    __setForeground('undetermined');
    __setForegroundAnswer('denied', true);
    const result = await runLocationPermissionFlow({ background: true });
    expect(result.outcome).toBe('denied');
    expect(requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    expect(await requestBackgroundLocationPermission()).toEqual({ status: 'denied', canAskAgain: true });
    expect(requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('reports blocked, without prompting, once the OS will not ask again', async () => {
    __setForeground('denied', false);
    expect((await runLocationPermissionFlow({ background: false })).outcome).toBe('blocked');
    expect(requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('reports foreground-only when "always" is refused', async () => {
    __setBackground('undetermined');
    __setBackgroundAnswer('denied');
    expect((await runLocationPermissionFlow({ background: true })).outcome).toBe('foreground-only');
  });

  it('only reads the grants without prompt', async () => {
    __setForeground('undetermined');
    const result = await runLocationPermissionFlow({ background: true, prompt: false });
    expect(result.outcome).toBe('denied');
    expect(requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('reports a request that never settles as denied instead of hanging (Responder)', async () => {
    jest.useFakeTimers();
    __setForeground('undetermined');
    requestForegroundPermissionsAsync.mockImplementationOnce(() => new Promise(() => undefined));
    const pending = runLocationPermissionFlow({ background: false });
    await flushPromises();
    await jest.advanceTimersByTimeAsync(PERMISSION_TIMEOUT_MS);
    expect((await pending).outcome).toBe('blocked');
  });

  it('is unsupported on a browser without geolocation, and foreground-only on web for "always"', async () => {
    Platform.OS = 'web';
    setNavigator({});
    expect((await runLocationPermissionFlow({ background: true })).outcome).toBe('unsupported');

    setNavigator({ geolocation: { watchPosition: jest.fn(), clearWatch: jest.fn(), getCurrentPosition: jest.fn() }, permissions: { query: jest.fn(async () => ({ state: 'granted' })) } });
    expect((await runLocationPermissionFlow({ background: true })).outcome).toBe('foreground-only');
  });

  it('triggers the browser prompt with a position request when undecided', async () => {
    Platform.OS = 'web';
    const getCurrentPosition = jest.fn((success: (position: unknown) => void) => success({ coords: { latitude: 1, longitude: 2 }, timestamp: 3 }));
    setNavigator({ geolocation: { watchPosition: jest.fn(), clearWatch: jest.fn(), getCurrentPosition }, permissions: { query: jest.fn(async () => ({ state: 'prompt' })) } });
    expect((await runLocationPermissionFlow({ background: false })).outcome).toBe('granted');
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});

describe('getLocationPermissionRationale', () => {
  it('explains each step with the English fallbacks before i18n is initialised', () => {
    expect(getLocationPermissionRationale('foreground')).toEqual({
      title: 'Allow location access',
      message: LOCATION_I18N_FALLBACKS[LOCATION_I18N_KEYS.permissionForegroundMessage].replace('{{appName}}', 'Resgrid'),
      confirmLabel: 'Continue',
      cancelLabel: 'Not now',
    });
    expect(getLocationPermissionRationale('background').title).toBe('Allow location all the time');
    expect(getLocationPermissionRationale('blocked').confirmLabel).toBe('Open Settings');
  });
});

describe('acquireLocationFix', () => {
  it('returns the live fix and feeds it to the location store', async () => {
    getCurrentPositionAsync.mockResolvedValueOnce(makeLocation({ latitude: 1, longitude: 2 }, 5));
    const result = await acquireLocationFix();
    expect(result.outcome).toBe('acquired');
    expect(result.location?.coords).toMatchObject({ latitude: 1, longitude: 2 });
    expect(getCurrentLocation()).toMatchObject({ latitude: 1, source: 'on-demand' });
  });

  it('prompts for permission when it has not been decided yet', async () => {
    __setForeground('undetermined');
    expect((await acquireLocationFix()).outcome).toBe('acquired');
    expect(requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('reports permission-denied without re-prompting once the user has hard-denied', async () => {
    __setForeground('denied', false);
    expect((await acquireLocationFix()).outcome).toBe('permission-denied');
    expect(requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('distinguishes location services being switched off from a missing fix', async () => {
    hasServicesEnabledAsync.mockResolvedValueOnce(false);
    expect((await acquireLocationFix()).outcome).toBe('services-disabled');
  });

  it('falls back to a recent cached fix when the live one fails', async () => {
    getCurrentPositionAsync.mockRejectedValueOnce(new Error('timeout'));
    getLastKnownPositionAsync.mockResolvedValueOnce(makeLocation({ latitude: 9 }, 1));
    const result = await acquireLocationFix();
    expect(result).toMatchObject({ outcome: 'acquired', location: { coords: { latitude: 9 } } });
  });

  it('reports unavailable when neither a live nor a cached fix can be had', async () => {
    getCurrentPositionAsync.mockRejectedValueOnce(new Error('timeout'));
    expect((await acquireLocationFix()).outcome).toBe('unavailable');
  });

  it('gives up on a live fix that never settles rather than hanging the submission', async () => {
    jest.useFakeTimers();
    getCurrentPositionAsync.mockImplementationOnce(() => new Promise(() => undefined));
    getLastKnownPositionAsync.mockResolvedValueOnce(makeLocation({ latitude: 8 }, 1));
    const pending = acquireLocationFix();
    await flushPromises();
    await jest.advanceTimersByTimeAsync(FIX_TIMEOUT_MS);
    expect(await pending).toMatchObject({ outcome: 'acquired', location: { coords: { latitude: 8 } } });
  });

  it('continues past a services check that throws rather than blocking on it', async () => {
    hasServicesEnabledAsync.mockRejectedValueOnce(new Error('nope'));
    expect((await acquireLocationFix()).outcome).toBe('acquired');
  });

  it('uses browser geolocation on web', async () => {
    Platform.OS = 'web';
    setNavigator({
      geolocation: { watchPosition: jest.fn(), clearWatch: jest.fn(), getCurrentPosition: (success: (position: unknown) => void) => success({ coords: { latitude: 4, longitude: 5, accuracy: 30 }, timestamp: 6 }) },
    });
    expect(await acquireLocationFix()).toMatchObject({ outcome: 'acquired', location: { coords: { latitude: 4, longitude: 5, accuracy: 30 }, timestamp: 6 } });

    setNavigator({ geolocation: { watchPosition: jest.fn(), clearWatch: jest.fn(), getCurrentPosition: (_success: unknown, error: (e: unknown) => void) => error({ code: 1, message: 'denied' }) } });
    expect((await acquireLocationFix()).outcome).toBe('permission-denied');
  });
});

describe('getLocationFixErrorMessage', () => {
  it('falls back to English when translations are not loaded, rather than showing the key', () => {
    expect(getLocationFixErrorMessage('services-disabled')).toBe(LOCATION_I18N_FALLBACKS['location.fix_services_disabled']);
  });

  it('uses the common translation once i18n is initialised', async () => {
    initI18n({ language: 'de' });
    await flushPromises();
    const message = getLocationFixErrorMessage('permission-denied');
    expect(message).not.toBe('location.fix_permission_denied');
    expect(message).not.toBe(LOCATION_I18N_FALLBACKS['location.fix_permission_denied']);
  });
});
