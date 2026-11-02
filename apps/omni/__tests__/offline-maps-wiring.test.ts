// Offline map packs in the shell (apps/omni/offline-maps-wiring.ts): built once after startup where the platform has packs,
// registered with @resgrid/offline (registries + the hydration step), handed to Settings, and kept current (config, scope
// switches, reconnect, foreground, the device's focus for incident/corridor packs, init steps).
import { offlinePackFocus, offlinePackScope, registerOfflineMapsSteps, resetOfflineMapsWiringForTests, startOfflineMaps } from '../offline-maps-wiring';

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

interface MockCall {
  CallId: string;
  Latitude: string;
  Longitude: string;
  Geolocation: string;
}
interface MockPlan {
  RoutePlanId?: string;
  MapboxRouteGeometry: string | null;
  Stops: { StopOrder: number; Latitude: number; Longitude: number }[];
}

const mockShellStore = mockStore<{ departmentConfig: { MapUrl: string } | null }>({ departmentConfig: null });
const mockAuthStore = mockStore<{ userId: string | null }>({ userId: 'u1' });
const mockSecurityStore = mockStore<{ departmentId: number }>({ departmentId: 7 });
const mockActiveSession = mockStore<{ activeCallId: string | null; activeUnitId: string | null }>({ activeCallId: null, activeUnitId: null });
const mockCalls = mockStore<{ calls: MockCall[] }>({ calls: [] });
const mockCommand = mockStore<{ activeCallId: string | null; boards: Record<string, unknown> }>({ activeCallId: null, boards: {} });
const mockRoutes = mockStore<{ activePlan: MockPlan | null }>({ activePlan: null });
const mockSteps: { phase: string; step: { id: string; run: () => unknown }; position?: { after?: string } }[] = [];
let mockScope: { server: string; departmentId: number; userId: string } | null = { server: 'https://api.example.com', departmentId: 7, userId: 'u1' };
let mockPolicy = { incidents: true, corridors: true };
const mockConnectivity = {
  online: true,
  listeners: new Set<(online: boolean) => void>(),
  isOnline: () => mockConnectivity.online,
  subscribe: (listener: (online: boolean) => void) => {
    mockConnectivity.listeners.add(listener);
    return () => mockConnectivity.listeners.delete(listener);
  },
};
const mockLifecycle = { active: true, listeners: new Set<() => void>() };
const mockSync = { registerHydrationStep: jest.fn((_step: unknown) => jest.fn()) };
const mockRuntime = { db: { name: 'db' }, storage: { main: { name: 'kv' } }, connectivity: mockConnectivity, sync: mockSync };

jest.mock('@resgrid/app-shell', () => ({
  getSessionScope: () => mockScope,
  getShellApiContext: () => ({ http: { getBaseUrl: () => 'https://api.example.com/api/v4' } }),
  getShellOfflineRuntime: () => mockRuntime,
  registerInitStep: (phase: string, step: { id: string; run: () => unknown }, position?: { after?: string }) => mockSteps.push({ phase, step, position }),
  // Getters: the mock factories run when the module under test is imported, before these constants are initialised.
  get useShellStore() {
    return mockShellStore;
  },
  get useActiveSessionStore() {
    return mockActiveSession;
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
jest.mock('@resgrid/config', () => ({ getActiveVariant: () => ({ id: 'any' }) }));
jest.mock('@resgrid/core', () => ({
  logger: { info: jest.fn(), warn: jest.fn() },
  getAppLifecycleState: () => ({ isActive: mockLifecycle.active }),
  subscribeAppLifecycle: (listener: () => void) => {
    mockLifecycle.listeners.add(listener);
    return () => mockLifecycle.listeners.delete(listener);
  },
}));
jest.mock('@resgrid/data', () => ({
  get useCallsStore() {
    return mockCalls;
  },
  get useCommandStore() {
    return mockCommand;
  },
  get useRoutesStore() {
    return mockRoutes;
  },
}));
jest.mock('@resgrid/features/offline-maps', () => ({ configureOfflineMaps: jest.fn() }));
jest.mock('@resgrid/maps', () => ({
  registerOfflineMapPacks: jest.fn(() => jest.fn()),
  createOfflineMapsHydrationStep: jest.fn((manager: unknown) => ({ id: 'maps.offline-packs', manager })),
  resolveExtraPackPolicy: jest.fn(() => mockPolicy),
  NO_EXTRA_PACKS: { incidents: false, corridors: false },
}));
// The web platform file (Jest resolves it) opens its own registry DB; the tests pass their own factory.
jest.mock('@resgrid/offline', () => ({ createMemoryDb: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { configureOfflineMaps } = require('@resgrid/features/offline-maps') as { configureOfflineMaps: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { registerOfflineMapPacks, createOfflineMapsHydrationStep } = require('@resgrid/maps') as { registerOfflineMapPacks: jest.Mock; createOfflineMapsHydrationStep: jest.Mock };

function fakeManager() {
  return {
    init: jest.fn(async () => undefined),
    updateConfig: jest.fn(),
    onSessionChanged: jest.fn(async () => undefined),
    autoSync: jest.fn(async () => ({ ok: true })),
    refreshSelection: jest.fn(async () => ({ ok: true })),
    isHydrationCurrent: jest.fn(async () => true),
  };
}

const call = (id: string, lat: string, lon: string, geolocation = ''): MockCall => ({ CallId: id, Latitude: lat, Longitude: lon, Geolocation: geolocation });

describe('offline maps wiring', () => {
  beforeEach(() => {
    resetOfflineMapsWiringForTests();
    jest.clearAllMocks();
    mockScope = { server: 'https://api.example.com', departmentId: 7, userId: 'u1' };
    mockPolicy = { incidents: true, corridors: true };
    mockShellStore.setState({ departmentConfig: null });
    mockActiveSession.setState({ activeCallId: null });
    mockCalls.setState({ calls: [] });
    mockCommand.setState({ activeCallId: null, boards: {} });
    mockRoutes.setState({ activePlan: null });
    mockConnectivity.online = true;
    mockLifecycle.active = true;
  });

  it('builds the manager from the offline runtime and hands it to Settings, the offline registries and hydration', async () => {
    const manager = fakeManager();
    const create = jest.fn(() => manager as never);
    expect(await startOfflineMaps(create)).toBe(manager);
    const input = (create.mock.calls[0] as unknown as [Record<string, unknown> & { getScope: () => unknown; getApiBaseUrl: () => string; packSelection: { policy: unknown; getFocus: () => unknown } }])[0];
    expect(input).toEqual(expect.objectContaining({ db: mockRuntime.db, kv: mockRuntime.storage.main }));
    expect(input.getScope()).toEqual({ serverUrl: 'https://api.example.com', departmentId: '7', userId: 'u1' });
    expect(input.getApiBaseUrl()).toBe('https://api.example.com/api/v4');
    expect(input.packSelection.policy).toEqual({ incidents: true, corridors: true });
    expect(input.packSelection.getFocus).toBe(offlinePackFocus);
    expect(manager.init).toHaveBeenCalled();
    expect(registerOfflineMapPacks).toHaveBeenCalledWith(manager);
    expect(createOfflineMapsHydrationStep).toHaveBeenCalledWith(manager);
    expect(mockSync.registerHydrationStep).toHaveBeenCalledWith({ id: 'maps.offline-packs', manager });
    expect(configureOfflineMaps).toHaveBeenCalledWith({ controller: manager });

    // Built once.
    expect(await startOfflineMaps(create)).toBe(manager);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('waits for a platform that builds the manager asynchronously (web and Electron open the OPFS registry first)', async () => {
    const manager = fakeManager();
    expect(await startOfflineMaps(async () => manager as never)).toBe(manager);
    expect(manager.init).toHaveBeenCalled();
    expect(configureOfflineMaps).toHaveBeenCalledWith({ controller: manager });
  });

  it('does nothing where the platform has no pack storage', async () => {
    expect(await startOfflineMaps(() => null)).toBeNull();
    expect(configureOfflineMaps).not.toHaveBeenCalled();
    expect(mockSync.registerHydrationStep).not.toHaveBeenCalled();
  });

  it('follows the department config, scope switches, reconnects and coming back to the foreground', async () => {
    const manager = fakeManager();
    await startOfflineMaps(() => manager as never);

    mockShellStore.setState({ departmentConfig: { MapUrl: 'x' } });
    expect(manager.updateConfig).toHaveBeenLastCalledWith({ MapUrl: 'x' });

    mockScope = { server: 'https://api.example.com', departmentId: 8, userId: 'u1' };
    mockSecurityStore.setState({ departmentId: 8 });
    expect(manager.onSessionChanged).toHaveBeenCalledTimes(1);

    mockConnectivity.online = false;
    mockConnectivity.listeners.forEach((listener) => listener(false));
    mockConnectivity.online = true;
    mockConnectivity.listeners.forEach((listener) => listener(true));
    expect(manager.autoSync).toHaveBeenCalledTimes(1);

    mockLifecycle.active = false;
    mockLifecycle.listeners.forEach((listener) => listener());
    mockLifecycle.active = true;
    mockLifecycle.listeners.forEach((listener) => listener());
    expect(manager.autoSync).toHaveBeenCalledTimes(2);

    // Signed out: no scope switch and no foreground sync.
    mockScope = null;
    mockAuthStore.setState({ userId: null });
    expect(manager.onSessionChanged).toHaveBeenCalledTimes(1);
    mockLifecycle.active = false;
    mockLifecycle.listeners.forEach((listener) => listener());
    mockLifecycle.active = true;
    mockLifecycle.listeners.forEach((listener) => listener());
    expect(manager.autoSync).toHaveBeenCalledTimes(2);
  });

  it('re-plans incident and corridor packs when the device’s focus changes, only where the variant has them', async () => {
    const manager = fakeManager();
    await startOfflineMaps(() => manager as never);
    mockCalls.setState({ calls: [call('5', '38.4', '-121.1')] });
    expect(manager.refreshSelection).not.toHaveBeenCalled();
    mockActiveSession.setState({ activeCallId: '5' });
    expect(manager.refreshSelection).toHaveBeenCalledTimes(1);
    // An unrelated change (same focus) does not re-plan.
    mockCalls.setState({ calls: [call('5', '38.4', '-121.1'), call('6', '1', '1')] });
    expect(manager.refreshSelection).toHaveBeenCalledTimes(1);

    resetOfflineMapsWiringForTests();
    mockPolicy = { incidents: false, corridors: false };
    const display = fakeManager();
    await startOfflineMaps(() => display as never);
    mockActiveSession.setState({ activeCallId: '6' });
    expect(display.refreshSelection).not.toHaveBeenCalled();
  });

  it('derives the focus from the active call, commanded incidents and the unit’s route plan', () => {
    mockCalls.setState({ calls: [call('5', '38.4', '-121.1'), call('7', '', '', '38.6,-121.3'), call('8', '0', '0'), call('9', '39', '-120')] });
    mockActiveSession.setState({ activeCallId: '5' });
    mockCommand.setState({ activeCallId: '7', boards: { '7': {}, '8': {}, missing: {} } });
    mockRoutes.setState({
      activePlan: {
        RoutePlanId: 'plan-1',
        MapboxRouteGeometry: JSON.stringify({
          type: 'LineString',
          coordinates: [
            [-121, 38.4],
            [-120.7, 38.45],
          ],
        }),
        Stops: [],
      },
    });
    expect(offlinePackFocus()).toEqual({
      // Ids match the cells Core lists for them, loaded or not; positions only for older servers.
      callIds: ['5', '7', '8', 'missing'],
      routePlanIds: ['plan-1'],
      incidentPoints: [
        [-121.1, 38.4],
        [-121.3, 38.6],
      ],
      corridorLines: [
        [
          [-121, 38.4],
          [-120.7, 38.45],
        ],
      ],
    });

    // No stored geometry: the stops in order.
    mockRoutes.setState({
      activePlan: {
        MapboxRouteGeometry: 'not json',
        Stops: [
          { StopOrder: 2, Latitude: 38.5, Longitude: -120.9 },
          { StopOrder: 1, Latitude: 38.4, Longitude: -121 },
        ],
      },
    });
    expect(offlinePackFocus().corridorLines).toEqual([
      [
        [-121, 38.4],
        [-120.9, 38.5],
      ],
    ]);
  });

  it('registers the startup build and the sign-in rescope at their places (hydration runs the maps step)', async () => {
    registerOfflineMapsSteps();
    expect(mockSteps.map((entry) => [entry.phase, entry.step.id, entry.position?.after])).toEqual([
      ['startup', 'startup.offline-maps', 'startup.packages'],
      ['session', 'session.offline-maps', 'session.gates'],
    ]);
    // Without a manager (web) the session step is a no-op.
    await expect(Promise.resolve(mockSteps[1].step.run())).resolves.toBeUndefined();
  });

  it('maps the shell session scope to the pack scope', () => {
    expect(offlinePackScope()).toEqual({ serverUrl: 'https://api.example.com', departmentId: '7', userId: 'u1' });
    mockScope = null;
    expect(offlinePackScope()).toBeNull();
  });
});
