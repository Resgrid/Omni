import { MMKV } from 'react-native-mmkv';

import type { KvBackend, KvBackendConfig, KvBackendFactory } from './types';

/** Native backend: one react-native-mmkv instance opened with the frozen id and key. */
export function createMmkvBackend(config: KvBackendConfig): KvBackend {
  const instance = new MMKV({ id: config.id, encryptionKey: config.encryptionKey, readOnly: config.readOnly });
  return {
    id: config.id,
    getString: (key) => instance.getString(key),
    getNumber: (key) => instance.getNumber(key),
    getBoolean: (key) => instance.getBoolean(key),
    set: (key, value) => instance.set(key, value),
    delete: (key) => instance.delete(key),
    contains: (key) => instance.contains(key),
    getAllKeys: () => instance.getAllKeys(),
    clearAll: () => instance.clearAll(),
    recrypt: (key) => instance.recrypt(key),
    trim: () => instance.trim(),
  };
}

export const createMmkvBackendFactory = (): KvBackendFactory => createMmkvBackend;
