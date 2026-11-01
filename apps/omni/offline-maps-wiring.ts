// Offline map packs in the shell (MapLibre plan §19.5–19.8, omni-offline-first). On iOS/Android the pack manager is built
// after startup has opened storage and restored the session (offline-maps-platform.native.ts; none on the web), hooked
// into @resgrid/offline's wipe/retention/storage registries, handed to Settings → Offline maps, and kept current: the
// department config when it loads, the scope on sign-in and on a department or server switch, and a stale check at shift
// start (hydration) and on reconnect.
import { getSessionScope, getShellApiContext, getShellOfflineRuntime, registerInitStep, useShellStore } from '@resgrid/app-shell';
import { securityStore, useAuthStore } from '@resgrid/auth';
import { logger } from '@resgrid/core';
import { configureOfflineMaps } from '@resgrid/features/offline-maps';
import { type OfflinePackManager, type OfflinePackScope, registerOfflineMapPacks } from '@resgrid/maps';

import { createPlatformOfflinePackManager } from './offline-maps-platform';

let manager: OfflinePackManager | null = null;
let disposers: (() => void)[] = [];

/** The shell's pack manager (null on the web, before startup, or when packs are unsupported). */
export const getShellOfflinePackManager = (): OfflinePackManager | null => manager;

/** The signed-in server/department/user the packs belong to. */
export function offlinePackScope(): OfflinePackScope | null {
  const scope = getSessionScope();
  return scope ? { serverUrl: scope.server, departmentId: String(scope.departmentId), userId: scope.userId } : null;
}

const scopeKey = (scope: OfflinePackScope | null): string | null => (scope ? `${scope.serverUrl}|${scope.departmentId}|${scope.userId}` : null);

const logFailure = (message: string) => (error: unknown) => logger.warn({ message, context: { error: error instanceof Error ? error.name : typeof error } });

/** Builds and wires the manager once (startup step); a no-op without storage or on platforms without packs. */
export async function startOfflineMaps(create: typeof createPlatformOfflinePackManager = createPlatformOfflinePackManager): Promise<OfflinePackManager | null> {
  if (manager) {
    return manager;
  }
  const runtime = getShellOfflineRuntime();
  if (!runtime) {
    return null;
  }
  const created = create({
    db: runtime.db,
    kv: runtime.storage.main,
    getScope: offlinePackScope,
    getApiBaseUrl: () => getShellApiContext()?.http.getBaseUrl() ?? '',
    // Codes, counts and sizes only (the manager never passes URLs with tokens).
    log: (message, context) => logger.info({ message, context }),
  });
  if (!created) {
    return null;
  }
  manager = created;
  await created.init();
  created.updateConfig(useShellStore.getState().departmentConfig);

  let lastScope = scopeKey(offlinePackScope());
  const onScopeMaybeChanged = (): void => {
    const next = scopeKey(offlinePackScope());
    // Sign-in (no scope → scope) is the session step's job; a switch between two scopes reloads here.
    if (next !== lastScope && lastScope !== null && next !== null) {
      void created.onSessionChanged().catch(logFailure('Offline maps could not switch scope'));
    }
    lastScope = next;
  };
  let wasOnline = runtime.connectivity?.isOnline() ?? true;
  disposers = [
    registerOfflineMapPacks(created),
    useShellStore.subscribe((state, previous) => {
      if (state.departmentConfig !== previous.departmentConfig) {
        created.updateConfig(state.departmentConfig);
      }
    }),
    useAuthStore.subscribe(onScopeMaybeChanged),
    securityStore.subscribe(onScopeMaybeChanged),
    runtime.connectivity?.subscribe((online) => {
      if (online && !wasOnline) {
        void created.refreshIfStale().catch(logFailure('Offline maps refresh after reconnect failed'));
      }
      wasOnline = online;
    }) ?? (() => undefined),
  ];
  configureOfflineMaps({ controller: created });
  return created;
}

/** Registers the init steps (shell-registrations): build after startup, rescope on sign-in, stale check at hydration. */
export function registerOfflineMapsSteps(): void {
  registerInitStep(
    'startup',
    {
      id: 'startup.offline-maps',
      optional: true,
      run: async () => {
        await startOfflineMaps();
      },
    },
    { after: 'startup.packages' }
  );
  registerInitStep(
    'session',
    {
      id: 'session.offline-maps',
      optional: true,
      run: async () => {
        if (manager) {
          await manager.onSessionChanged();
          manager.updateConfig(useShellStore.getState().departmentConfig);
        }
      },
    },
    { after: 'session.gates' }
  );
  registerInitStep(
    'session',
    {
      id: 'session.offline-maps-refresh',
      optional: true,
      run: () => {
        // Shift-start hydration: checks the manifest when it is stale; downloads report their own progress.
        void manager?.refreshIfStale().catch(logFailure('Offline maps hydration check failed'));
      },
    },
    { after: 'session.hydration' }
  );
}

/** Test helper. */
export function resetOfflineMapsWiringForTests(): void {
  disposers.forEach((dispose) => dispose());
  disposers = [];
  manager = null;
}
