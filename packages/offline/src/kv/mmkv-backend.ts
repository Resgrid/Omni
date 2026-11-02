import { createMMKV } from 'react-native-mmkv';

import type { KvBackend, KvBackendConfig, KvBackendFactory } from './types';

/**
 * Native backend: one react-native-mmkv instance opened with the frozen id and key. react-native-mmkv 4 keeps v3's
 * storage (same root folder, AES-128 when a key is given), so the legacy files open unchanged.
 */
export function createMmkvBackend(config: KvBackendConfig): KvBackend {
  const instance = createMMKV({ id: config.id, encryptionKey: config.encryptionKey, readOnly: config.readOnly });
  return {
    id: config.id,
    getString: (key) => instance.getString(key),
    getNumber: (key) => instance.getNumber(key),
    getBoolean: (key) => instance.getBoolean(key),
    set: (key, value) => instance.set(key, value),
    delete: (key) => {
      instance.remove(key);
    },
    contains: (key) => instance.contains(key),
    getAllKeys: () => instance.getAllKeys(),
    clearAll: () => instance.clearAll(),
    recrypt: (key) => instance.recrypt(key),
    trim: () => instance.trim(),
  };
}

export const createMmkvBackendFactory = (): KvBackendFactory => createMmkvBackend;
