import { getActiveVariant, type VariantId, type VariantManifest } from '@resgrid/config';

import { getOfflineLogger } from '../util/logger';
import { DurableKv } from './durable-kv';
import { type InstanceKeySource, type LegacyKeyProvider, type RekeyResult, rekeyToSecureKey, resolveInstanceKey } from './keys';
import { createDefaultKvBackendFactory, KV_PLATFORM } from './platform';
import { createExpoSecureKeyStore, type SecureKeyStore } from './secure-store';
import type { KvBackendFactory, KvPlatform } from './types';
import type { WebKeyLayout } from './web-backend';

export type StorageManifest = Pick<VariantManifest, 'id' | 'storage'>;

export interface OpenVariantStorageOptions {
  /** Defaults to `getActiveVariant()`. Only `id` and `storage` are read. */
  manifest?: StorageManifest;
  /** Legacy (frozen) key per instance id, from the build secret named by `storage.keySecret`. */
  getLegacyKey: LegacyKeyProvider;
  /** Defaults to expo-secure-store on native, none on web (web storage is never encrypted by MMKV). */
  secureStore?: SecureKeyStore | null;
  platform?: KvPlatform;
  backendFactory?: KvBackendFactory;
  /** Web key layout; defaults per variant (`defaultWebKeyLayout`). */
  webLayout?: WebKeyLayout;
  /** One-time re-key into a SecureStore-generated key (plan D8). Off by default until spike S4. */
  enableSecureRekey?: boolean;
  /** Instances to re-key when enabled; defaults to the main instance. */
  rekeyInstances?: readonly string[];
  generateKey?: () => string;
}

export interface VariantStorage {
  readonly main: DurableKv;
  /** Every instance by id, main included (frozen ids: `storage.mmkvId` + `storage.extraInstances`). */
  readonly instances: ReadonlyMap<string, DurableKv>;
  readonly keySources: Readonly<Record<string, InstanceKeySource>>;
  readonly rekey: readonly RekeyResult[];
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
 * Open the variant's MMKV instances with their frozen ids and keys (plan D8, §5.3.3). The ids and
 * keys are never derived or changed here — they come from the manifest and the build secret, so an
 * Omni build installed over today's store build reads the same files and keeps the user signed in.
 */
export async function openVariantStorage(options: OpenVariantStorageOptions): Promise<VariantStorage> {
  const manifest = options.manifest ?? getActiveVariant();
  const platform = options.platform ?? KV_PLATFORM;
  const backendFactory = options.backendFactory ?? createDefaultKvBackendFactory({ webLayout: options.webLayout ?? defaultWebKeyLayout(manifest.id) });
  const secureStore = options.secureStore === undefined ? (platform === 'native' ? createExpoSecureKeyStore() : null) : options.secureStore;
  const instanceIds = [manifest.storage.mmkvId, ...manifest.storage.extraInstances.filter((id) => id !== manifest.storage.mmkvId)];

  const instances = new Map<string, DurableKv>();
  const keySources: Record<string, InstanceKeySource> = {};
  const rekey: RekeyResult[] = [];
  const rekeyTargets = new Set(options.rekeyInstances ?? [manifest.storage.mmkvId]);

  for (const instanceId of instanceIds) {
    let encryptionKey: string | undefined;
    if (platform === 'native') {
      const state = await resolveInstanceKey({ instanceId, getLegacyKey: options.getLegacyKey, secureStore: secureStore ?? undefined, backendFactory });
      encryptionKey = state.key;
      keySources[instanceId] = state.source;
    } else {
      // Legacy web builds opened every instance without a key (react-native-mmkv web rejects one).
      keySources[instanceId] = 'none';
    }

    const backend = backendFactory({ id: instanceId, encryptionKey });

    if (options.enableSecureRekey && platform === 'native' && secureStore && rekeyTargets.has(instanceId) && keySources[instanceId] !== 'secure') {
      const result = await rekeyToSecureKey({ instanceId, backend, secureStore, backendFactory, generateKey: options.generateKey });
      rekey.push(result);
      if (result.status === 'rekeyed') keySources[instanceId] = 'secure';
    }

    instances.set(instanceId, new DurableKv(backend));
  }

  getOfflineLogger().info({ message: 'Durable storage opened', context: { variant: manifest.id, platform, instances: instanceIds.length, keySources } });

  const main = instances.get(manifest.storage.mmkvId) as DurableKv;
  return {
    main,
    instances,
    keySources,
    rekey,
    get: (instanceId) => {
      const kv = instances.get(instanceId);
      if (!kv) throw new Error(`Storage instance "${instanceId}" is not declared in the variant manifest.`);
      return kv;
    },
    all: () => Array.from(instances.values()),
  };
}
