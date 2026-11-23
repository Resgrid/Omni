// Permission flow ("when in use" then "always", rationale text) and the on-demand fix (ported from Responder
// src/services/__tests__/location-fix.test.ts, plus the browser path).
import { BROWSER_PROMPT_TIMEOUT_MS } from '@resgrid/core/lifecycle/foreground-timeout';
import { initI18n } from '@resgrid/i18n';

import { LOCATION_I18N_FALLBACKS, LOCATION_I18N_KEYS, translateOr } from '../i18n-keys';
import { acquireLocationFix, FIX_TIMEOUT_MS, getLocationFixErrorMessage } from '../location-fix';
import { getCurrentLocation, resetLocationStores } from '../location-store';
import { getLocationPermissionRationale, type LocationPermissionOutcome, PERMISSION_TIMEOUT_MS, requestBackgroundLocationPermission, runLocationPermissionFlow } from '../permissions';
import { resetSettingsDialogForTests } from '../settings-dialog';
import {
  __resetLocation,
  __setBackground,
  __setBackgroundAnswer,
  __setForeground,
  __setForegroundAnswer,
  type FakePermission,
  getCurrentPositionAsync,
  getLastKnownPositionAsync,
  hasServicesEnabledAsync,
  makeLocation,
  requestBackgroundPermissionsAsync,
  requestForegroundPermissionsAsync,
} from './fakes/expo-location';
import { __resetReactNative, __setAppState, Platform } from './fakes/react-native';
import { flushPromises, locationAccuracyDeclined } from './helpers';

const setNavigator = (value: unknown): void => {
  Object.defineProperty(globalThis, 'navigator', { value, writable: true, configurable: true });
};

const originalNavigator = globalThis.navigator;

beforeEach(() => {
  __resetReactNative();
  __resetLocation();
  resetLocationStores();
  resetSettingsDialogForTests();
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

  it('waits for an "Allow all the time" answer on Android\'s Settings page however long it takes', async () => {
    jest.useFakeTimers();
    Platform.OS = 'android';
    __setBackground('undetermined');
    let answerFromSettings: (answer: FakePermission) => void = () => undefined;
    requestBackgroundPermissionsAsync.mockImplementationOnce(
      () =>
        new Promise<FakePermission>((resolve) => {
          answerFromSettings = resolve;
        })
    );
    const pending = requestBackgroundLocationPermission();
    await flushPromises();

    // Settings covers the app: none of this counts toward the timeout.
    __setAppState('background');
    await jest.advanceTimersByTimeAsync(PERMISSION_TIMEOUT_MS * 4);

    __setAppState('active');
    answerFromSettings({ status: 'granted', granted: true, canAskAgain: true, expires: 'never' });
    expect(await pending).toEqual({ status: 'granted', canAskAgain: true });
  });

  it('counts a grant made in Settings while the request hung', async () => {
    jest.useFakeTimers();
    __setBackground('undetermined');
    requestBackgroundPermissionsAsync.mockImplementationOnce(() => new Promise(() => undefined));
    const pending = requestBackgroundLocationPermission();
    await flushPromises();

    __setBackground('granted');
    await jest.advanceTimersByTimeAsync(PERMISSION_TIMEOUT_MS);
    expect(await pending).toEqual({ status: 'granted', canAskAgain: true });
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

describe('browser location prompt (web, Electron)', () => {
  interface FakeCoords {
    latitude: number;
    longitude: number;
  }

  interface FakePosition {
    coords: FakeCoords;
    timestamp: number;
  }

  type PositionCallback = (position: FakePosition) => void;

  const promptStatus = { state: 'prompt', addEventListener: jest.fn(), removeEventListener: jest.fn() };
  let answerPrompt: PositionCallback | null = null;

  const getCurrentPosition = jest.fn((success: PositionCallback) => {
    answerPrompt = success;
  });

  interface FlowProgress {
    outcome: LocationPermissionOutcome | null;
  }

  const follow = (): FlowProgress => {
    const progress: FlowProgress = { outcome: null };
    void runLocationPermissionFlow({ background: false }).then((result) => {
      progress.outcome = result.outcome;
    });

    return progress;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    Platform.OS = 'web';
    answerPrompt = null;
    getCurrentPosition.mockClear();
    setNavigator({ geolocation: { watchPosition: jest.fn(), clearWatch: jest.fn(), getCurrentPosition }, permissions: { query: jest.fn(async () => promptStatus) } });
  });

  it('waits for a member who takes longer than the native limit to answer the prompt', async () => {
    const progress = follow();
    await jest.advanceTimersByTimeAsync(PERMISSION_TIMEOUT_MS + 15_000);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(progress.outcome).toBeNull();

    answerPrompt?.({ coords: { latitude: 1, longitude: 2 }, timestamp: 3 });
    await jest.advanceTimersByTimeAsync(0);
    expect(progress.outcome).toBe('granted');
  });

  it('still gives up on a prompt left unanswered, after BROWSER_PROMPT_TIMEOUT_MS', async () => {
    const progress = follow();
    await jest.advanceTimersByTimeAsync(BROWSER_PROMPT_TIMEOUT_MS - 1);
    expect(progress.outcome).toBeNull();

    await jest.advanceTimersByTimeAsync(1);
    expect(progress.outcome).toBe('blocked');
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

  it("opens the background text with Google Play's disclosure for whoever's position the app sends", () => {
    const english = (key: keyof typeof LOCATION_I18N_FALLBACKS): string => LOCATION_I18N_FALLBACKS[key].replace('{{appName}}', 'Resgrid');
    const howTo = english(LOCATION_I18N_KEYS.permissionBackgroundMessage);

    const person = getLocationPermissionRationale('background', { target: 'person' });
    expect(person.message).toBe(`${english(LOCATION_I18N_KEYS.permissionBackgroundDisclosurePerson)}\n\n${howTo}`);
    expect(person.message).toContain('collects location data');
    expect(person.message).toContain('even when the app is closed or not in use');
    expect(getLocationPermissionRationale('background').message).toBe(person.message);

    const unit = getLocationPermissionRationale('background', { target: 'unit' });
    expect(unit.message).toBe(`${english(LOCATION_I18N_KEYS.permissionBackgroundDisclosureUnit)}\n\n${howTo}`);
    expect(unit.message).toContain("this unit's position");
    expect(unit.message).toContain('even when the app is closed or not in use');
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

  it('takes the fix on device location once Location Accuracy is declined, and does not ask again (Android)', async () => {
    getCurrentPositionAsync.mockRejectedValueOnce(locationAccuracyDeclined());
    expect((await acquireLocationFix()).outcome).toBe('acquired');
    expect(getCurrentPositionAsync).toHaveBeenNthCalledWith(1, expect.objectContaining({ mayShowUserSettingsDialog: true }));
    expect(getCurrentPositionAsync).toHaveBeenNthCalledWith(2, expect.objectContaining({ mayShowUserSettingsDialog: false }));

    await acquireLocationFix();
    expect(getCurrentPositionAsync).toHaveBeenCalledTimes(3);
    expect(getCurrentPositionAsync).toHaveBeenLastCalledWith(expect.objectContaining({ mayShowUserSettingsDialog: false }));
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

describe('location permission fallbacks', () => {
  it('match the English common translations, so the disclosure reads the same before and after i18n starts', async () => {
    initI18n({ language: 'en', appName: 'Resgrid' });
    await flushPromises();
    const keys = Object.values(LOCATION_I18N_KEYS).filter((key) => key.startsWith('location.permission_'));
    expect(keys).toContain(LOCATION_I18N_KEYS.permissionBackgroundDisclosureUnit);

    for (const key of keys) expect(translateOr(key)).toBe(LOCATION_I18N_FALLBACKS[key].replace('{{appName}}', 'Resgrid'));
  });
});
