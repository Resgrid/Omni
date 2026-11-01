import type { VariantId, VariantManifest } from '@resgrid/config';
import { createMemoryKvBackend, createMemorySecureKeyStore, DurableKv } from '@resgrid/offline';

import { resetClientIdCompatibility } from '../../api/connect';
import { createAuthenticatedApiContext } from '../../context/authenticated-api-context';
import { resetDataProtection } from '../../data-protection/grant-store';
import { resetFeatureFlags } from '../../flags/feature-flags-store';
import { resetPersonalLock } from '../../personal-lock/personal-lock-store';
import { resetSecurity } from '../../rights/security-store';
import { setAuthApiContext } from '../../runtime/api-context';
import { setDevelopmentBuildForTests } from '../../runtime/platform';
import { setAuthServices } from '../../runtime/services';
import { type AuthStorageBinding, bindAuthStorage } from '../../runtime/storage';
import { setTelemetryUserSetter } from '../../runtime/telemetry';
import { resetAuthStoreForTests } from '../../session/auth-store';
import { setDefaultApiUrl } from '../../session/server-url';
import { clearSignOutHooksForTests } from '../../session/sign-out-hooks';
import { resetSharedSessionControllerForTests } from '../../shared-session/shared-session-controller';
import { resetSharedSession } from '../../shared-session/shared-session-store';
import { setSamlStateStore } from '../../sso/saml';
import { terminologyStore } from '../../terminology/terminology-store';
import { FakeServer } from './fake-server';
import { activateVariant } from './variant';

export const DEFAULT_SERVER = 'https://api.resgrid.com';
export const DEFAULT_API_URL = `${DEFAULT_SERVER}/api/v4`;

export interface MemoryStorage extends AuthStorageBinding {
  readonly main: DurableKv;
  readonly instances: Map<string, DurableKv>;
  get(id: string): DurableKv;
  all(): DurableKv[];
}

/** The variant's KV instances (main + declared extras) in memory, optionally seeded as a legacy build left them. */
export function createMemoryStorage(manifest: VariantManifest, seed: Record<string, Record<string, string>> = {}): MemoryStorage {
  const ids = [manifest.storage.mmkvId, ...manifest.storage.extraInstances.filter((id) => id !== manifest.storage.mmkvId)];
  const instances = new Map<string, DurableKv>();
  for (const id of ids) {
    instances.set(id, new DurableKv(createMemoryKvBackend(id, seed[id])));
  }
  const main = instances.get(manifest.storage.mmkvId) as DurableKv;
  return {
    main,
    instances,
    get: (id) => instances.get(id) as DurableKv,
    all: () => Array.from(instances.values()),
  };
}

export interface Harness {
  manifest: VariantManifest;
  storage: MemoryStorage;
  server: FakeServer;
  wipeScope: jest.Mock<Promise<unknown>, [string]>;
  apiCache: { setScope: jest.Mock; reset: jest.Mock };
  telemetry: jest.Mock<void, [string | null]>;
}

/** Resets every module-level auth state between tests. */
export function resetAuthModules(): void {
  resetAuthStoreForTests();
  resetClientIdCompatibility();
  clearSignOutHooksForTests();
  resetSharedSession();
  resetSharedSessionControllerForTests();
  resetSecurity();
  resetFeatureFlags();
  terminologyStore.getState().reset();
  resetDataProtection();
  resetPersonalLock();
  setDevelopmentBuildForTests(null);
  setAuthApiContext(null);
}

/**
 * A signed-out app of one variant: its real manifest, in-memory storage (optionally seeded), injected wipe and API cache
 * mocks, the real authenticated API context and a scripted server behind it.
 */
export function setupHarness(variant: VariantId = 'unit', options: { seed?: Record<string, Record<string, string>>; patch?: (manifest: VariantManifest) => VariantManifest } = {}): Harness {
  resetAuthModules();
  const manifest = activateVariant(variant, options.patch);
  const storage = createMemoryStorage(manifest, options.seed);
  setDefaultApiUrl(DEFAULT_SERVER);
  bindAuthStorage(storage);
  const wipeScope = jest.fn<Promise<unknown>, [string]>(async () => undefined);
  const apiCache = { setScope: jest.fn(), reset: jest.fn() };
  setAuthServices({ wipeScope, apiCache });
  const telemetry = jest.fn<void, [string | null]>();
  setTelemetryUserSetter(telemetry);
  setSamlStateStore(createMemorySecureKeyStore());
  const { http } = createAuthenticatedApiContext();
  const server = new FakeServer(http);
  return { manifest, storage, server, wipeScope, apiCache, telemetry };
}

/** Lets pending promise callbacks (and zero-delay timers under real timers) run. */
export const flush = async (times = 5): Promise<void> => {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
};
