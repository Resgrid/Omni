import type { VariantId } from '@resgrid/config';

import { __getMmkvFile, __resetMmkvFake, __seedMmkvFile, mmkvConstructed } from '../../__tests__/fakes/mmkv';
import { readLegacyString } from '../contract-keys';
import { generateMmkvKey, KEY_SENTINEL_KEY, keySidecarId, MMKV_KEY_LENGTH, pendingSecureKeyName, resolveInstanceKey, secureKeyName } from '../keys';
import { createMmkvBackendFactory } from '../mmkv-backend';
import { defaultWebKeyLayout, openVariantStorage, type StorageManifest } from '../open-storage';
import { createMemorySecureKeyStore } from '../secure-store';

// Storage identity as declared in apps/omni/variants/*/variant.json (frozen, plan D8). Keys are fakes.
const MANIFESTS: Record<VariantId, StorageManifest> = {
  responder: { id: 'responder', storage: { mmkvId: 'ResgridResponder', keySecret: 'RESPONDER_MMKV_KEY', extraInstances: ['checklists-ciphertext-v1'] } },
  unit: { id: 'unit', storage: { mmkvId: 'ResgridUnit', keySecret: 'UNIT_MMKV_KEY', extraInstances: ['checklists-ciphertext-v1'] } },
  ic: { id: 'ic', storage: { mmkvId: 'ResgridIC', keySecret: 'IC_MMKV_KEY', extraInstances: [] } },
  dispatch: { id: 'dispatch', storage: { mmkvId: 'ResgridDispatch', keySecret: 'DISPATCH_MMKV_KEY', extraInstances: ['auth-storage', 'security-storage'] } },
  bigboard: { id: 'bigboard', storage: { mmkvId: 'ResgridUnit', keySecret: 'BIGBOARD_MMKV_KEY', extraInstances: ['auth-storage', 'security-storage', 'mmkv.default'] } },
};

const LEGACY_KEYS: Record<string, string | undefined> = {
  ResgridResponder: 'legacy-responder',
  ResgridUnit: 'legacy-unit',
  ResgridIC: 'legacy-ic',
  ResgridDispatch: 'legacy-dispatch',
  'auth-storage': 'legacy-auth',
  'security-storage': 'legacy-security',
  'checklists-ciphertext-v1': undefined,
  'mmkv.default': undefined,
};
const getLegacyKey = (instanceId: string): string | undefined => LEGACY_KEYS[instanceId];

beforeEach(() => __resetMmkvFake());

describe('openVariantStorage — frozen identity (D8)', () => {
  it.each(Object.keys(MANIFESTS) as VariantId[])('%s opens every declared instance with its legacy id and key', async (variant) => {
    const manifest = MANIFESTS[variant];
    const storage = await openVariantStorage({ manifest, getLegacyKey, platform: 'native', secureStore: createMemorySecureKeyStore(), backendFactory: createMmkvBackendFactory() });

    const expectedIds = [manifest.storage.mmkvId, ...manifest.storage.extraInstances];
    expect(Array.from(storage.instances.keys())).toEqual(expectedIds);
    for (const id of expectedIds) {
      expect(mmkvConstructed).toContainEqual({ id, encryptionKey: LEGACY_KEYS[id], readOnly: undefined });
      expect(storage.keySources[id]).toBe(LEGACY_KEYS[id] ? 'legacy' : 'none');
    }
    expect(storage.main.id).toBe(manifest.storage.mmkvId);
    expect(storage.rekey).toEqual([]);
  });

  it('keeps every contract key readable after an upgrade over the legacy build', async () => {
    __seedMmkvFile('ResgridUnit', 'legacy-unit', {
      baseUrl: '"https://api.resgrid.com/api/v4"',
      unitDeviceUuid: '"7f8a"',
      activeCallId: '"123"',
      activeUnitId: '"45"',
      IS_FIRST_TIME: false,
      SELECTED_THEME: 'dark',
      'auth-storage': '{"state":{"status":"signedIn"},"version":0}',
      'security-storage': '{"state":{},"version":0}',
      'core-storage': '{"state":{},"version":0}',
      api_cache_scope: '{"userId":"u1","departmentId":"1"}',
      'api_cache_x_/Units/GetAllUnits': '{"data":[],"timestamp":1,"expiresIn":1}',
      authResponse: '{"access_token":"x"}',
    });
    __seedMmkvFile('mmkv.default', undefined, { local: 'de' });

    const storage = await openVariantStorage({ manifest: MANIFESTS.unit, getLegacyKey, platform: 'native', secureStore: createMemorySecureKeyStore(), backendFactory: createMmkvBackendFactory() });
    const kv = storage.main;

    expect(readLegacyString(kv, 'baseUrl')).toBe('https://api.resgrid.com/api/v4');
    expect(readLegacyString(kv, 'unitDeviceUuid')).toBe('7f8a');
    expect(readLegacyString(kv, 'activeCallId')).toBe('123');
    expect(readLegacyString(kv, 'activeUnitId')).toBe('45');
    expect(kv.getBoolean('IS_FIRST_TIME')).toBe(false);
    expect(kv.getString('SELECTED_THEME')).toBe('dark');
    expect(kv.getJSON('auth-storage')).toEqual({ state: { status: 'signedIn' }, version: 0 });
    expect(kv.getJSON('security-storage')).not.toBeNull();
    expect(kv.getJSON('core-storage')).not.toBeNull();
    expect(kv.getJSON('api_cache_scope')).toEqual({ userId: 'u1', departmentId: '1' });
    expect(kv.keys().filter((key) => key.startsWith('api_cache_')).length).toBe(2);
    expect(kv.getJSON('authResponse')).toEqual({ access_token: 'x' });
  });

  it('would lose the data with any other key — which is why the key is never derived', async () => {
    __seedMmkvFile('ResgridIC', 'legacy-ic', { authResponse: '{}' });
    await openVariantStorage({ manifest: MANIFESTS.ic, getLegacyKey: () => 'not-the-key', platform: 'native', secureStore: null, backendFactory: createMmkvBackendFactory() });
    expect(__getMmkvFile('ResgridIC')?.data.size).toBe(0);
  });

  it('throws for an instance the manifest does not declare', async () => {
    const storage = await openVariantStorage({ manifest: MANIFESTS.ic, getLegacyKey, platform: 'native', secureStore: null, backendFactory: createMmkvBackendFactory() });
    expect(() => storage.get('ResgridUnit')).toThrow();
    expect(storage.get('ResgridIC')).toBe(storage.main);
  });

  it('never encrypts on web and picks the legacy web key layout per variant', async () => {
    const factory = jest.fn(createMmkvBackendFactory());
    const keyProvider = jest.fn(getLegacyKey);
    await openVariantStorage({ manifest: MANIFESTS.dispatch, getLegacyKey: keyProvider, platform: 'web', backendFactory: factory });
    expect(keyProvider).not.toHaveBeenCalled();
    expect(factory.mock.calls.every(([config]) => config.encryptionKey === undefined)).toBe(true);
    expect(defaultWebKeyLayout('bigboard')).toBe('raw');
    expect(defaultWebKeyLayout('dispatch')).toBe('mmkv-prefixed');
  });
});

describe('re-key to a SecureStore-generated key (flagged, off by default)', () => {
  const open = (secureStore = createMemorySecureKeyStore(), enableSecureRekey = false, generateKey?: () => string) =>
    openVariantStorage({ manifest: MANIFESTS.ic, getLegacyKey, platform: 'native', secureStore, backendFactory: createMmkvBackendFactory(), enableSecureRekey, generateKey });

  it('is not run unless enabled', async () => {
    const secureStore = createMemorySecureKeyStore();
    const storage = await open(secureStore);
    expect(storage.keySources.ResgridIC).toBe('legacy');
    expect(await secureStore.getItem(secureKeyName('ResgridIC'))).toBeNull();
  });

  it('re-encrypts in place, keeps the data and opens with the new key on the next launch', async () => {
    __seedMmkvFile('ResgridIC', 'legacy-ic', { authResponse: '{"t":1}' });
    const secureStore = createMemorySecureKeyStore();
    const first = await open(secureStore, true, () => 'NEWKEY0123456789');
    expect(first.rekey).toEqual([{ instanceId: 'ResgridIC', status: 'rekeyed' }]);
    expect(first.keySources.ResgridIC).toBe('secure');
    expect(__getMmkvFile('ResgridIC')?.key).toBe('NEWKEY0123456789');
    expect(await secureStore.getItem(secureKeyName('ResgridIC'))).toBe('NEWKEY0123456789');
    expect(await secureStore.getItem(pendingSecureKeyName('ResgridIC'))).toBeNull();

    mmkvConstructed.length = 0;
    const second = await open(secureStore, true);
    expect(second.keySources.ResgridIC).toBe('secure');
    expect(second.rekey).toEqual([]);
    expect(mmkvConstructed).toContainEqual({ id: 'ResgridIC', encryptionKey: 'NEWKEY0123456789', readOnly: undefined });
    expect(second.main.getJSON('authResponse')).toEqual({ t: 1 });
  });

  it('completes a re-key killed after recrypt but before the key was promoted', async () => {
    __seedMmkvFile('ResgridIC', 'PENDINGKEY012345', { authResponse: '{"t":2}', [KEY_SENTINEL_KEY]: 'v1' });
    __seedMmkvFile(keySidecarId('ResgridIC'), undefined, { state: 'recrypted' });
    const secureStore = createMemorySecureKeyStore({ [pendingSecureKeyName('ResgridIC')]: 'PENDINGKEY012345' });
    const storage = await open(secureStore);
    expect(storage.keySources.ResgridIC).toBe('secure');
    expect(storage.main.getJSON('authResponse')).toEqual({ t: 2 });
    expect(await secureStore.getItem(secureKeyName('ResgridIC'))).toBe('PENDINGKEY012345');
  });

  it('verifies the pending key read-only when killed inside recrypt, without destroying data', async () => {
    __seedMmkvFile('ResgridIC', 'PENDINGKEY012345', { authResponse: '{"t":3}', [KEY_SENTINEL_KEY]: 'v1' });
    __seedMmkvFile(keySidecarId('ResgridIC'), undefined, { state: 'recrypting' });
    const secureStore = createMemorySecureKeyStore({ [pendingSecureKeyName('ResgridIC')]: 'PENDINGKEY012345' });
    const state = await resolveInstanceKey({ instanceId: 'ResgridIC', getLegacyKey, secureStore, backendFactory: createMmkvBackendFactory() });
    expect(state).toEqual({ key: 'PENDINGKEY012345', source: 'secure', recovered: true });
  });

  it('falls back to the legacy key when the recrypt never happened', async () => {
    __seedMmkvFile('ResgridIC', 'legacy-ic', { authResponse: '{"t":4}', [KEY_SENTINEL_KEY]: 'v1' });
    __seedMmkvFile(keySidecarId('ResgridIC'), undefined, { state: 'recrypting' });
    const secureStore = createMemorySecureKeyStore({ [pendingSecureKeyName('ResgridIC')]: 'PENDINGKEY012345' });
    const storage = await open(secureStore);
    expect(storage.keySources.ResgridIC).toBe('legacy');
    expect(storage.main.getJSON('authResponse')).toEqual({ t: 4 });
    expect(await secureStore.getItem(pendingSecureKeyName('ResgridIC'))).toBeNull();
  });

  it('reports a failed recrypt and keeps the legacy key', async () => {
    __seedMmkvFile('ResgridIC', 'legacy-ic', { authResponse: '{}' });
    const failingFactory = (config: { id: string; encryptionKey?: string; readOnly?: boolean }) => {
      const backend = createMmkvBackendFactory()(config);
      return config.id === 'ResgridIC'
        ? {
            ...backend,
            recrypt: () => {
              throw new Error('disk full');
            },
          }
        : backend;
    };
    const secureStore = createMemorySecureKeyStore();
    const storage = await openVariantStorage({ manifest: MANIFESTS.ic, getLegacyKey, platform: 'native', secureStore, backendFactory: failingFactory, enableSecureRekey: true });
    expect(storage.rekey).toEqual([{ instanceId: 'ResgridIC', status: 'failed' }]);
    expect(storage.keySources.ResgridIC).toBe('legacy');
    expect(await secureStore.getItem(pendingSecureKeyName('ResgridIC'))).toBeNull();
  });

  it('generates 16-character keys (MMKV uses at most 16 bytes)', () => {
    const key = generateMmkvKey();
    expect(key).toHaveLength(MMKV_KEY_LENGTH);
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generateMmkvKey()).not.toBe(key);
  });
});
