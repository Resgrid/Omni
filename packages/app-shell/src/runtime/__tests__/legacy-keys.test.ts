import { createMemorySecureKeyStore } from '@resgrid/offline';

import { loadManifest } from '../../__tests__/helpers/variants';
import { createLegacyKeyProvider, legacyKeySecureStoreName, registerLegacyKeySource, resetLegacyKeySourcesForTests } from '../legacy-keys';

const manifest = loadManifest('dispatch');

describe('createLegacyKeyProvider', () => {
  afterEach(() => resetLegacyKeySourcesForTests());

  it('asks registered build-secret sources first, with the manifest key secret name', async () => {
    const source = jest.fn(async () => 'from-native-secret');
    registerLegacyKeySource(source);
    const getKey = createLegacyKeyProvider({ manifest, appEnv: 'production', secureStore: createMemorySecureKeyStore({ [legacyKeySecureStoreName('DISPATCH_MMKV_KEY')]: 'from-secure-store' }) });

    await expect(getKey('ResgridDispatch')).resolves.toBe('from-native-secret');
    expect(source).toHaveBeenCalledWith({ instanceId: 'ResgridDispatch', keySecret: 'DISPATCH_MMKV_KEY', variantId: 'dispatch' });
  });

  it('falls back to SecureStore (per-instance key first) when no source answers or one throws', async () => {
    registerLegacyKeySource(() => {
      throw new Error('module missing');
    });
    registerLegacyKeySource(() => null);
    const secureStore = createMemorySecureKeyStore({
      [legacyKeySecureStoreName('DISPATCH_MMKV_KEY')]: 'shared-key',
      [legacyKeySecureStoreName('DISPATCH_MMKV_KEY', 'auth-storage')]: 'auth-key',
    });
    const getKey = createLegacyKeyProvider({ manifest, appEnv: 'production', secureStore });

    await expect(getKey('auth-storage')).resolves.toBe('auth-key');
    await expect(getKey('ResgridDispatch')).resolves.toBe('shared-key');
  });

  it('reads extra.storageKeys only in development builds — never from a published manifest', async () => {
    const extra = { storageKeys: { DISPATCH_MMKV_KEY: 'dev-key' } };
    await expect(createLegacyKeyProvider({ manifest, appEnv: 'development', extra })('ResgridDispatch')).resolves.toBe('dev-key');
    for (const appEnv of ['staging', 'internal', 'production'] as const) {
      await expect(createLegacyKeyProvider({ manifest, appEnv, extra })('ResgridDispatch')).resolves.toBeUndefined();
    }
  });

  it('never returns a key for instances legacy builds opened unencrypted', async () => {
    registerLegacyKeySource(() => 'k');
    await expect(createLegacyKeyProvider({ manifest, appEnv: 'production', unencryptedInstances: ['mmkv.default'] })('mmkv.default')).resolves.toBeUndefined();
  });
});
