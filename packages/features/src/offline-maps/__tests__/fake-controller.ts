import { DEFAULT_OFFLINE_POLICY, type OfflineMapsController, type OfflineMapsState } from '@resgrid/maps/offline';

export const offlineState = (overrides: Partial<OfflineMapsState> = {}): OfflineMapsState => ({
  availability: 'available',
  status: 'idle',
  error: null,
  errorHttpStatus: null,
  manifestVersion: 'm1',
  checkedAt: Date.UTC(2026, 10, 1, 9, 0, 0),
  updatedAt: null,
  isInstalled: false,
  updateAvailable: true,
  stale: false,
  installedBytes: 0,
  pendingBytes: 120 * 1024 * 1024,
  totalBytes: 120 * 1024 * 1024,
  freeBytes: 8 * 1024 * 1024 * 1024,
  progress: null,
  wifiOnly: true,
  packs: [
    { packId: 'department-data', kind: 'department-data', name: 'Department data', sizeBytes: 400_000, installedBytes: null, state: 'not-downloaded', code: null, pinned: true },
    { packId: 'pack:c1', kind: 'basemap', name: 'Cell 1', sizeBytes: 60 * 1024 * 1024, installedBytes: null, state: 'not-downloaded', code: null, pinned: true },
    { packId: 'pack:c2', kind: 'basemap', name: 'Cell 2', sizeBytes: 59 * 1024 * 1024, installedBytes: null, state: 'not-downloaded', code: null, pinned: true },
    { packId: 'pack:m1', kind: 'custom-map', name: 'Station 4 pre-plan', sizeBytes: 2 * 1024 * 1024, installedBytes: null, state: 'not-downloaded', code: null, pinned: false },
    { packId: 'pack:big', kind: 'custom-map', name: 'County aerial', sizeBytes: null, installedBytes: null, state: 'rejected', code: 'pack-too-large', pinned: false },
  ],
  attribution: 'Protomaps © OpenStreetMap',
  policy: DEFAULT_OFFLINE_POLICY,
  responseAreaBytes: 119 * 1024 * 1024,
  responseAreaLimitBytes: 500 * 1024 * 1024,
  ...overrides,
});

export interface FakeController {
  controller: OfflineMapsController & {
    refreshManifest: jest.Mock;
    refreshIfStale: jest.Mock;
    download: jest.Mock;
    cancel: jest.Mock;
    deleteAll: jest.Mock;
    setWifiOnly: jest.Mock;
  };
  setState(patch: Partial<OfflineMapsState>): void;
}

export function createFakeController(initial: OfflineMapsState = offlineState()): FakeController {
  let state = initial;
  const listeners = new Set<() => void>();
  const controller = {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getInstalledSet: () => null,
    refreshManifest: jest.fn(async () => ({ ok: true as const })),
    refreshIfStale: jest.fn(async () => ({ ok: true as const })),
    download: jest.fn(async () => ({ ok: true as const })),
    cancel: jest.fn(),
    deleteAll: jest.fn(async () => undefined),
    setWifiOnly: jest.fn(),
    markUsed: jest.fn(),
  };
  return {
    controller,
    setState(patch) {
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener());
    },
  };
}
