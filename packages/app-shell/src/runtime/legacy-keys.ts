import type { AppEnv, VariantManifest } from '@resgrid/config';
import type { LegacyKeyProvider, SecureKeyStore } from '@resgrid/offline';

/**
 * Legacy MMKV encryption keys (plan D8, §5.3.1): today's store builds open their MMKV instances with a fixed key that
 * was committed in source. Omni must open the same files with the same key — but the key must not ship where anyone
 * can read it. In particular it must NOT go into `expo.extra`: `extra` is published in every EAS Update manifest and
 * in the web export, both of which are fetchable without signing in.
 *
 * `getLegacyKey(instanceId)` therefore asks a chain of sources, first answer wins:
 *
 * 1. **Registered build-secret sources** (`registerLegacyKeySource`) — the intended production source: a config plugin
 *    injects the secret named by `storage.keySecret` (e.g. `UNIT_MMKV_KEY`) into the native build (Android BuildConfig /
 *    iOS Info.plist) and a small native module reads it. NOT AVAILABLE YET (no native secrets module or config plugin exists).
 * 2. **SecureStore** under `resgrid.legacy-key.<keySecret>` (or `…<keySecret>.<instanceId>` for a per-instance key):
 *    lets a migration or provisioning step park the key in the Keychain/Keystore.
 * 3. **Development only:** `extra.storageKeys[<keySecret>]` when the build's APP_ENV is `development`, so local
 *    builds can exercise encrypted storage. Ignored (and never read) in staging/internal/production builds.
 *
 * With no answer the instance opens unencrypted — correct for a fresh install, but an upgrade over a legacy store build
 * would then not read the old (encrypted) session: that is the S4 upgrade test's job to prove before release.
 */
export type LegacyKeySource = (request: LegacyKeyRequest) => string | null | undefined | Promise<string | null | undefined>;

export interface LegacyKeyRequest {
  instanceId: string;
  /** The build secret's name from the manifest (`storage.keySecret`). */
  keySecret: string;
  variantId: VariantManifest['id'];
}

const registeredSources: LegacyKeySource[] = [];

/** Adds a build-secret source ahead of the built-in ones (the future native secrets module registers here). */
export function registerLegacyKeySource(source: LegacyKeySource): () => void {
  registeredSources.push(source);
  return () => {
    const index = registeredSources.indexOf(source);
    if (index >= 0) {
      registeredSources.splice(index, 1);
    }
  };
}

export const legacyKeySecureStoreName = (keySecret: string, instanceId?: string): string => `resgrid.legacy-key.${keySecret}${instanceId ? `.${instanceId.replace(/[^A-Za-z0-9._-]/g, '_')}` : ''}`;

export interface LegacyKeyProviderOptions {
  manifest: Pick<VariantManifest, 'id' | 'storage'>;
  appEnv: AppEnv;
  /** expo-secure-store adapter (native); null on web, where MMKV never encrypted anything. */
  secureStore?: SecureKeyStore | null;
  /** `Constants.expoConfig.extra` (only its `storageKeys` are read, and only in development builds). */
  extra?: unknown;
  /** Instances legacy builds opened without a key (BigBoard's default instance). */
  unencryptedInstances?: readonly string[];
}

const readDevExtraKey = (extra: unknown, keySecret: string): string | undefined => {
  if (typeof extra !== 'object' || extra === null) {
    return undefined;
  }
  const keys = (extra as { storageKeys?: unknown }).storageKeys;
  if (typeof keys !== 'object' || keys === null) {
    return undefined;
  }
  const value = (keys as Record<string, unknown>)[keySecret];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const nonEmpty = (value: string | null | undefined): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);

/** The `getLegacyKey` passed to `initOffline()`. Never logs or returns a key anywhere but to the storage layer. */
export function createLegacyKeyProvider(options: LegacyKeyProviderOptions): LegacyKeyProvider {
  const { manifest, appEnv } = options;
  const keySecret = manifest.storage.keySecret;
  const unencrypted = new Set(options.unencryptedInstances ?? []);

  return async (instanceId: string) => {
    if (unencrypted.has(instanceId)) {
      return undefined;
    }
    const request: LegacyKeyRequest = { instanceId, keySecret, variantId: manifest.id };

    for (const source of [...registeredSources]) {
      try {
        const key = nonEmpty(await source(request));
        if (key) {
          return key;
        }
      } catch {
        // A failing source must not block the others; the storage layer logs which key source opened each instance.
      }
    }

    if (options.secureStore) {
      try {
        const perInstance = nonEmpty(await options.secureStore.getItem(legacyKeySecureStoreName(keySecret, instanceId)));
        if (perInstance) {
          return perInstance;
        }
        const shared = nonEmpty(await options.secureStore.getItem(legacyKeySecureStoreName(keySecret)));
        if (shared) {
          return shared;
        }
      } catch {
        // Keychain unavailable (e.g. before first unlock): fall through.
      }
    }

    if (appEnv === 'development') {
      return readDevExtraKey(options.extra, keySecret);
    }
    return undefined;
  };
}

/** Test helper. Not for app code. */
export function resetLegacyKeySourcesForTests(): void {
  registeredSources.splice(0, registeredSources.length);
}
