import { getActiveVariant } from '@resgrid/config';
import type { ConnectivitySource } from '@resgrid/offline';

import { type RealtimeFeatures, type RealtimeVariantInput, resolveRealtimeFeatures } from './events';
import { signalRService } from './signalr-service';

/**
 * What the app shell injects (omni-plan §5.2: realtime is L3 and never imports auth, stores or features).
 */
export interface RealtimeDependencies {
  /** Current access token, read at call time (never cached by realtime). */
  getAccessToken: () => string | null | undefined;
  /** Refreshes the token. Empty afterwards = session gone: hubs stop reconnecting (the auth layer signs out). */
  refreshAccessToken: () => Promise<unknown>;
  /** `Config.EventingUrl` from the department config. */
  getEventingUrl: () => string | null | undefined;
  /** The signed-in department (`rights.DepartmentId`); Core's `Connect(departmentId)` must match the token. */
  getDepartmentId: () => number | string | null | undefined;
  /** Network reachability; hubs that exhausted their retries reconnect when it reports online. */
  connectivity?: ConnectivitySource | null;
  /**
   * The user's realtime-geolocation preference (Responder rule): the geolocation hub (re)connects only when it
   * allows. Undefined/null falls back to the variant's `location.geoHubDefault`.
   */
  isRealtimeGeolocationEnabled?: () => boolean | null | undefined | Promise<boolean | null | undefined>;
  /** Department feature gate for chat (e.g. the ChatSystem flag). Default: allowed when the variant has the chat hub. */
  isChatEnabled?: () => boolean;
  /** Defaults to the active variant manifest. */
  variant?: RealtimeVariantInput;
}

let dependencies: RealtimeDependencies | null = null;
let features: RealtimeFeatures | null = null;

/** Wires realtime to the auth package, config store and connectivity. Call once at startup (and again to replace). */
export function configureRealtime(next: RealtimeDependencies): void {
  dependencies = next;
  features = next.variant ? resolveRealtimeFeatures(next.variant) : null;
  signalRService.configure({
    auth: { getAccessToken: () => dependencies?.getAccessToken() ?? null, refreshAccessToken: () => dependencies?.refreshAccessToken() ?? Promise.resolve(null) },
    connectivity: next.connectivity ?? null,
  });
}

export function getRealtimeDependencies(): RealtimeDependencies | null {
  return dependencies;
}

/** The active variant's realtime features (event sets, chat hub, watchdog, geo default). */
export function getRealtimeFeatures(): RealtimeFeatures {
  if (!features) features = resolveRealtimeFeatures(getActiveVariant());
  return features;
}

/** Whether the geolocation hub should be connected now: the user's preference, else the variant default. */
export async function shouldConnectGeolocationHub(): Promise<boolean> {
  const preference = await dependencies?.isRealtimeGeolocationEnabled?.();
  return typeof preference === 'boolean' ? preference : getRealtimeFeatures().geoHubDefault;
}

export function isChatHubAllowed(): boolean {
  if (!getRealtimeFeatures().chatHub) return false;
  return dependencies?.isChatEnabled ? dependencies.isChatEnabled() : true;
}

/** Test helper. Not for app code. */
export function resetRealtimeConfigForTests(): void {
  dependencies = null;
  features = null;
}
