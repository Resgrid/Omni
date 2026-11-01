// Shared test helpers: variant manifests from apps/omni/variants, injected dependencies and a fake API transport.
import type { ApiContext } from '@resgrid/api';
import { parseVariantManifest, resetActiveVariantForTests, setActiveVariant, type VariantId } from '@resgrid/config';
import * as fs from 'fs';
import * as path from 'path';

import { configureNotifications, type NotificationsDependencies, type NotificationsSession, resetNotificationsConfigurationForTests } from '../configure';
import { createMemoryNotificationsKv, type NotificationsKv } from '../registration-storage';

export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
export const BASE_API_URL = 'https://api.test/api/v4';

export function selectVariant(id: VariantId, patchPush?: Partial<{ subject: 'user' | 'unit' | 'icUser' | 'none'; desktopPush: boolean }>): void {
  resetActiveVariantForTests();
  const raw = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'apps', 'omni', 'variants', id, 'variant.json'), 'utf8')) as { capabilities: { push: Record<string, unknown> } };
  if (patchPush) {
    raw.capabilities.push = { ...raw.capabilities.push, ...patchPush };
  }
  setActiveVariant(parseVariantManifest(raw));
}

export interface ApiRequestRecord {
  method: string;
  url: string;
  data: Record<string, unknown> | undefined;
  signal?: AbortSignal;
}

export interface FakeApi {
  ctx: ApiContext;
  requests: ApiRequestRecord[];
  /** Answers each request; defaults to `{ Status: 'Queued' }` for registrations and `{ Status: 'Success' }` otherwise. */
  respond: jest.Mock<Promise<unknown>, [ApiRequestRecord]>;
}

export function createFakeApi(): FakeApi {
  const requests: ApiRequestRecord[] = [];
  const respond = jest.fn<Promise<unknown>, [ApiRequestRecord]>(async (record) => (record.url.includes('/Devices/Register') ? { Status: 'Queued' } : { Status: 'Success' }));
  const ctx = {
    http: {
      getBaseUrl: () => BASE_API_URL,
      axios: {
        request: jest.fn(async (config: { method: string; url: string; data?: Record<string, unknown>; signal?: AbortSignal }) => {
          const record: ApiRequestRecord = { method: config.method, url: config.url, data: config.data, ...(config.signal ? { signal: config.signal } : {}) };
          requests.push(record);
          return { data: await respond(record) };
        }),
      },
    },
  } as unknown as ApiContext;
  return { ctx, requests, respond };
}

export interface TestState {
  signedIn: boolean;
  session: NotificationsSession | null;
  unitId: string | null;
  baseUrl: string;
}

export const defaultSession = (): NotificationsSession => ({ userId: 'user-1', departmentId: '10', departmentCode: 'DEPT', rights: { NovuSubscriberHash: 'hash-user', NovuICSubscriberHash: 'hash-ic' } });

export function createTestState(overrides: Partial<TestState> = {}): TestState {
  return { signedIn: true, session: defaultSession(), unitId: '12', baseUrl: BASE_API_URL, ...overrides };
}

export interface TestContext {
  state: TestState;
  api: FakeApi;
  storage: NotificationsKv;
  deps: NotificationsDependencies;
  resolveRoute: jest.Mock;
  onCheckInAction: jest.Mock;
}

export function configureForTest(overrides: Partial<NotificationsDependencies> = {}, stateOverrides: Partial<TestState> = {}): TestContext {
  resetNotificationsConfigurationForTests();
  const state = createTestState(stateOverrides);
  const api = createFakeApi();
  const storage = createMemoryNotificationsKv();
  const resolveRoute = jest.fn((target: { kind: string; id: string }) => `/${target.kind}/${target.id}`);
  const onCheckInAction = jest.fn(async () => undefined);
  const deps: NotificationsDependencies = {
    getSession: () => state.session,
    isSignedIn: () => state.signedIn,
    getActiveUnitId: () => state.unitId,
    getApiContext: () => api.ctx,
    getBaseApiUrl: () => state.baseUrl,
    getDeviceUuid: () => 'device-uuid',
    getRequestHeaders: () => ({ 'X-Resgrid-Client': 'test' }),
    storage,
    resolveRoute,
    onCheckInAction,
    ...overrides,
  };
  configureNotifications(deps);
  return { state, api, storage, deps, resolveRoute, onCheckInAction };
}

/** Lets every promise already settled run its callbacks. */
export const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export async function flushAll(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) {
    await flush();
  }
}
