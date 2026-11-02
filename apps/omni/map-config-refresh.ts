// Signed map URLs in the department config (MapLibre plan D12): Core signs the style, static map and offline manifest URLs
// it returns from Config/GetConfig with an expiring signature (`SignedMapUrlTtlHours`, 24 h by default), while the shell
// loads the config once per sign-in (through a cache IC keeps for a day). A crew that stays signed in past the expiry
// would lose its base map (401) and offline map updates (410). The config is fetched again shortly before the first
// signature expires, on foreground once that time has passed, and when the offline manifest URL comes back expired.
import { getSessionScope, loadDepartmentConfig, registerInitStep, useShellStore } from '@resgrid/app-shell';
import { getAppLifecycleState, subscribeAppLifecycle } from '@resgrid/core';
import { mapConfigRefreshAt } from '@resgrid/maps';

/** Timers stay short (a long one is unreliable on a suspended phone); each wake checks again. */
export const MAP_CONFIG_CHECK_MAX_MS = 15 * 60_000;
/** A failed reload is tried again after this long, not on every wake. */
export const MAP_CONFIG_RETRY_MS = 5 * 60_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let disposers: (() => void)[] = [];
let inFlight: Promise<void> | null = null;
let lastAttemptAt = 0;

const now = (): number => Date.now();

/** Fetches the config again (one request at a time); the shell store update reschedules the next check. */
export function refreshDepartmentConfigNow(): Promise<void> {
  if (!getSessionScope()) return Promise.resolve();
  if (!inFlight) {
    lastAttemptAt = now();
    inFlight = loadDepartmentConfig({ forceRefresh: true }).finally(() => {
      inFlight = null;
      schedule();
    });
  }
  return inFlight;
}

const dueAt = (): number | null => mapConfigRefreshAt(useShellStore.getState().departmentConfig);

/** Reloads when the config's signatures are about to expire (and no attempt was made just now). */
function checkNow(): void {
  const due = dueAt();
  if (due !== null && now() >= due && now() - lastAttemptAt >= MAP_CONFIG_RETRY_MS) {
    void refreshDepartmentConfigNow();
    return;
  }
  schedule();
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const due = dueAt();
  if (due === null || !getSessionScope()) return;
  const wait = Math.max(due - now(), lastAttemptAt + MAP_CONFIG_RETRY_MS - now(), 1000);
  timer = setTimeout(checkNow, Math.min(wait, MAP_CONFIG_CHECK_MAX_MS));
}

/** Starts watching the config (startup step); idempotent. */
export function startMapConfigRefresh(): void {
  if (disposers.length > 0) return;
  let wasActive = getAppLifecycleState().isActive;
  disposers = [
    useShellStore.subscribe((state, previous) => {
      if (state.departmentConfig !== previous.departmentConfig) schedule();
    }),
    subscribeAppLifecycle(() => {
      const isActive = getAppLifecycleState().isActive;
      if (isActive && !wasActive) checkNow();
      wasActive = isActive;
    }),
  ];
  checkNow();
}

export function registerMapConfigRefreshStep(): void {
  registerInitStep('startup', { id: 'startup.map-config-refresh', optional: true, run: () => startMapConfigRefresh() }, { after: 'startup.packages' });
}

/** Test helper. */
export function resetMapConfigRefreshForTests(): void {
  disposers.forEach((dispose) => dispose());
  disposers = [];
  if (timer) clearTimeout(timer);
  timer = null;
  inFlight = null;
  lastAttemptAt = 0;
}
