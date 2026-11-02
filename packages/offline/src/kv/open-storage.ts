import { getActiveVariant, type VariantId, type VariantManifest } from '@resgrid/config';

import { getOfflineLogger } from '../util/logger';
import { DurableKv } from './durable-kv';
import { type InstanceKeySource, type RekeyResult, rekeyToSecureKey, resolveInstanceKey } from './keys';
import { createDefaultKvBackendFactory, createDefaultKvStorageFiles, KV_PLATFORM } from './platform';
import { createExpoSecureKeyStore, type SecureKeyStore } from './secure-store';
import type { KvBackendFactory, KvPlatform, KvStorageFiles } from './types';
import type { WebKeyLayout } from './web-backend';

export type StorageManifest = Pick<VariantManifest, 'id' | 'storage'>;

export interface OpenVariantStorageOptions {
  /** Defaults to `getActiveVariant()`. Only `id` and `storage` are read. */
  manifest?: StorageManifest;
  /** Where device keys live. Defaults to expo-secure-store on native, none on web (web storage is never encrypted by MMKV). */
  secureStore?: SecureKeyStore | null;
  platform?: KvPlatform;
  backendFactory?: KvBackendFactory;
  /** Instance files on disk; defaults to MMKV's on native, none on web. */
  files?: KvStorageFiles | null;
  /** Web key layout; defaults per variant (`defaultWebKeyLayout`). */
  webLayout?: WebKeyLayout;
  generateKey?: () => string;
}

export interface VariantStorage {
  readonly main: DurableKv;
  /** Every instance by id, main included (frozen ids: `storage.mmkvId` + `storage.extraInstances`). */
  readonly instances: ReadonlyMap<string, DurableKv>;
  readonly keySources: Readonly<Record<string, InstanceKeySource>>;
  readonly rekey: readonly RekeyResult[];
  /** Instances whose legacy data was deleted on this launch because the manifest does not carry it over. */
  readonly reinitialized: readonly string[];
  get(instanceId: string): DurableKv;
  all(): DurableKv[];
}

/**
 * BigBoard's legacy web/Electron build wrote un-prefixed localStorage keys; every other app used
 * react-native-mmkv's web layout. Belongs in the manifest (`storage.webKeyLayout`) once config adds it.
 */
export function defaultWebKeyLayout(variantId: VariantId): WebKeyLayout {
  return variantId === 'bigboard' ? 'raw' : 'mmkv-prefixed';
}

/**
 * Open the variant's MMKV instances with their frozen ids (plan D8, §5.3.3). On native every instance is encrypted
 * with its own device key from SecureStore (`resolveInstanceKey`): the manifest's `storage.carryOver` decides which
 * legacy files are re-keyed or adopted on upgrade; any other legacy file is deleted and the instance starts empty.
 */
export async function openVariantStorage(options: OpenVariantStorageOptions = {}): Promise<VariantStorage> {
  const manifest = options.manifest ?? getActiveVariant();
  const platform = options.platform ?? KV_PLATFORM;
  const backendFactory = options.backendFactory ?? createDefaultKvBackendFactory({ webLayout: options.webLayout ?? defaultWebKeyLayout(manifest.id) });
  const secureStore = options.secureStore === undefined ? (platform === 'native' ? createExpoSecureKeyStore() : null) : options.secureStore;
  const files = options.files === undefined ? (platform === 'native' ? createDefaultKvStorageFiles() : null) : options.files;
  const instanceIds = [manifest.storage.mmkvId, ...manifest.storage.extraInstances.filter((id) => id !== manifest.storage.mmkvId)];
  const carryOver = manifest.storage.carryOver ?? {};

  if (platform === 'native' && !secureStore) {
    throw new Error('Native storage needs a secure key store: every MMKV instance is encrypted with a device key.');
  }

  const instances = new Map<string, DurableKv>();
  const keySources: Record<string, InstanceKeySource> = {};
  const rekey: RekeyResult[] = [];
  const reinitialized: string[] = [];

  for (const instanceId of instanceIds) {
    let encryptionKey: string | undefined;
    if (platform === 'native' && secureStore) {
      const state = await resolveInstanceKey({ instanceId, carryOver: carryOver[instanceId], secureStore, backendFactory, files, generateKey: options.generateKey });
      encryptionKey = state.key;
      keySources[instanceId] = state.source;
      if (state.reinitialized) reinitialized.push(instanceId);
    } else {
      // Legacy web builds opened every instance without a key (react-native-mmkv web rejects one).
      keySources[instanceId] = 'none';
    }

    const backend = backendFactory({ id: instanceId, encryptionKey });

    if (platform === 'native' && secureStore && keySources[instanceId] !== 'secure') {
      // A failed re-key leaves the instance on the legacy key for this launch; the next launch tries again.
      const result = await rekeyToSecureKey({ instanceId, backend, secureStore, backendFactory, generateKey: options.generateKey });
      rekey.push(result);
      if (result.status === 'rekeyed') keySources[instanceId] = 'secure';
    }

    instances.set(instanceId, new DurableKv(backend));
  }

  getOfflineLogger().info({ message: 'Durable storage opened', context: { variant: manifest.id, platform, instances: instanceIds.length, keySources, reinitialized } });

  const main = instances.get(manifest.storage.mmkvId) as DurableKv;
  return {
    main,
    instances,
    keySources,
    rekey,
    reinitialized,
    get: (instanceId) => {
      const kv = instances.get(instanceId);
      if (!kv) throw new Error(`Storage instance "${instanceId}" is not declared in the variant manifest.`);
      return kv;
    },
    all: () => Array.from(instances.values()),
  };
}
