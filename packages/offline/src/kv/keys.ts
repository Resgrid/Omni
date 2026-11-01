import { generateRandomBytes } from '../util/ids';
import { getOfflineLogger } from '../util/logger';
import type { SecureKeyStore } from './secure-store';
import type { KvBackend, KvBackendFactory } from './types';

/**
 * Supplies an instance's legacy encryption key at runtime from the build secret (manifest
 * `storage.keySecret`, plan §5.3.1). Return undefined for instances legacy builds opened unencrypted.
 */
export type LegacyKeyProvider = (instanceId: string) => string | undefined | null | Promise<string | undefined | null>;

export type InstanceKeySource = 'secure' | 'legacy' | 'none';

export interface InstanceKeyState {
  key: string | undefined;
  source: InstanceKeySource;
  /** Set when a re-key interrupted by an app kill was completed on this launch. */
  recovered?: boolean;
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
 * 1. a SecureStore-generated key, once a re-key completed;
 * 2. a re-key that was interrupted after MMKV re-encrypted but before the key was promoted: the
 *    pending key (verified read-only when the kill happened inside `recrypt`);
 * 3. otherwise the frozen legacy key from the build secret (or none).
 */
export async function resolveInstanceKey(params: { instanceId: string; getLegacyKey: LegacyKeyProvider; secureStore?: SecureKeyStore; backendFactory: KvBackendFactory }): Promise<InstanceKeyState> {
  const { instanceId, getLegacyKey, secureStore, backendFactory } = params;
  const legacy = (await getLegacyKey(instanceId)) ?? undefined;
  if (!secureStore) {
    return { key: legacy, source: legacy ? 'legacy' : 'none' };
  }

  const active = await secureStore.getItem(secureKeyName(instanceId));
  if (active) {
    return { key: active, source: 'secure' };
  }

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

  return { key: legacy, source: legacy ? 'legacy' : 'none' };
}

/**
 * One-time re-key from the frozen legacy key to a SecureStore-generated key (plan D8). Behind a flag
 * and off by default until spike S4 proves it on devices.
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
