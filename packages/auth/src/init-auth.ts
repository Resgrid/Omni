import type { ApiCache, ApiCachePolicy, ApiContext, HttpClient } from '@resgrid/api';
import type { Logger } from '@resgrid/core/logging/types';

import { setMobileTokenScopes } from './api/connect';
import { type AuthenticatedApiContext, createAuthenticatedApiContext } from './context/authenticated-api-context';
import { featureFlagsStore } from './flags/feature-flags-store';
import { applyPersonalLockAtLaunch, personalLockStore, setDefaultInactivityTimeout } from './personal-lock/personal-lock-store';
import { getActiveDepartmentId, securityStore } from './rights/security-store';
import type { DeviceLabelProvider } from './runtime/device-info';
import { setAuthLogger } from './runtime/logger';
import { setDevelopmentBuildForTests } from './runtime/platform';
import { applyApiCacheScope, type AuthServices, setAuthServices } from './runtime/services';
import { type AuthStorageBinding, bindAuthStorage } from './runtime/storage';
import { setTelemetryUserSetter, type TelemetryUserSetter } from './runtime/telemetry';
import { setDeviceLabelProvider } from './session/client-headers';
import { hydrateAuthSession } from './session/hydrate-session';
import { setDefaultApiUrl } from './session/server-url';
import { terminologyStore } from './terminology/terminology-store';

export interface InitAuthOptions {
  /** The variant's KV instances (`initOffline().storage` / `openVariantStorage()`). */
  storage: AuthStorageBinding;
  /** The build's default server, e.g. `${Env.BASE_API_URL}` (the `/api/v4` suffix is added when missing). */
  defaultServerUrl: string;
  /** `ScopeWiper.wipeScope` and the offline API cache (`initOffline()` provides both). */
  services?: AuthServices;
  /** The `@resgrid/core` logger (sanitizing; console + Sentry). */
  logger?: Logger;
  /** `setSentryUser` from `@resgrid/core` (only the opaque user id is ever sent). */
  setTelemetryUser?: TelemetryUserSetter;
  /** Request the `mobile` scope (iOS/Android; `Env.IS_MOBILE_APP`). */
  isMobileApp?: boolean;
  /** Overrides the device labels in `X-Resgrid-Device-*` (default expo-device / expo-application). */
  deviceLabels?: DeviceLabelProvider;
  /** API cache for the authenticated context's cached endpoints, and the per-variant policy. */
  apiCache?: ApiCache;
  cachePolicy?: ApiCachePolicy;
  /** Personal-lock default inactivity timeout (Dispatch `INACTIVITY_TIMEOUT_MINUTES`, default 60). */
  inactivityTimeoutMinutes?: number;
  /** Development build override (http to localhost); defaults to `__DEV__`. */
  developmentBuild?: boolean;
}

export interface AuthRuntime extends AuthenticatedApiContext {
  readonly context: ApiContext;
  readonly http: HttpClient;
}

/**
 * The app shell's one call (after `setActiveVariant()` and `initOffline()`): binds the frozen storage, wires the injected
 * logger/telemetry/wipe, builds the authenticated API context, rehydrates every auth store from its legacy key and
 * restores the session offline-safely. Rights, flags and terminology are then loaded by the signed-in bootstrap
 * (`loadSessionGates()`).
 */
export async function initAuth(options: InitAuthOptions): Promise<AuthRuntime> {
  if (options.logger) {
    setAuthLogger(options.logger);
  }
  if (options.setTelemetryUser) {
    setTelemetryUserSetter(options.setTelemetryUser);
  }
  if (options.developmentBuild !== undefined) {
    setDevelopmentBuildForTests(options.developmentBuild);
  }
  if (options.deviceLabels) {
    setDeviceLabelProvider(options.deviceLabels);
  }
  if (options.inactivityTimeoutMinutes !== undefined) {
    setDefaultInactivityTimeout(options.inactivityTimeoutMinutes);
  }
  setMobileTokenScopes(options.isMobileApp ?? false);
  setAuthServices(options.services ?? {});
  setDefaultApiUrl(options.defaultServerUrl);
  bindAuthStorage(options.storage);

  const api = createAuthenticatedApiContext({ cache: options.apiCache, cachePolicy: options.cachePolicy });

  // Stores that gate the UI come back first, so the session restore below already sees this identity's rights and lock.
  await Promise.all([securityStore.persist.rehydrate(), featureFlagsStore.persist.rehydrate(), terminologyStore.persist.rehydrate(), personalLockStore.persist.rehydrate()]);
  applyApiCacheScope({ departmentId: getActiveDepartmentId() });

  await hydrateAuthSession();
  applyPersonalLockAtLaunch();

  return api;
}
