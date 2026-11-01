import * as SecureStore from 'expo-secure-store';

/** Where generated encryption keys live (Keychain / Android Keystore). Injected so tests run in Node. */
export interface SecureKeyStore {
  getItem(name: string): Promise<string | null>;
  setItem(name: string, value: string): Promise<void>;
  deleteItem(name: string): Promise<void>;
}

/**
 * expo-secure-store adapter. `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`: readable by background tasks
 * (location, push) after the first unlock, and never restored to another device from a backup —
 * offline data is excluded from device backups (plan §8.2).
 */
export function createExpoSecureKeyStore(): SecureKeyStore {
  const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
  return {
    getItem: (name) => SecureStore.getItemAsync(name, options),
    setItem: (name, value) => SecureStore.setItemAsync(name, value, options),
    deleteItem: (name) => SecureStore.deleteItemAsync(name, options),
  };
}

export function createMemorySecureKeyStore(initial?: Record<string, string>): SecureKeyStore {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: async (name) => data.get(name) ?? null,
    setItem: async (name, value) => {
      data.set(name, value);
    },
    deleteItem: async (name) => {
      data.delete(name);
    },
  };
}

/**
 * Responder's `getOrCreateSecureKey`, without its per-session fallback key: a key that is not saved
 * makes the data unreadable on the next launch, so a secure-store failure is thrown to the caller.
 */
export async function getOrCreateSecureKey(store: SecureKeyStore, name: string, generate: () => string): Promise<string> {
  const existing = await store.getItem(name);
  if (existing) return existing;
  const created = generate();
  await store.setItem(name, created);
  return created;
}
