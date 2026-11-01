/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports, so they require their stand-ins. */
import { OfflineManager } from '@maplibre/maplibre-react-native';
import NetInfo from '@react-native-community/netinfo';

import { normalizePackPath } from '../file-store';
import { createExpoPackFileStore, createNetInfoNetworkProbe, setMaplibreAmbientCacheSize, toOfflineNetworkState } from '../native';
import { mockFs } from './fake-expo-file-system';

jest.mock('expo-file-system', () => require('./fake-expo-file-system'));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn() },
  NetInfoStateType: { unknown: 'unknown', none: 'none', cellular: 'cellular', wifi: 'wifi', bluetooth: 'bluetooth', ethernet: 'ethernet', wimax: 'wimax', vpn: 'vpn', other: 'other' },
}));
jest.mock('@maplibre/maplibre-react-native', () => ({ OfflineManager: { setMaximumAmbientCacheSize: jest.fn(async () => undefined) } }));

const ROOT = 'file:///docs/resgrid-offline-maps';

beforeEach(() => {
  mockFs.files.clear();
  mockFs.dirs.clear();
  mockFs.dirs.add('file:///docs');
});

describe('createExpoPackFileStore', () => {
  it('appends, reads, moves and removes files under the documents folder', async () => {
    const store = createExpoPackFileStore();
    if (!store) throw new Error('store expected on native');
    expect(store.uriFor('scope/files/a.pmtiles')).toBe(`${ROOT}/scope/files/a.pmtiles`);
    await expect(store.size('scope/tmp/a.part')).resolves.toBeNull();

    await store.append('scope/tmp/a.part', new Uint8Array([1, 2, 3]));
    await store.append('scope/tmp/a.part', new Uint8Array([4, 5]));
    await expect(store.size('scope/tmp/a.part')).resolves.toBe(5);
    await expect(store.read('scope/tmp/a.part', 1, 3)).resolves.toEqual(new Uint8Array([2, 3, 4]));

    await store.append('scope/files/a.pmtiles', new Uint8Array([9]));
    await store.move('scope/tmp/a.part', 'scope/files/a.pmtiles');
    await expect(store.size('scope/files/a.pmtiles')).resolves.toBe(5);
    await expect(store.size('scope/tmp/a.part')).resolves.toBeNull();

    await store.append('scope/files/style.json', new TextEncoder().encode('{"version":8}'));
    await expect(store.readText('scope/files/style.json')).resolves.toBe('{"version":8}');
    await expect(store.list('scope')).resolves.toEqual(expect.arrayContaining([{ name: 'files', isDirectory: true }]));
    await expect(store.directorySize('')).resolves.toBe(5 + 13);

    await store.remove('scope/files/style.json');
    await expect(store.size('scope/files/style.json')).resolves.toBeNull();
    await store.remove('scope');
    await expect(store.directorySize('')).resolves.toBe(0);
    await expect(store.list('missing')).resolves.toEqual([]);
    await expect(store.diskSpace()).resolves.toEqual({ freeBytes: 5_000, totalBytes: 50_000 });
  });

  it('refuses paths that climb out of the root', () => {
    expect(() => normalizePackPath('../secrets')).toThrow();
    expect(normalizePackPath('/a//b/./c')).toBe('a/b/c');
  });
});

describe('NetInfo probe', () => {
  it('maps Wi-Fi, metered and missing networks', async () => {
    expect(toOfflineNetworkState({ type: 'wifi', isConnected: true, isInternetReachable: true, details: { isConnectionExpensive: false } } as never)).toEqual({ isConnected: true, isUnmetered: true, isExpensive: false });
    expect(toOfflineNetworkState({ type: 'wifi', isConnected: true, isInternetReachable: null, details: { isConnectionExpensive: true } } as never)).toEqual({ isConnected: true, isUnmetered: true, isExpensive: true });
    expect(toOfflineNetworkState({ type: 'cellular', isConnected: true, isInternetReachable: true, details: { isConnectionExpensive: false } } as never)).toEqual({
      isConnected: true,
      isUnmetered: false,
      isExpensive: true,
    });
    expect(toOfflineNetworkState({ type: 'none', isConnected: false, isInternetReachable: false, details: null } as never)).toEqual({ isConnected: false, isUnmetered: false, isExpensive: false });

    (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ type: 'ethernet', isConnected: true, isInternetReachable: true, details: { isConnectionExpensive: false } });
    await expect(createNetInfoNetworkProbe().getState()).resolves.toEqual({ isConnected: true, isUnmetered: true, isExpensive: false });
  });
});

describe('ambient cache', () => {
  it('sets the MapLibre ambient cache budget', async () => {
    await setMaplibreAmbientCacheSize(1234);
    expect(OfflineManager.setMaximumAmbientCacheSize).toHaveBeenCalledWith(1234);
  });
});
