import './test-setup';

import { createMemoryKvBackend, DurableKv } from '@resgrid/offline';
import { Linking } from 'react-native';

import { setDevicePreferencesKv } from '../../auth-ui/lib/device-kv';
import { ageParts, formatBytes } from '../lib/format';
import { getNavigationApp, getNavigationAppOptions, normalizeNavigationApp, setNavigationApp } from '../lib/navigation-app';
import { buildNavigationAttempts, openMapsWithDirections, toNavigationCoordinates } from '../lib/navigation-handoff';
import { getKeepAlivePreference, getLocationPreferences, getThemeMode, subscribePreferences } from '../lib/preferences';
import { activateTestVariant } from './variant';

const destination = (overrides: Partial<Parameters<typeof buildNavigationAttempts>[0]> = {}) => ({ coordinates: { latitude: '39.5', longitude: '-119.8' }, address: null, label: 'Station 1', origin: null, ...overrides });

describe('navigation app preference', () => {
  let kv: DurableKv;
  beforeEach(() => {
    kv = new DurableKv(createMemoryKvBackend('prefs'));
    setDevicePreferencesKv(kv);
  });
  afterEach(() => setDevicePreferencesKv(undefined));

  it('offers Apple Maps on iOS only and the outdoor apps on phones only', () => {
    expect(getNavigationAppOptions('ios')).toContain('apple_maps');
    expect(getNavigationAppOptions('android')).not.toContain('apple_maps');
    expect(getNavigationAppOptions('web')).toEqual(['default', 'google_maps', 'waze']);
    expect(getNavigationAppOptions('android')).toHaveLength(9);
  });

  it('normalizes unknown or unavailable stored values to the device default', () => {
    expect(normalizeNavigationApp('apple_maps', 'android')).toBe('default');
    expect(normalizeNavigationApp('bogus', 'ios')).toBe('default');
    expect(normalizeNavigationApp('osmand', 'android')).toBe('osmand');
  });

  it('persists under the frozen NAVIGATION_APP key, reading a value a legacy build wrote JSON-encoded too', () => {
    const listener = jest.fn();
    const unsubscribe = subscribePreferences(listener);
    setNavigationApp('waze');
    expect(kv.getString('NAVIGATION_APP')).toBe('waze');
    expect(getNavigationApp()).toBe('waze');
    expect(listener).toHaveBeenCalled();
    unsubscribe();

    kv.set('NAVIGATION_APP', '"google_maps"');
    expect(getNavigationApp()).toBe('google_maps');
  });
});

describe('navigation hand-off', () => {
  it('rejects unusable coordinates and the (0,0) sentinel, accepting a decimal comma', () => {
    expect(toNavigationCoordinates('0', '0')).toBeNull();
    expect(toNavigationCoordinates(91, 10)).toBeNull();
    expect(toNavigationCoordinates('50,8503', '4,3517')).toEqual({ latitude: '50.8503', longitude: '4.3517' });
  });

  it('builds the chain per app and platform, always ending at Google Maps on the web', () => {
    const android = buildNavigationAttempts(destination(), 'default', 'android');
    expect(android[0].url).toBe('geo:39.5,-119.8?q=39.5,-119.8(Station%201)');
    expect(android[android.length - 1].url).toContain('https://www.google.com/maps/dir/?api=1');

    const waze = buildNavigationAttempts(destination(), 'waze', 'ios');
    expect(waze[0]).toEqual({ url: 'waze://?ll=39.5,-119.8&navigate=yes', requiresInstalledApp: true });

    expect(buildNavigationAttempts(destination(), 'apple_maps', 'web')).toHaveLength(1);
    // Gaia GPS cannot take an address: the device default chain is used instead.
    expect(buildNavigationAttempts(destination({ coordinates: null, address: '1 Main St' }), 'gaia_gps', 'ios')[0].url).toContain('maps://maps.apple.com/?daddr=1%20Main%20St');
  });

  it('opens the first link that works and falls back to the address', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await expect(openMapsWithDirections(0, 0, 'Call', undefined, undefined, '1 Main St')).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledWith(expect.stringContaining('1%20Main%20St'));
    await expect(openMapsWithDirections(null, null)).resolves.toBe(false);
    openURL.mockRestore();
  });
});

describe('device preferences', () => {
  let kv: DurableKv;
  beforeEach(() => {
    kv = new DurableKv(createMemoryKvBackend('prefs'));
    setDevicePreferencesKv(kv);
  });
  afterEach(() => setDevicePreferencesKv(undefined));

  it('defaults Realtime Geolocation per variant (Unit on, Responder off) and Background off', () => {
    activateTestVariant('unit');
    expect(getLocationPreferences()).toEqual({ realtimeGeolocation: true, backgroundGeolocation: false });
    activateTestVariant('responder');
    expect(getLocationPreferences()).toEqual({ realtimeGeolocation: false, backgroundGeolocation: false });
    kv.set('REALTIME_GEOLOCATION_ENABLED', true);
    kv.set('BACKGROUND_GEOLOCATION_ENABLED', true);
    expect(getLocationPreferences()).toEqual({ realtimeGeolocation: true, backgroundGeolocation: true });
  });

  it('reads the legacy theme and keep-alive values', () => {
    expect(getThemeMode()).toBe('system');
    kv.set('SELECTED_THEME', 'dark');
    expect(getThemeMode()).toBe('dark');
    kv.set('SELECTED_THEME', 'neon');
    expect(getThemeMode()).toBe('system');
    expect(getKeepAlivePreference()).toBe(false);
    kv.set('KEEP_ALIVE_ENABLED', true);
    expect(getKeepAlivePreference()).toBe(true);
  });
});

describe('format', () => {
  it('formats sizes and ages', () => {
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
    expect(ageParts(10_000)).toEqual({ key: 'just_now', count: 0 });
    expect(ageParts(90 * 60_000)).toEqual({ key: 'hours', count: 1 });
    expect(ageParts(72 * 3_600_000)).toEqual({ key: 'days', count: 3 });
  });
});
