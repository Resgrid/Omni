// The department config's signed map URLs (apps/omni/map-config-refresh.ts): fetched again before the first signature
// expires, on foreground once overdue, at most one request at a time and not again right after a failure.
import { MAP_CONFIG_CHECK_MAX_MS, MAP_CONFIG_RETRY_MS, refreshDepartmentConfigNow, resetMapConfigRefreshForTests, startMapConfigRefresh } from '../map-config-refresh';

type Listener<T> = (state: T, previous: T) => void;

interface MockShellState {
  departmentConfig: Record<string, unknown> | null;
}

const mockShell = (() => {
  let state: MockShellState = { departmentConfig: null };
  const listeners = new Set<Listener<MockShellState>>();
  return {
    getState: () => state,
    setState: (patch: Partial<MockShellState>) => {
      const previous = state;
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener(state, previous));
    },
    subscribe: (listener: Listener<MockShellState>) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
})();
const mockLifecycle = { active: true, listeners: new Set<() => void>() };
const mockLoad = jest.fn(async (_options?: { forceRefresh?: boolean }) => undefined);
let mockSignedIn = true;

jest.mock('@resgrid/app-shell', () => ({
  getSessionScope: () => (mockSignedIn ? { server: 'https://api.example.com', departmentId: 7, userId: 'u1' } : null),
  loadDepartmentConfig: (options?: { forceRefresh?: boolean }) => mockLoad(options),
  registerInitStep: jest.fn(),
  get useShellStore() {
    return mockShell;
  },
}));
jest.mock('@resgrid/core', () => ({
  getAppLifecycleState: () => ({ isActive: mockLifecycle.active }),
  subscribeAppLifecycle: (listener: () => void) => {
    mockLifecycle.listeners.add(listener);
    return () => mockLifecycle.listeners.delete(listener);
  },
}));
jest.mock('@resgrid/maps', () => ({ mapConfigRefreshAt: jest.requireActual('../../../packages/maps/src/provider/url-signer').mapConfigRefreshAt }));

const HOUR = 60 * 60_000;
const style = (expiresMs: number): string => `https://api.example.com/api/v4/Mapping/GetStyle?night=false&d=7&e=${Math.floor(expiresMs / 1000)}&sig=abc`;
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('map config refresh', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000_000_000);
    mockSignedIn = true;
    mockLoad.mockClear();
    mockShell.setState({ departmentConfig: null });
  });

  afterEach(() => {
    resetMapConfigRefreshForTests();
    jest.useRealTimers();
  });

  it('fetches the config again shortly before its signed URLs expire, in short timer steps', async () => {
    mockShell.setState({ departmentConfig: { MapLibreStyleUrlDay: style(Date.now() + 2 * HOUR) } });
    startMapConfigRefresh();
    expect(mockLoad).not.toHaveBeenCalled();

    // Each wake checks again; nothing is due until 30 minutes before the expiry.
    await jest.advanceTimersByTimeAsync(MAP_CONFIG_CHECK_MAX_MS * 5);
    expect(mockLoad).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(HOUR + 30 * 60_000 - MAP_CONFIG_CHECK_MAX_MS * 5);
    expect(mockLoad).toHaveBeenCalledWith({ forceRefresh: true });

    // The new config moves the next refresh out.
    mockLoad.mockClear();
    mockShell.setState({ departmentConfig: { MapLibreStyleUrlDay: style(Date.now() + 24 * HOUR) } });
    await jest.advanceTimersByTimeAsync(10 * HOUR);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('reloads on foreground when overdue, not again right after a failed attempt, and never signed out', async () => {
    mockShell.setState({ departmentConfig: { MapLibreStyleUrlDay: style(Date.now() - 60_000) } });
    startMapConfigRefresh();
    await flush();
    expect(mockLoad).toHaveBeenCalledTimes(1);

    // The reload failed (the config did not change): a foreground right away does not hammer the server.
    mockLifecycle.active = false;
    mockLifecycle.listeners.forEach((listener) => listener());
    mockLifecycle.active = true;
    mockLifecycle.listeners.forEach((listener) => listener());
    await flush();
    expect(mockLoad).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(MAP_CONFIG_RETRY_MS);
    expect(mockLoad).toHaveBeenCalledTimes(2);

    mockSignedIn = false;
    await refreshDepartmentConfigNow();
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it('shares one request between callers (an expired offline manifest URL and the timer)', async () => {
    let release: () => void = () => undefined;
    mockLoad.mockImplementationOnce(() => new Promise<undefined>((resolve) => (release = () => resolve(undefined))));
    const first = refreshDepartmentConfigNow();
    const second = refreshDepartmentConfigNow();
    expect(mockLoad).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
  });

  it('does nothing for a config without signed URLs (older servers)', async () => {
    mockShell.setState({ departmentConfig: { MapUrl: 'https://tiles.example.org/{z}/{x}/{y}.png' } });
    startMapConfigRefresh();
    await jest.advanceTimersByTimeAsync(48 * HOUR);
    expect(mockLoad).not.toHaveBeenCalled();
  });
});
