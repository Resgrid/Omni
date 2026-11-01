import { type ApiCachePolicy, getConfig } from '@resgrid/api';
import {
  clientHeaders,
  enforceAppAccess,
  FeatureFlagKeys,
  getActiveDepartmentId,
  getBaseApiUrl,
  initAuth,
  isFeatureEnabled,
  loadSessionGates,
  registerSharedSessionRealtimeControls,
  registerSignOutHook,
  useAuthStore,
} from '@resgrid/auth';
import type { VariantManifest } from '@resgrid/config';
import { getEnv, initSentry, logger, setSentryUser } from '@resgrid/core';
import { configureData, refreshDataWorkingSet } from '@resgrid/data';
import { initI18n, isSupportedLanguage, LEGACY_LANGUAGE_STORAGE_KEY } from '@resgrid/i18n';
import { configureLocation, type LocationSettings } from '@resgrid/location';
import { configureNotifications, pushNotificationService, type WebPushFirebaseConfig } from '@resgrid/notifications';
import { apiCacheTtlFromManifest, CONTRACT_KEYS, createExpoSecureKeyStore, defaultResetRegistry, initOffline, KV_PLATFORM, type OfflineRuntime, readLegacyString } from '@resgrid/offline';
import { configureRealtime, teardownRealtime, useRealtimeStore } from '@resgrid/realtime';
import { configureVoice, initializeVoice, registerVoiceResets } from '@resgrid/voice';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';

import { registerNavigationWithSentry } from '../deep-links/navigation';
import { resolveNotificationRoute } from '../routes/notification-routes';
import { createApiCacheBridge } from '../runtime/api-cache-bridge';
import { createLegacyKeyProvider } from '../runtime/legacy-keys';
import { getOrCreateDeviceUuid, isThemeMode, readStoredBoolean } from '../runtime/preferences';
import { getShellRuntime, requireApiContext, requireOfflineRuntime, setShellRuntime } from '../runtime/runtime-holder';
import { getActiveUnitId, getNotificationsSession, getSessionScope, getSessionUserId, isSessionSignedIn } from '../runtime/session';
import type { AppShellConfig } from '../runtime/shell-config';
import { getShellState, resetShellSessionState, setShellState } from '../runtime/shell-state';
import type { AppInit, InitStep } from './create-app-init';

/** Legacy device-preference keys (Responder `lib/storage`), read as MMKV booleans. */
export const REALTIME_GEOLOCATION_KEY = 'REALTIME_GEOLOCATION_ENABLED';
export const BACKGROUND_GEOLOCATION_KEY = 'BACKGROUND_GEOLOCATION_ENABLED';

/** BigBoard's dashboard/widget stores used react-native-mmkv's default instance without a key. */
const UNENCRYPTED_LEGACY_INSTANCES = ['mmkv.default'] as const;

const webPushConfigFromDepartment = (): WebPushFirebaseConfig | null => {
  const config = getShellState().departmentConfig;
  if (!config?.WebPushApiKey || !config.WebPushProjectId || !config.WebPushMessagingSenderId || !config.WebPushAppId || !config.WebPushVapidKey) {
    return null;
  }
  return {
    apiKey: config.WebPushApiKey,
    authDomain: config.WebPushAuthDomain,
    projectId: config.WebPushProjectId,
    messagingSenderId: config.WebPushMessagingSenderId,
    appId: config.WebPushAppId,
    vapidKey: config.WebPushVapidKey,
  };
};

/** Per-variant cache TTL policy (IC keeps cached data far longer than the others). */
const cachePolicyFor = (manifest: VariantManifest): ApiCachePolicy => {
  const variantTtl = apiCacheTtlFromManifest(manifest.offline);
  return { ttlMs: (_path, defaultTtl) => (manifest.offline.cacheTtl === 'long' ? Math.max(defaultTtl, variantTtl) : defaultTtl) };
};

/** Loads `Config/GetConfig` for the signed-in department (EventingUrl, Novu, web push, location thresholds). */
export async function loadDepartmentConfig(): Promise<void> {
  try {
    const result = await getConfig(requireApiContext(), { key: getEnv().APP_KEY || undefined });
    if (result?.Data) {
      setShellState({ departmentConfig: result.Data });
    }
  } catch (error) {
    // Keeps whatever config is already loaded; realtime and the inbox wait for the next attempt.
    logger.warn({ message: 'Department config could not be loaded', context: { error } });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Startup phase

function wireOfflineStatus(runtime: OfflineRuntime): void {
  const update = (): void => {
    const online = runtime.connectivity?.isOnline() ?? true;
    setShellState({ isOffline: !online, unsentChanges: runtime.outbox.getSnapshot().counts.unsent });
  };
  update();
  runtime.outbox.subscribe(update);
  let wasOffline = !(runtime.connectivity?.isOnline() ?? true);
  runtime.connectivity?.subscribe((online) => {
    update();
    // Reconnect sequence (plan §8.4): refresh auth → pull deltas → drain the outbox → resume realtime.
    if (online && wasOffline && isSessionSignedIn()) {
      void runtime.sync.onReconnect().catch((error: unknown) => logger.warn({ message: 'Reconnect sequence failed', context: { error } }));
    }
    wasOffline = !online;
  });
}

let registrationDisposers: (() => void)[] | null = null;

/** Wipe/teardown hooks: run on every sign-out, department switch and server switch (the offline wiper drives them). */
function registerTeardowns(): void {
  if (registrationDisposers) {
    return;
  }
  registrationDisposers = [
    // Sockets are torn down while the outgoing tokens are still valid (teardowns run first in the wipe).
    defaultResetRegistry.registerTeardown('realtime', () => teardownRealtime()),
    registerVoiceResets(defaultResetRegistry),
    // Takes this device's push token off the server AS the ending session, before any server switch writes the new URL
    // (switchServer signs out first, then changes the server).
    registerSignOutHook(({ accessToken }) => pushNotificationService.unregisterAtSignOut(accessToken)),
    defaultResetRegistry.registerTeardown('notifications', () => pushNotificationService.clearLocalState()),
    defaultResetRegistry.registerStoreReset('app-shell.session', () => resetShellSessionState()),
  ];
  registerSharedSessionRealtimeControls({ stop: () => useRealtimeStore.getState().disconnectAll(), resume: () => useRealtimeStore.getState().connectAll() });
}

export function createStartupSteps(config: AppShellConfig): InitStep[] {
  const manifest = config.variant;
  return [
    {
      id: 'startup.sentry',
      optional: true,
      run: () => {
        initSentry();
        registerNavigationWithSentry();
      },
    },
    {
      id: 'startup.i18n',
      run: () => {
        // configureAppShell already initialised translations before the first render (device language); this keeps the
        // step order explicit and idempotent. The stored choice is applied once storage is open (startup.preferences).
        initI18n({ variantResources: config.i18nResources });
      },
    },
    {
      id: 'startup.offline',
      run: async () => {
        if (getShellRuntime().offline) {
          return;
        }
        const secureStore = KV_PLATFORM === 'native' ? createExpoSecureKeyStore() : null;
        const runtime = await initOffline({
          manifest,
          getLegacyKey: createLegacyKeyProvider({ manifest, appEnv: getEnv().APP_ENV, secureStore, extra: Constants.expoConfig?.extra, unencryptedInstances: UNENCRYPTED_LEGACY_INSTANCES }),
          getScope: getSessionScope,
          logger,
          storageManager: { signOut: () => useAuthStore.getState().logout(undefined, 'logout') },
        });
        setShellRuntime({ offline: runtime });
        wireOfflineStatus(runtime);
      },
    },
    {
      id: 'startup.preferences',
      run: () => {
        const main = requireOfflineRuntime().storage.main;
        const language = readLegacyString(main, LEGACY_LANGUAGE_STORAGE_KEY);
        if (language && isSupportedLanguage(language)) {
          initI18n({ language, variantResources: config.i18nResources });
        }
        const theme = readLegacyString(main, CONTRACT_KEYS.selectedTheme);
        setShellState({ themeMode: isThemeMode(theme) ? theme : 'system', onboardingRequired: readStoredBoolean(main, CONTRACT_KEYS.isFirstTime) !== false });
      },
    },
    {
      id: 'startup.auth',
      run: async () => {
        if (getShellRuntime().auth) {
          return;
        }
        const offline = requireOfflineRuntime();
        const env = getEnv();
        const auth = await initAuth({
          storage: offline.storage,
          defaultServerUrl: env.BASE_API_URL,
          services: { wipeScope: (reason) => offline.wiper.wipeScope(reason), apiCache: offline.apiCache },
          logger,
          setTelemetryUser: setSentryUser,
          isMobileApp: env.IS_MOBILE_APP,
          apiCache: createApiCacheBridge(offline.apiCache),
          cachePolicy: cachePolicyFor(manifest),
        });
        setShellRuntime({ auth });
      },
    },
    {
      id: 'startup.packages',
      run: async () => {
        const offline = requireOfflineRuntime();
        const auth = getShellRuntime().auth;
        if (!auth) {
          throw new Error('Auth is not initialized.');
        }
        const main = offline.storage.main;

        await configureData({ manifest, api: auth.context, getSession: getSessionScope, outbox: offline.outbox, storage: main, sync: offline.sync, logger });

        configureRealtime({
          getAccessToken: () => useAuthStore.getState().accessToken,
          refreshAccessToken: () => useAuthStore.getState().refreshAccessToken(),
          getEventingUrl: () => getShellState().departmentConfig?.EventingUrl || null,
          getDepartmentId: () => getActiveDepartmentId(),
          connectivity: offline.connectivity,
          isRealtimeGeolocationEnabled: () => readStoredBoolean(main, REALTIME_GEOLOCATION_KEY) ?? null,
          isChatEnabled: () => isFeatureEnabled(FeatureFlagKeys.ChatSystem),
        });

        configureNotifications({
          getSession: getNotificationsSession,
          isSignedIn: isSessionSignedIn,
          getActiveUnitId,
          getApiContext: requireApiContext,
          getBaseApiUrl,
          getDeviceUuid: () => getOrCreateDeviceUuid(main),
          getRequestHeaders: () => clientHeaders(),
          getAccessToken: () => useAuthStore.getState().accessToken,
          storage: main,
          resolveRoute: (target) => resolveNotificationRoute(target),
          getWebPushConfig: webPushConfigFromDepartment,
        });

        const defaultLocationSettings = (): LocationSettings => ({
          realtimeGeolocation: readStoredBoolean(main, REALTIME_GEOLOCATION_KEY) ?? manifest.capabilities.location.geoHubDefault,
          backgroundGeolocation: readStoredBoolean(main, BACKGROUND_GEOLOCATION_KEY) ?? false,
        });
        configureLocation({
          manifest,
          getOutbox: () => offline.outbox,
          isSignedIn: isSessionSignedIn,
          getSession: () => {
            const userId = getSessionUserId();
            return userId ? { userId } : null;
          },
          getActiveUnitId,
          getSettings: config.options?.getLocationSettings ?? defaultLocationSettings,
          getServerConfig: () => getShellState().departmentConfig,
          subscribeSession: (listener) => useAuthStore.subscribe(listener),
          getApiContext: requireApiContext,
          logger,
        });

        configureVoice({ getApiContext: () => getShellRuntime().auth?.context ?? null, storage: main, sounds: config.options?.voiceSounds });

        registerTeardowns();
        offline.sync.setReconnectSequence({
          refreshAuth: async () => {
            if (useAuthStore.getState().refreshToken && !(await useAuthStore.getState().refreshAccessToken())) {
              throw new Error('Token refresh failed');
            }
          },
          pullDeltas: () => refreshDataWorkingSet(manifest),
          drainOutbox: () => offline.outbox.drain(),
          resumeRealtime: () => useRealtimeStore.getState().connectAll(),
        });

        // Wires listeners first, replays a launch tap (deep links wait for the router and the session), then channels.
        await pushNotificationService.initialize();
      },
    },
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// Session phase (signed in)

export function createSessionSteps(config: AppShellConfig): InitStep[] {
  const manifest = config.variant;
  return [
    {
      id: 'session.gates',
      run: async () => {
        // Rights first, then flags + terminology + data protection (loadSessionGates); department config alongside.
        const [gates] = await Promise.all([loadSessionGates(), loadDepartmentConfig()]);
        if (gates.appAccess === 'denied') {
          await enforceAppAccess(() => setShellState({ accessDeniedNotice: true }));
          return 'stop';
        }
        return undefined;
      },
    },
    {
      id: 'session.working-set',
      optional: true,
      run: () => refreshDataWorkingSet(manifest),
    },
    {
      id: 'session.realtime',
      optional: true,
      // Hubs connect together and independently (allSettled inside connectAll).
      run: () => useRealtimeStore.getState().connectAll(),
    },
    {
      id: 'session.hydration',
      optional: true,
      run: () => {
        // Shift-start hydration (map packs, bundles) reports its own progress; it never holds up the shell.
        void requireOfflineRuntime()
          .sync.hydrate()
          .catch((error: unknown) => logger.warn({ message: 'Hydration failed', context: { error } }));
      },
    },
    {
      id: 'session.voice',
      optional: true,
      enabled: () => manifest.capabilities.voice.ptt,
      run: () => initializeVoice(config.options?.callKeep ? { callKeep: config.options.callKeep } : {}),
    },
    {
      id: 'session.push',
      optional: true,
      // Arms the registration hook (SessionServices): it registers now and again on resume or a unit/department change.
      run: () => setShellState({ pushRegistrationArmed: true }),
    },
  ];
}

let defaultStepsRegistered = false;

/** Registers the default steps once (configureAppShell). Per-variant steps are added with `registerInitStep`. */
export function registerDefaultInitSteps(startup: AppInit, session: AppInit, config: AppShellConfig): void {
  if (defaultStepsRegistered) {
    return;
  }
  defaultStepsRegistered = true;
  createStartupSteps(config).forEach((step) => startup.register(step));
  createSessionSteps(config).forEach((step) => session.register(step));
  try {
    // Completes a web SSO popup that loaded the app (expo-auth-session); a no-op everywhere else.
    WebBrowser.maybeCompleteAuthSession();
  } catch {
    // Not available on this platform.
  }
}

/** Test helper. Not for app code. */
export function resetDefaultStepsForTests(): void {
  defaultStepsRegistered = false;
  registrationDisposers?.forEach((dispose) => dispose());
  registrationDisposers = null;
}
