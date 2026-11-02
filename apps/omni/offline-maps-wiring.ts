// Offline map packs in the shell (MapLibre plan §19.5–19.9, omni-offline-first). The pack manager is built after startup
// has opened storage and restored the session (offline-maps-platform.native.ts on iOS/Android, offline-maps-platform.ts
// on the web and Electron over OPFS; none where the platform has no pack storage), hooked
// into @resgrid/offline's wipe/retention/storage registries, handed to Settings → Offline maps, and kept current: the
// department config when it loads, the scope on sign-in and on a department or server switch, the shift-start hydration
// step (manifest + downloads under the department's policy), and the same automatic sync on reconnect and on foreground
// (when older than RefreshHours). Incident and corridor packs follow what this device works on (its active call, the
// incidents it commands, its route), as the variant's capabilities allow (§19.7).
import { getSessionScope, getShellApiContext, getShellOfflineRuntime, registerInitStep, useActiveSessionStore, useShellStore } from '@resgrid/app-shell';
import { securityStore, useAuthStore } from '@resgrid/auth';
import { getActiveVariant } from '@resgrid/config';
import { getAppLifecycleState, logger, subscribeAppLifecycle } from '@resgrid/core';
import { useCallsStore, useCommandStore, useRoutesStore } from '@resgrid/data';
import { configureOfflineMaps } from '@resgrid/features/offline-maps';
import {
  createOfflineMapsHydrationStep,
  type LngLat,
  NO_EXTRA_PACKS,
  type OfflineExtraPackPolicy,
  type OfflinePackFocus,
  type OfflinePackManager,
  type OfflinePackScope,
  registerOfflineMapPacks,
  resolveExtraPackPolicy,
} from '@resgrid/maps';

import { refreshDepartmentConfigNow } from './map-config-refresh';
import { createPlatformOfflinePackManager, type PlatformPackManagerInput } from './offline-maps-platform';

/** Builds the platform's manager: synchronous on iOS/Android, after opening the OPFS registry on the web. */
type PlatformPackManagerFactory = (input: PlatformPackManagerInput) => OfflinePackManager | null | Promise<OfflinePackManager | null>;

let manager: OfflinePackManager | null = null;
let disposers: (() => void)[] = [];

/** The shell's pack manager (null before startup or where packs are unsupported). */
export const getShellOfflinePackManager = (): OfflinePackManager | null => manager;

/** The signed-in server/department/user the packs belong to. */
export function offlinePackScope(): OfflinePackScope | null {
  const scope = getSessionScope();
  return scope ? { serverUrl: scope.server, departmentId: String(scope.departmentId), userId: scope.userId } : null;
}

const scopeKey = (scope: OfflinePackScope | null): string | null => (scope ? `${scope.serverUrl}|${scope.departmentId}|${scope.userId}` : null);

const logFailure = (message: string) => (error: unknown) => logger.warn({ message, context: { error: error instanceof Error ? error.name : typeof error } });

/** Incident/corridor packs this app downloads, from its capabilities (never the app id). */
function extraPackPolicy(): OfflineExtraPackPolicy {
  try {
    return resolveExtraPackPolicy(getActiveVariant());
  } catch {
    return NO_EXTRA_PACKS;
  }
}

const toNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const validLngLat = (lng: number | null, lat: number | null): LngLat | null => (lng !== null && lat !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? [lng, lat] : null);

/** A call's position: `Latitude`/`Longitude`, else the `Geolocation` "lat,lon" text. */
function callPoint(call: { Latitude?: unknown; Longitude?: unknown; Geolocation?: unknown }): LngLat | null {
  const direct = validLngLat(toNumber(call.Longitude), toNumber(call.Latitude));
  if (direct) return direct;
  const parts = typeof call.Geolocation === 'string' ? call.Geolocation.split(',') : [];
  return parts.length === 2 ? validLngLat(toNumber(parts[1]), toNumber(parts[0])) : null;
}

/** A route plan as a line: its stored geometry (GeoJSON LineString), else its stops in order. */
function routeLine(plan: { MapboxRouteGeometry?: string | null; Stops?: { StopOrder: number; Latitude: number; Longitude: number }[] }): LngLat[] {
  if (plan.MapboxRouteGeometry) {
    try {
      const parsed: unknown = JSON.parse(plan.MapboxRouteGeometry);
      const geometry = parsed && typeof parsed === 'object' && 'geometry' in parsed ? (parsed as { geometry: unknown }).geometry : parsed;
      const coordinates = geometry && typeof geometry === 'object' && 'coordinates' in geometry ? (geometry as { coordinates: unknown }).coordinates : null;
      if (Array.isArray(coordinates)) {
        const line = coordinates.map((position: unknown) => (Array.isArray(position) ? validLngLat(toNumber(position[0]), toNumber(position[1])) : null)).filter((point): point is LngLat => point !== null);
        if (line.length > 1) return line;
      }
    } catch {
      // Not GeoJSON: fall back to the stops.
    }
  }
  return [...(plan.Stops ?? [])]
    .sort((a, b) => a.StopOrder - b.StopOrder)
    .map((stop) => validLngLat(toNumber(stop.Longitude), toNumber(stop.Latitude)))
    .filter((point): point is LngLat => point !== null);
}

/**
 * What this device works on (§19.7): the crew's or member's active call and the incidents it commands (IC boards); the
 * unit's current route plan. The manager keeps only the listed incident and corridor cells Core lists for these ids (near
 * their positions on older servers), and only where the variant's policy allows them.
 */
export function offlinePackFocus(): OfflinePackFocus {
  const callIds = new Set<string>();
  const active = useActiveSessionStore.getState().activeCallId;
  if (active) callIds.add(String(active));
  const command = useCommandStore.getState();
  if (command.activeCallId) callIds.add(String(command.activeCallId));
  for (const callId of Object.keys(command.boards)) callIds.add(callId);
  const calls = useCallsStore.getState().calls;
  const incidentPoints = [...callIds]
    .map((callId) => calls.find((call) => String(call.CallId) === callId))
    .map((call) => (call ? callPoint(call) : null))
    .filter((point): point is LngLat => point !== null);
  const plan = useRoutesStore.getState().activePlan;
  const line = plan ? routeLine(plan) : [];
  const routePlanId = plan?.RoutePlanId?.trim() ?? '';
  return { callIds: [...callIds], incidentPoints, routePlanIds: routePlanId ? [routePlanId] : [], corridorLines: line.length > 0 ? [line] : [] };
}

const focusKey = (focus: OfflinePackFocus): string => JSON.stringify(focus);

/** Builds and wires the manager once (startup step); a no-op without storage or on platforms without packs. */
export async function startOfflineMaps(create: PlatformPackManagerFactory = createPlatformOfflinePackManager): Promise<OfflinePackManager | null> {
  if (manager) {
    return manager;
  }
  const runtime = getShellOfflineRuntime();
  if (!runtime) {
    return null;
  }
  const policy = extraPackPolicy();
  const created = await create({
    db: runtime.db,
    kv: runtime.storage.main,
    getScope: offlinePackScope,
    getApiBaseUrl: () => getShellApiContext()?.http.getBaseUrl() ?? '',
    // Codes, counts and sizes only (the manager never passes URLs with tokens).
    log: (message, context) => logger.info({ message, context }),
    packSelection: { policy, getFocus: offlinePackFocus },
    // An expired manifest URL: fetch the config again (the shell store hands it to `updateConfig` below).
    renewConfig: refreshDepartmentConfigNow,
  });
  if (!created) {
    return null;
  }
  manager = created;
  await created.init();
  created.updateConfig(useShellStore.getState().departmentConfig);

  const autoSync = (reason: string): void => {
    void created.autoSync().catch(logFailure(`Offline maps sync (${reason}) failed`));
  };
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
  let wasActive = getAppLifecycleState().isActive;
  disposers = [
    registerOfflineMapPacks(created),
    // Shift-start hydration (session.hydration runs the orchestrator): manifest, then downloads per policy.
    runtime.sync.registerHydrationStep(createOfflineMapsHydrationStep(created)),
    useShellStore.subscribe((state, previous) => {
      if (state.departmentConfig !== previous.departmentConfig) {
        created.updateConfig(state.departmentConfig);
      }
    }),
    useAuthStore.subscribe(onScopeMaybeChanged),
    securityStore.subscribe(onScopeMaybeChanged),
    runtime.connectivity?.subscribe((online) => {
      if (online && !wasOnline) autoSync('reconnect');
      wasOnline = online;
    }) ?? (() => undefined),
    subscribeAppLifecycle(() => {
      const isActive = getAppLifecycleState().isActive;
      if (isActive && !wasActive && offlinePackScope()) autoSync('foreground');
      wasActive = isActive;
    }),
  ];

  if (policy.incidents || policy.corridors) {
    // The active call, commanded incidents or route changed: fetch the packs now wanted, drop the ones no longer.
    let lastFocus = focusKey(offlinePackFocus());
    const onFocusMaybeChanged = (): void => {
      const next = focusKey(offlinePackFocus());
      if (next === lastFocus) return;
      lastFocus = next;
      if (offlinePackScope()) void created.refreshSelection().catch(logFailure('Offline maps focus update failed'));
    };
    disposers.push(useActiveSessionStore.subscribe(onFocusMaybeChanged), useCommandStore.subscribe(onFocusMaybeChanged), useCallsStore.subscribe(onFocusMaybeChanged), useRoutesStore.subscribe(onFocusMaybeChanged));
  }
  configureOfflineMaps({ controller: created });
  return created;
}

/** Registers the init steps (shell-registrations): build after startup, rescope on sign-in. Hydration runs the maps step. */
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
}

/** Test helper. */
export function resetOfflineMapsWiringForTests(): void {
  disposers.forEach((dispose) => dispose());
  disposers = [];
  manager = null;
}
