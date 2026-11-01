// Offline map packs in the shell (apps/omni/offline-maps-wiring.ts): built once after startup where the platform has packs,
// registered with @resgrid/offline, handed to Settings, and kept current (config, scope switches, reconnect, init steps).
import { offlinePackScope, registerOfflineMapsSteps, resetOfflineMapsWiringForTests, startOfflineMaps } from '../offline-maps-wiring';

type Listener<T> = (state: T, previous: T) => void;

function mockStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<Listener<T>>();
  return {
    getState: () => state,
    setState: (patch: Partial<T>) => {
      const previous = state;
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener(state, previous));
    },
    subscribe: (listener: Listener<T>) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const mockShellStore = mockStore<{ departmentConfig: { MapUrl: string } | null }>({ departmentConfig: null });
const mockAuthStore = mockStore<{ userId: string | null }>({ userId: 'u1' });
const mockSecurityStore = mockStore<{ departmentId: number }>({ departmentId: 7 });
const mockSteps: { phase: string; step: { id: string; run: () => unknown }; position?: { after?: string } }[] = [];
let mockScope: { server: string; departmentId: number; userId: string } | null = { server: 'https://api.example.com', departmentId: 7, userId: 'u1' };
const mockConnectivity = {
  online: true,
  listeners: new Set<(online: boolean) => void>(),
  isOnline: () => mockConnectivity.online,
  subscribe: (listener: (online: boolean) => void) => {
    mockConnectivity.listeners.add(listener);
    return () => mockConnectivity.listeners.delete(listener);
  },
};
const mockRuntime = { db: { name: 'db' }, storage: { main: { name: 'kv' } }, connectivity: mockConnectivity };

jest.mock('@resgrid/app-shell', () => ({
  getSessionScope: () => mockScope,
  getShellApiContext: () => ({ http: { getBaseUrl: () => 'https://api.example.com/api/v4' } }),
  getShellOfflineRuntime: () => mockRuntime,
  registerInitStep: (phase: string, step: { id: string; run: () => unknown }, position?: { after?: string }) => mockSteps.push({ phase, step, position }),
  // Getters: the mock factories run when the module under test is imported, before these constants are initialised.
  get useShellStore() {
    return mockShellStore;
  },
}));
jest.mock('@resgrid/auth', () => ({
  get useAuthStore() {
    return mockAuthStore;
  },
  get securityStore() {
    return mockSecurityStore;
  },
}));
jest.mock('@resgrid/core', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));
jest.mock('@resgrid/features/offline-maps', () => ({ configureOfflineMaps: jest.fn() }));
jest.mock('@resgrid/maps', () => ({ registerOfflineMapPacks: jest.fn(() => jest.fn()) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { configureOfflineMaps } = require('@resgrid/features/offline-maps') as { configureOfflineMaps: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { registerOfflineMapPacks } = require('@resgrid/maps') as { registerOfflineMapPacks: jest.Mock };

function fakeManager() {
  return { init: jest.fn(async () => undefined), updateConfig: jest.fn(), onSessionChanged: jest.fn(async () => undefined), refreshIfStale: jest.fn(async () => ({ ok: true })) };
}

describe('offline maps wiring', () => {
  beforeEach(() => {
    resetOfflineMapsWiringForTests();
    jest.clearAllMocks();
    mockScope = { server: 'https://api.example.com', departmentId: 7, userId: 'u1' };
    mockShellStore.setState({ departmentConfig: null });
    mockConnectivity.online = true;
  });

  it('builds the manager from the offline runtime and hands it to Settings and the offline registries', async () => {
    const manager = fakeManager();
    const create = jest.fn(() => manager as never);
    expect(await startOfflineMaps(create)).toBe(manager);
    const input = (create.mock.calls[0] as unknown as [Record<string, unknown> & { getScope: () => unknown; getApiBaseUrl: () => string }])[0];
    expect(input).toEqual(expect.objectContaining({ db: mockRuntime.db, kv: mockRuntime.storage.main }));
    expect(input.getScope()).toEqual({ serverUrl: 'https://api.example.com', departmentId: '7', userId: 'u1' });
    expect(input.getApiBaseUrl()).toBe('https://api.example.com/api/v4');
    expect(manager.init).toHaveBeenCalled();
    expect(registerOfflineMapPacks).toHaveBeenCalledWith(manager);
    expect(configureOfflineMaps).toHaveBeenCalledWith({ controller: manager });

    // Built once.
    expect(await startOfflineMaps(create)).toBe(manager);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does nothing where the platform has no packs (web, Electron)', async () => {
    expect(await startOfflineMaps(() => null)).toBeNull();
    expect(configureOfflineMaps).not.toHaveBeenCalled();
  });

  it('follows the department config, scope switches and reconnects', async () => {
    const manager = fakeManager();
    await startOfflineMaps(() => manager as never);

    mockShellStore.setState({ departmentConfig: { MapUrl: 'x' } });
    expect(manager.updateConfig).toHaveBeenLastCalledWith({ MapUrl: 'x' });

    mockScope = { server: 'https://api.example.com', departmentId: 8, userId: 'u1' };
    mockSecurityStore.setState({ departmentId: 8 });
    expect(manager.onSessionChanged).toHaveBeenCalledTimes(1);
    // Signing out (no scope) is not a switch; the session step rescopes on the next sign-in.
    mockScope = null;
    mockAuthStore.setState({ userId: null });
    expect(manager.onSessionChanged).toHaveBeenCalledTimes(1);

    mockConnectivity.online = false;
    mockConnectivity.listeners.forEach((listener) => listener(false));
    mockConnectivity.online = true;
    mockConnectivity.listeners.forEach((listener) => listener(true));
    expect(manager.refreshIfStale).toHaveBeenCalledTimes(1);
  });

  it('registers the startup build, the sign-in rescope and the hydration check at their places', async () => {
    registerOfflineMapsSteps();
    expect(mockSteps.map((entry) => [entry.phase, entry.step.id, entry.position?.after])).toEqual([
      ['startup', 'startup.offline-maps', 'startup.packages'],
      ['session', 'session.offline-maps', 'session.gates'],
      ['session', 'session.offline-maps-refresh', 'session.hydration'],
    ]);
    // Without a manager (web) the session steps are no-ops.
    await expect(Promise.resolve(mockSteps[1].step.run())).resolves.toBeUndefined();
    expect(mockSteps[2].step.run()).toBeUndefined();
  });

  it('maps the shell session scope to the pack scope', () => {
    expect(offlinePackScope()).toEqual({ serverUrl: 'https://api.example.com', departmentId: '7', userId: 'u1' });
    mockScope = null;
    expect(offlinePackScope()).toBeNull();
  });
});
