import type { VariantId } from '@resgrid/config';

import { __getMmkvFile, __resetMmkvFake, __seedMmkvFile, mmkvConstructed } from '../../__tests__/fakes/mmkv';
import { readLegacyString } from '../contract-keys';
import { generateMmkvKey, KEY_SENTINEL_KEY, keySidecarId, MMKV_KEY_LENGTH, pendingSecureKeyName, resolveInstanceKey, secureKeyName } from '../keys';
import { createMmkvBackendFactory, createMmkvStorageFiles } from '../mmkv-backend';
import { defaultWebKeyLayout, openVariantStorage, type StorageManifest } from '../open-storage';
import { createMemorySecureKeyStore, type SecureKeyStore } from '../secure-store';

// Storage identity as declared in apps/omni/variants/*/variant.json (ids frozen, plan D8). Keys are fakes.
const RESPONDER_FIXED_KEY = 'legacy-responder';
const RESPONDER_QUEUE_KEY_NAME = 'OFFLINE_QUEUE_ENCRYPTION_KEY';
const MANIFESTS: Record<VariantId, StorageManifest> = {
  responder: {
    id: 'responder',
    storage: {
      mmkvId: 'ResgridResponder',
      extraInstances: ['checklists-ciphertext-v1', 'ResgridOfflineQueue'],
      carryOver: {
        ResgridResponder: { from: 'fixed-key', key: RESPONDER_FIXED_KEY },
        ResgridOfflineQueue: { from: 'secure-store', name: RESPONDER_QUEUE_KEY_NAME },
        'checklists-ciphertext-v1': { from: 'unencrypted' },
      },
    },
  },
  unit: { id: 'unit', storage: { mmkvId: 'ResgridUnit', extraInstances: ['checklists-ciphertext-v1'] } },
  ic: { id: 'ic', storage: { mmkvId: 'ResgridIC', extraInstances: [] } },
  dispatch: { id: 'dispatch', storage: { mmkvId: 'ResgridDispatch', extraInstances: ['auth-storage', 'security-storage'] } },
  bigboard: { id: 'bigboard', storage: { mmkvId: 'ResgridUnit', extraInstances: ['auth-storage', 'security-storage', 'mmkv.default'] } },
};

// The keys today's store builds open their files with (Dispatch's three keys are not supported: it starts over).
const LEGACY_KEYS: Record<string, string | undefined> = {
  ResgridUnit: 'legacy-unit',
  ResgridIC: 'legacy-ic',
  ResgridDispatch: 'legacy-dispatch',
  'auth-storage': 'legacy-auth',
  'security-storage': 'legacy-security',
  'checklists-ciphertext-v1': undefined,
  'mmkv.default': undefined,
};

const instanceIds = (manifest: StorageManifest): string[] => [manifest.storage.mmkvId, ...manifest.storage.extraInstances];

const open = (manifest: StorageManifest, secureStore: SecureKeyStore | null = createMemorySecureKeyStore(), generateKey?: () => string) =>
  openVariantStorage({ manifest, platform: 'native', secureStore, backendFactory: createMmkvBackendFactory(), files: createMmkvStorageFiles(), generateKey });

beforeEach(() => __resetMmkvFake());

describe('openVariantStorage — device keys (D8)', () => {
  it.each(Object.keys(MANIFESTS) as VariantId[])('%s opens every declared instance with its own device key on a fresh install', async (variant) => {
    const manifest = MANIFESTS[variant];
    const secureStore = createMemorySecureKeyStore();
    const storage = await open(manifest, secureStore);

    expect(Array.from(storage.instances.keys())).toEqual(instanceIds(manifest));
    const keys = new Set<string>();
    for (const id of instanceIds(manifest)) {
      const key = await secureStore.getItem(secureKeyName(id));
      expect(key).toHaveLength(MMKV_KEY_LENGTH);
      expect(__getMmkvFile(id)?.key).toBe(key);
      expect(storage.keySources[id]).toBe('secure');
      keys.add(key as string);
    }
    expect(keys.size).toBe(instanceIds(manifest).length);
    expect(storage.main.id).toBe(manifest.storage.mmkvId);
    expect(storage.rekey).toEqual([]);
    expect(storage.reinitialized).toEqual([]);
  });

  it('reopens with the same device key and keeps the data', async () => {
    const secureStore = createMemorySecureKeyStore();
    const first = await open(MANIFESTS.ic, secureStore);
    first.main.set('authResponse', '{"t":1}');

    mmkvConstructed.length = 0;
    const second = await open(MANIFESTS.ic, secureStore);
    expect(second.main.getJSON('authResponse')).toEqual({ t: 1 });
    expect(mmkvConstructed).toContainEqual({ id: 'ResgridIC', encryptionKey: await secureStore.getItem(secureKeyName('ResgridIC')), readOnly: undefined });
  });

  it.each(['unit', 'ic', 'dispatch', 'bigboard'] as VariantId[])('%s starts over on an upgrade: legacy files are deleted, never read', async (variant) => {
    const manifest = MANIFESTS[variant];
    for (const id of instanceIds(manifest)) {
      __seedMmkvFile(id, LEGACY_KEYS[id], { authResponse: '{"access_token":"x"}', IS_FIRST_TIME: false });
    }

    const storage = await open(manifest);

    expect(storage.reinitialized).toEqual(instanceIds(manifest));
    expect(storage.rekey).toEqual([]);
    for (const id of instanceIds(manifest)) {
      expect(storage.keySources[id]).toBe('secure');
      expect(storage.get(id).getJSON('authResponse')).toBeNull();
      expect(__getMmkvFile(id)?.key).not.toBe(LEGACY_KEYS[id]);
    }
    expect(mmkvConstructed.some((config) => config.encryptionKey !== undefined && Object.values(LEGACY_KEYS).includes(config.encryptionKey))).toBe(false);
  });

  it('never deletes data when SecureStore cannot be read (Keychain locked before the first unlock)', async () => {
    __seedMmkvFile('ResgridIC', 'DEVICEKEY0123456', { authResponse: '{}' });
    const locked: SecureKeyStore = {
      getItem: async () => {
        throw new Error('errSecInteractionNotAllowed');
      },
      setItem: async () => undefined,
      deleteItem: async () => undefined,
    };

    await expect(open(MANIFESTS.ic, locked)).rejects.toThrow('errSecInteractionNotAllowed');
    expect(__getMmkvFile('ResgridIC')?.data.size).toBe(1);
  });

  it('saves no new key when a legacy file cannot be deleted, so the next launch tries again', async () => {
    __seedMmkvFile('ResgridIC', LEGACY_KEYS.ResgridIC, { authResponse: '{}' });
    const secureStore = createMemorySecureKeyStore();
    const files = { exists: jest.fn(() => true), remove: jest.fn(() => false) };

    await expect(openVariantStorage({ manifest: MANIFESTS.ic, platform: 'native', secureStore, backendFactory: createMmkvBackendFactory(), files })).rejects.toThrow('ResgridIC');
    expect(files.remove).toHaveBeenCalledWith('ResgridIC');
    expect(await secureStore.getItem(secureKeyName('ResgridIC'))).toBeNull();
    expect(mmkvConstructed.some((config) => config.id === 'ResgridIC')).toBe(false);
  });

  it('refuses to open native storage without a secure key store', async () => {
    await expect(open(MANIFESTS.ic, null)).rejects.toThrow('secure key store');
  });

  it('throws for an instance the manifest does not declare', async () => {
    const storage = await open(MANIFESTS.ic);
    expect(() => storage.get('ResgridUnit')).toThrow();
    expect(storage.get('ResgridIC')).toBe(storage.main);
  });

  it('never encrypts or deletes on web and picks the legacy web key layout per variant', async () => {
    const factory = jest.fn(createMmkvBackendFactory());
    const files = { exists: jest.fn(() => true), remove: jest.fn(() => true) };
    const storage = await openVariantStorage({ manifest: MANIFESTS.dispatch, platform: 'web', backendFactory: factory, files });
    expect(factory.mock.calls.every(([config]) => config.encryptionKey === undefined)).toBe(true);
    expect(files.remove).not.toHaveBeenCalled();
    expect(Object.values(storage.keySources)).toEqual(['none', 'none', 'none']);
    expect(defaultWebKeyLayout('bigboard')).toBe('raw');
    expect(defaultWebKeyLayout('dispatch')).toBe('mmkv-prefixed');
  });

  it('generates 16-character keys (MMKV uses at most 16 bytes)', () => {
    const key = generateMmkvKey();
    expect(key).toHaveLength(MMKV_KEY_LENGTH);
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generateMmkvKey()).not.toBe(key);
  });
});

describe('Responder carry-over (storage.carryOver)', () => {
  const seedLegacyResponder = () => {
    __seedMmkvFile('ResgridResponder', RESPONDER_FIXED_KEY, {
      baseUrl: '"https://api.resgrid.com/api/v4"',
      IS_FIRST_TIME: false,
      SELECTED_THEME: 'dark',
      'auth-storage': '{"state":{"status":"signedIn"},"version":0}',
      authResponse: '{"access_token":"x"}',
    });
    __seedMmkvFile('ResgridOfflineQueue', 'legacy-device-key-64-hex', { queue: '[{"id":"q1"}]' });
    __seedMmkvFile('checklists-ciphertext-v1', undefined, { 'vault:1': 'ciphertext' });
    return createMemorySecureKeyStore({ [RESPONDER_QUEUE_KEY_NAME]: 'legacy-device-key-64-hex' });
  };

  it('re-keys the fixed-key and unencrypted files, adopts the queue device key and keeps every value', async () => {
    const secureStore = seedLegacyResponder();
    const storage = await open(MANIFESTS.responder, secureStore);

    expect(storage.rekey).toEqual([
      { instanceId: 'ResgridResponder', status: 'rekeyed' },
      { instanceId: 'checklists-ciphertext-v1', status: 'rekeyed' },
    ]);
    expect(storage.reinitialized).toEqual([]);
    expect(Object.values(storage.keySources)).toEqual(['secure', 'secure', 'secure']);

    const main = storage.main;
    expect(readLegacyString(main, 'baseUrl')).toBe('https://api.resgrid.com/api/v4');
    expect(main.getBoolean('IS_FIRST_TIME')).toBe(false);
    expect(main.getString('SELECTED_THEME')).toBe('dark');
    expect(main.getJSON('auth-storage')).toEqual({ state: { status: 'signedIn' }, version: 0 });
    expect(main.getJSON('authResponse')).toEqual({ access_token: 'x' });
    expect(storage.get('ResgridOfflineQueue').getJSON('queue')).toEqual([{ id: 'q1' }]);
    expect(storage.get('checklists-ciphertext-v1').getString('vault:1')).toBe('ciphertext');

    expect(__getMmkvFile('ResgridResponder')?.key).toBe(await secureStore.getItem(secureKeyName('ResgridResponder')));
    expect(__getMmkvFile('ResgridResponder')?.key).not.toBe(RESPONDER_FIXED_KEY);
    expect(__getMmkvFile('checklists-ciphertext-v1')?.key).toBe(await secureStore.getItem(secureKeyName('checklists-ciphertext-v1')));
    expect(await secureStore.getItem(secureKeyName('ResgridOfflineQueue'))).toBe('legacy-device-key-64-hex');
    expect(await secureStore.getItem(RESPONDER_QUEUE_KEY_NAME)).toBeNull();
  });

  it('opens with the device keys on the next launch without re-keying again', async () => {
    const secureStore = seedLegacyResponder();
    await open(MANIFESTS.responder, secureStore);

    const second = await open(MANIFESTS.responder, secureStore);
    expect(second.rekey).toEqual([]);
    expect(second.main.getJSON('authResponse')).toEqual({ access_token: 'x' });
    expect(second.get('ResgridOfflineQueue').getJSON('queue')).toEqual([{ id: 'q1' }]);
  });

  it('skips the re-key on a fresh install', async () => {
    const storage = await open(MANIFESTS.responder);
    expect(storage.rekey).toEqual([]);
    expect(mmkvConstructed.some((config) => config.encryptionKey === RESPONDER_FIXED_KEY)).toBe(false);
  });

  it('starts the queue over when the legacy device key is gone', async () => {
    seedLegacyResponder();
    const storage = await open(MANIFESTS.responder, createMemorySecureKeyStore());
    expect(storage.reinitialized).toEqual(['ResgridOfflineQueue']);
    expect(storage.get('ResgridOfflineQueue').getJSON('queue')).toBeNull();
    expect(storage.main.getJSON('authResponse')).toEqual({ access_token: 'x' });
  });

  it('completes a re-key killed after recrypt but before the key was promoted', async () => {
    __seedMmkvFile('ResgridResponder', 'PENDINGKEY012345', { authResponse: '{"t":2}', [KEY_SENTINEL_KEY]: 'v1' });
    __seedMmkvFile(keySidecarId('ResgridResponder'), undefined, { state: 'recrypted' });
    const secureStore = createMemorySecureKeyStore({ [pendingSecureKeyName('ResgridResponder')]: 'PENDINGKEY012345' });
    const storage = await open(MANIFESTS.responder, secureStore);
    expect(storage.keySources.ResgridResponder).toBe('secure');
    expect(storage.main.getJSON('authResponse')).toEqual({ t: 2 });
    expect(await secureStore.getItem(secureKeyName('ResgridResponder'))).toBe('PENDINGKEY012345');
  });

  it('verifies the pending key read-only when killed inside recrypt, without destroying data', async () => {
    __seedMmkvFile('ResgridResponder', 'PENDINGKEY012345', { authResponse: '{"t":3}', [KEY_SENTINEL_KEY]: 'v1' });
    __seedMmkvFile(keySidecarId('ResgridResponder'), undefined, { state: 'recrypting' });
    const secureStore = createMemorySecureKeyStore({ [pendingSecureKeyName('ResgridResponder')]: 'PENDINGKEY012345' });
    const state = await resolveInstanceKey({
      instanceId: 'ResgridResponder',
      carryOver: MANIFESTS.responder.storage.carryOver?.ResgridResponder,
      secureStore,
      backendFactory: createMmkvBackendFactory(),
      files: createMmkvStorageFiles(),
    });
    expect(state).toEqual({ key: 'PENDINGKEY012345', source: 'secure', recovered: true });
  });

  it('re-keys from the legacy key when the recrypt never happened', async () => {
    __seedMmkvFile('ResgridResponder', RESPONDER_FIXED_KEY, { authResponse: '{"t":4}', [KEY_SENTINEL_KEY]: 'v1' });
    __seedMmkvFile(keySidecarId('ResgridResponder'), undefined, { state: 'recrypting' });
    const secureStore = createMemorySecureKeyStore({ [pendingSecureKeyName('ResgridResponder')]: 'PENDINGKEY012345' });
    const storage = await open(MANIFESTS.responder, secureStore, () => 'NEWKEY0123456789');
    expect(storage.rekey[0]).toEqual({ instanceId: 'ResgridResponder', status: 'rekeyed' });
    expect(storage.main.getJSON('authResponse')).toEqual({ t: 4 });
    expect(__getMmkvFile('ResgridResponder')?.key).toBe('NEWKEY0123456789');
    expect(await secureStore.getItem(pendingSecureKeyName('ResgridResponder'))).toBeNull();
  });

  it('keeps the legacy key for this launch when the recrypt fails, and tries again on the next', async () => {
    __seedMmkvFile('ResgridResponder', RESPONDER_FIXED_KEY, { authResponse: '{}' });
    const failingFactory = (config: { id: string; encryptionKey?: string; readOnly?: boolean }) => {
      const backend = createMmkvBackendFactory()(config);
      return config.id === 'ResgridResponder'
        ? {
            ...backend,
            recrypt: () => {
              throw new Error('disk full');
            },
          }
        : backend;
    };
    const secureStore = createMemorySecureKeyStore();
    const storage = await openVariantStorage({ manifest: MANIFESTS.responder, platform: 'native', secureStore, backendFactory: failingFactory, files: createMmkvStorageFiles() });
    expect(storage.rekey).toContainEqual({ instanceId: 'ResgridResponder', status: 'failed' });
    expect(storage.keySources.ResgridResponder).toBe('legacy');
    expect(storage.main.getJSON('authResponse')).toEqual({});
    expect(await secureStore.getItem(pendingSecureKeyName('ResgridResponder'))).toBeNull();

    const retry = await open(MANIFESTS.responder, secureStore);
    expect(retry.rekey).toContainEqual({ instanceId: 'ResgridResponder', status: 'rekeyed' });
    expect(retry.main.getJSON('authResponse')).toEqual({});
  });
});
