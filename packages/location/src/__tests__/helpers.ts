// Shared test helpers for @resgrid/location.
import type { ApiContext } from '@resgrid/api';
import type { DrainResult, EnqueueInput, EnqueueResult } from '@resgrid/offline';

import type { LocationFix, LocationOutbox, LocationSettings } from '../types';

/** Lets chained promise continuations run (deterministic; no timers advanced). */
export async function flushPromises(rounds = 60): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}

export const ORIGIN = { latitude: 37.7749, longitude: -122.4194 };
/** ~111 m north of ORIGIN. */
export const MOVED = { latitude: 37.7759, longitude: -122.4194 };
/** ~11 m north of ORIGIN: GPS jitter. */
export const JITTER = { latitude: 37.775, longitude: -122.4194 };
/** ~222 m north of ORIGIN. */
export const FAR = { latitude: 37.7769, longitude: -122.4194 };

export function fixAt(position: { latitude: number; longitude: number }, timestamp: number = Date.now(), overrides: Partial<LocationFix['coords']> = {}): LocationFix {
  return { coords: { altitude: 10, accuracy: 5, altitudeAccuracy: 3, heading: 90, speed: 4, ...position, ...overrides }, timestamp };
}

export interface RecordingOutbox extends LocationOutbox {
  enqueued: EnqueueInput[];
  enqueue: jest.Mock<Promise<EnqueueResult>, [EnqueueInput]>;
  drain: jest.Mock<Promise<DrainResult>, []>;
}

const completedDrain = (): DrainResult => ({ status: 'completed', sent: [], failed: [], dead: [], superseded: [], droppedForeign: [], held: 0, waiting: 0 });

/** An outbox that records what is queued. */
export function createRecordingOutbox(): RecordingOutbox {
  const enqueued: EnqueueInput[] = [];
  let seq = 0;
  const enqueue = jest.fn(async (input: EnqueueInput): Promise<EnqueueResult> => {
    enqueued.push(input);
    seq += 1;
    return { id: `evt-${seq}`, status: 'queued', replaced: [] };
  });
  const drain = jest.fn(async (): Promise<DrainResult> => completedDrain());
  return { enqueued, enqueue: enqueue as RecordingOutbox['enqueue'], drain };
}

export interface FakeApi {
  ctx: ApiContext;
  request: jest.Mock;
}

/** An ApiContext whose axios instance records requests and answers with a v4 success envelope. */
export function createFakeApi(): FakeApi {
  const request = jest.fn(async (_config: { url?: string; method?: string; data?: unknown }) => ({ data: { Id: 'loc-1', Status: 'success' } }));
  const ctx = { http: { axios: { request }, getBaseUrl: () => 'https://api.test/api/v4' } } as unknown as ApiContext;
  return { ctx, request };
}

export interface MutableSettings extends LocationSettings {
  set(next: Partial<LocationSettings>): void;
}

export function createSettings(initial: Partial<LocationSettings> = {}): MutableSettings {
  const settings: MutableSettings = {
    realtimeGeolocation: initial.realtimeGeolocation ?? true,
    backgroundGeolocation: initial.backgroundGeolocation ?? false,
    set(next) {
      Object.assign(settings, next);
    },
  };
  return settings;
}

/** v4 axios-style HTTP error (as thrown by axios, before @resgrid/api wraps it). */
export function axiosHttpError(status: number): Error & { isAxiosError: true; response: { status: number; data: unknown }; config: { url: string; method: string } } {
  return Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true as const, response: { status, data: {} }, config: { url: '/x', method: 'post' } });
}

export function axiosNetworkError(): Error & { isAxiosError: true; code: string; config: { url: string; method: string } } {
  return Object.assign(new Error('Network Error'), { isAxiosError: true as const, code: 'ERR_NETWORK', config: { url: '/x', method: 'post' } });
}
