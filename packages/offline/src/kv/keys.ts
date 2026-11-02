import type { StorageCarryOver } from '@resgrid/config';

import { generateRandomBytes } from '../util/ids';
import { getOfflineLogger } from '../util/logger';
import type { SecureKeyStore } from './secure-store';
import type { KvBackend, KvBackendFactory, KvStorageFiles } from './types';

/**
 * Device-key encryption (plan D8): every native MMKV instance is encrypted with a random key generated on the device
 * and kept in SecureStore (Keychain / Android Keystore). No key ships in the app or in a build secret.
 *
 * `secure`: the instance is open with its device key. `legacy` / `none`: a carried-over instance is still under the
 * legacy app's fixed key / no key and is re-keyed on this launch (`rekeyToSecureKey`).
 */
export type InstanceKeySource = 'secure' | 'legacy' | 'none';

export interface InstanceKeyState {
  key: string | undefined;
  source: InstanceKeySource;
  /** Set when a re-key interrupted by an app kill was completed on this launch. */
  recovered?: boolean;
  /** Set when the legacy app's own device key was adopted on this launch (`secure-store` carry-over). */
  adopted?: boolean;
  /** Set when the legacy app's file was deleted on this launch because the manifest does not carry it over. */
  reinitialized?: boolean;
}

export type RekeyStatus = 'rekeyed' | 'already-secure' | 'unsupported' | 'failed';

export interface RekeyResult {
  instanceId: string;
  status: RekeyStatus;
}

const KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** MMKV uses at most 16 bytes of an encryption key; longer keys are silently truncated natively. */
export const MMKV_KEY_LENGTH = 16;
/** Written before a re-key so a candidate key can be verified with a read-only open. */
export const KEY_SENTINEL_KEY = '__resgrid_key_check';
const KEY_SENTINEL_VALUE = 'v1';
const SIDECAR_STATE_KEY = 'state';

const safeName = (instanceId: string): string => instanceId.replace(/[^A-Za-z0-9._-]/g, '_');
export const secureKeyName = (instanceId: string): string => `resgrid.mmkv.${safeName(instanceId)}.key`;
export const pendingSecureKeyName = (instanceId: string): string => `resgrid.mmkv.${safeName(instanceId)}.pending`;
/** Unencrypted sidecar instance holding only the re-key state machine (no secrets). */
export const keySidecarId = (instanceId: string): string => `${instanceId}.keystate`;

/** 16 characters from a 64-symbol alphabet: 96 bits, within MMKV's 16-byte limit. */
export function generateMmkvKey(randomBytes: (count: number) => Uint8Array = generateRandomBytes): string {
  const bytes = randomBytes(MMKV_KEY_LENGTH);
  let key = '';
  for (let i = 0; i < MMKV_KEY_LENGTH; i++) {
    key += KEY_ALPHABET[bytes[i] & 63];
  }
  return key;
}

function verifyKey(factory: KvBackendFactory, instanceId: string, key: string): boolean {
  try {
    const probe = factory({ id: instanceId, encryptionKey: key, readOnly: true });
    return probe.getString(KEY_SENTINEL_KEY) === KEY_SENTINEL_VALUE;
  } catch {
    return false;
  }
}

/**
 * Decide which key opens an instance:
 * 1. its device key from SecureStore;
 * 2. for a `fixed-key` / `unencrypted` carry-over: a re-key that was interrupted after MMKV re-encrypted but before the
 *    key was promoted (the pending key, verified read-only when the kill happened inside `recrypt`), else the legacy
 *    key (or none) so the caller re-keys the file in place;
 * 3. for a `secure-store` carry-over: the legacy app's device key, adopted under the Omni name;
 * 4. otherwise a new device key. Anything the legacy app left under this id cannot be read with it, so that file is
 *    deleted first and the instance starts empty (the user signs in again).
 *
 * A SecureStore read that fails (Keychain locked before the first unlock) is thrown, never treated as "no key": that
 * would delete the user's data.
 */
export async function resolveInstanceKey(params: {
  instanceId: string;
  carryOver?: StorageCarryOver;
  secureStore: SecureKeyStore;
  backendFactory: KvBackendFactory;
  /** Null when the platform cannot tell whether a file exists; a carried-over instance is then re-keyed in place. */
  files: KvStorageFiles | null;
  generateKey?: () => string;
}): Promise<InstanceKeyState> {
  const { instanceId, carryOver, secureStore, backendFactory, files } = params;

  const active = await secureStore.getItem(secureKeyName(instanceId));
  if (active) {
    return { key: active, source: 'secure' };
  }

  if ((carryOver?.from === 'fixed-key' || carryOver?.from === 'unencrypted') && (!files || files.exists(instanceId))) {
    const sidecar = backendFactory({ id: keySidecarId(instanceId) });
    const state = sidecar.getString(SIDECAR_STATE_KEY);
    if (state === 'recrypted' || state === 'recrypting') {
      const pending = await secureStore.getItem(pendingSecureKeyName(instanceId));
      if (pending && (state === 'recrypted' || verifyKey(backendFactory, instanceId, pending))) {
        await secureStore.setItem(secureKeyName(instanceId), pending);
        await secureStore.deleteItem(pendingSecureKeyName(instanceId));
        sidecar.set(SIDECAR_STATE_KEY, 'done');
        getOfflineLogger().warn({ message: 'Completed an interrupted storage re-key', context: { instanceId, state } });
        return { key: pending, source: 'secure', recovered: true };
      }
      // The re-encryption never happened: the legacy key still opens the data.
      sidecar.delete(SIDECAR_STATE_KEY);
      if (pending) await secureStore.deleteItem(pendingSecureKeyName(instanceId));
    }
    const legacyKey = carryOver.from === 'fixed-key' ? carryOver.key : undefined;
    return { key: legacyKey, source: legacyKey ? 'legacy' : 'none' };
  }

  if (carryOver?.from === 'secure-store') {
    const legacyDeviceKey = await secureStore.getItem(carryOver.name);
    if (legacyDeviceKey) {
      await secureStore.setItem(secureKeyName(instanceId), legacyDeviceKey);
      await secureStore.deleteItem(carryOver.name).catch(() => undefined);
      getOfflineLogger().info({ message: "Adopted the legacy app's device storage key", context: { instanceId } });
      return { key: legacyDeviceKey, source: 'secure', adopted: true };
    }
  }

  const reinitialized = files ? files.exists(instanceId) && files.remove(instanceId) : false;
  const key = (params.generateKey ?? generateMmkvKey)();
  await secureStore.setItem(secureKeyName(instanceId), key);
  if (reinitialized) {
    getOfflineLogger().warn({ message: "Storage instance started over: the legacy app's data is not carried over", context: { instanceId } });
    return { key, source: 'secure', reinitialized: true };
  }
  return { key, source: 'secure' };
}

/**
 * One-time re-key of a carried-over instance from the legacy app's fixed key (or no key) to a device key (plan D8).
 *
 * Crash safety: pending key saved → sidecar `recrypting` → `recrypt()` → sidecar `recrypted` → key
 * promoted → sidecar `done`. `resolveInstanceKey()` finishes any step a kill interrupted.
 */
export async function rekeyToSecureKey(params: { instanceId: string; backend: KvBackend; secureStore: SecureKeyStore; backendFactory: KvBackendFactory; generateKey?: () => string }): Promise<RekeyResult> {
  const { instanceId, backend, secureStore, backendFactory } = params;
  if (!backend.recrypt) {
    return { instanceId, status: 'unsupported' };
  }
  if (await secureStore.getItem(secureKeyName(instanceId))) {
    return { instanceId, status: 'already-secure' };
  }

  const key = (params.generateKey ?? generateMmkvKey)();
  const sidecar = backendFactory({ id: keySidecarId(instanceId) });
  try {
    backend.set(KEY_SENTINEL_KEY, KEY_SENTINEL_VALUE);
    await secureStore.setItem(pendingSecureKeyName(instanceId), key);
    sidecar.set(SIDECAR_STATE_KEY, 'recrypting');
    backend.recrypt(key);
  } catch (error) {
    sidecar.delete(SIDECAR_STATE_KEY);
    await secureStore.deleteItem(pendingSecureKeyName(instanceId)).catch(() => undefined);
    getOfflineLogger().error({ message: 'Storage re-key failed; legacy key still in use', context: { instanceId, error: error instanceof Error ? error.name : typeof error } });
    return { instanceId, status: 'failed' };
  }

  sidecar.set(SIDECAR_STATE_KEY, 'recrypted');
  try {
    await secureStore.setItem(secureKeyName(instanceId), key);
    await secureStore.deleteItem(pendingSecureKeyName(instanceId));
    sidecar.set(SIDECAR_STATE_KEY, 'done');
  } catch {
    // The data is already under the new key and the pending key is saved: the next launch promotes it.
    getOfflineLogger().warn({ message: 'Storage re-key promotion deferred to next launch', context: { instanceId } });
  }
  getOfflineLogger().info({ message: 'Storage re-keyed to a device-generated key', context: { instanceId } });
  return { instanceId, status: 'rekeyed' };
}
