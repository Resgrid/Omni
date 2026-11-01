import type { ConnectivitySource } from '@resgrid/offline';

import { clearRealtimeListenersForTests } from '../../event-bus';
import type { RealtimeVariantInput } from '../../events';
import { configureRealtime, type RealtimeDependencies, resetRealtimeConfigForTests } from '../../realtime-config';
import { teardownRealtime } from '../../realtime-store';
import { signalRService } from '../../signalr-service';
import { fakeSignalR } from '../fakes/signalr';

/** Variant inputs mirroring apps/omni/variants/<id>/variant.json (capabilities and modules that drive realtime). */
export const VARIANTS: Record<'responder' | 'unit' | 'ic' | 'dispatch' | 'bigboard', RealtimeVariantInput> = {
  responder: {
    capabilities: {
      calls: { create: 'full', dispatch: true, close: true, queues: false, runCards: false },
      incidentCommand: 'view',
      checkIn: { self: true, others: false, actions: true },
      location: { background: true, transmission: 'person', geoHubDefault: false },
      realtime: { chatHub: true, hubWatchdog: false },
    },
    modules: ['member-home', 'calendar', 'shifts', 'messages', 'staffing', 'work-orders', 'certifications', 'approve-sign-in'],
  },
  unit: {
    capabilities: {
      calls: { create: 'full', dispatch: true, close: true, queues: false, runCards: false },
      incidentCommand: 'view',
      checkIn: { self: true, others: false, actions: true },
      location: { background: true, transmission: 'unit', geoHubDefault: true },
      realtime: { chatHub: true, hubWatchdog: false },
    },
    modules: ['unit-status', 'unit-routes', 'inventory'],
  },
  ic: {
    capabilities: {
      calls: { create: 'full', dispatch: true, close: true, queues: false, runCards: false },
      incidentCommand: 'command',
      checkIn: { self: true, others: true, actions: false },
      location: { background: false, transmission: 'none', geoHubDefault: true },
      realtime: { chatHub: true, hubWatchdog: false },
    },
    modules: ['incident-command'],
  },
  dispatch: {
    capabilities: {
      calls: { create: 'full', dispatch: true, close: true, queues: true, runCards: true },
      incidentCommand: 'assist',
      checkIn: { self: false, others: true, actions: false },
      location: { background: false, transmission: 'none', geoHubDefault: true },
      realtime: { chatHub: true, hubWatchdog: true },
    },
    modules: ['dispatch-console', 'runcards', 'call-queues', 'awaiting-resources'],
  },
  bigboard: {
    capabilities: {
      calls: { create: 'none', dispatch: false, close: false, queues: false, runCards: false },
      incidentCommand: 'none',
      checkIn: { self: false, others: false, actions: false },
      location: { background: false, transmission: 'none', geoHubDefault: true },
      realtime: { chatHub: false, hubWatchdog: true },
    },
    modules: ['dashboard'],
  },
};

export const EVENTING_URL = 'https://events.example.com/';

export interface TestAuth {
  token: string | null;
  /** The token a refresh produces (null = the session is gone). */
  refreshedToken: string | null;
  refreshCalls: number;
}

export interface RealtimeTestEnv {
  auth: TestAuth;
  deps: RealtimeDependencies;
}

export interface TestConnectivity extends ConnectivitySource {
  setOnline(online: boolean): void;
  listenerCount(): number;
}

/** A connectivity source tests drive by hand (the offline package's manual source without its NetInfo import). */
export function createTestConnectivity(initialOnline = true): TestConnectivity {
  let online = initialOnline;
  const listeners = new Set<(online: boolean) => void>();
  return {
    isOnline: () => online,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setOnline: (next) => {
      if (next === online) return;
      online = next;
      listeners.forEach((listener) => listener(next));
    },
    listenerCount: () => listeners.size,
  };
}

export function createTestAuth(token: string | null = 'token-1'): TestAuth {
  return { token, refreshedToken: token, refreshCalls: 0 };
}

/** Configures realtime for a variant with controllable auth; returns handles for the test. */
export function setupRealtime(variant: RealtimeVariantInput, overrides: Partial<RealtimeDependencies> = {}, auth: TestAuth = createTestAuth()): RealtimeTestEnv {
  const deps: RealtimeDependencies = {
    getAccessToken: () => auth.token,
    refreshAccessToken: async () => {
      auth.refreshCalls += 1;
      auth.token = auth.refreshedToken;
      return auth.token;
    },
    getEventingUrl: () => EVENTING_URL,
    getDepartmentId: () => '42',
    variant,
    ...overrides,
  };
  configureRealtime(deps);
  return { auth, deps };
}

/** Back to a clean slate: no hubs, listeners, timers, config or fake connections. */
export async function resetRealtime(): Promise<void> {
  await teardownRealtime();
  signalRService.resetForTests();
  clearRealtimeListenersForTests();
  resetRealtimeConfigForTests();
  fakeSignalR.reset();
}

/** Settles pending promise chains (fake timers do not advance microtasks by themselves). */
export async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}
