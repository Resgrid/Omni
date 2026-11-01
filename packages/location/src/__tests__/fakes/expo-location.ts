// expo-location fake: permissions, watchers and task registration in memory; tests drive fixes with
// __emitWatcherFix() and change grants with __setForeground()/__setBackground().
import { __registerTask, __unregisterTask } from './expo-task-manager';

export enum LocationAccuracy {
  Lowest = 1,
  Low = 2,
  Balanced = 3,
  High = 4,
  Highest = 5,
  BestForNavigation = 6,
}
export const Accuracy = LocationAccuracy;

export enum LocationActivityType {
  Other = 1,
  AutomotiveNavigation = 2,
  Fitness = 3,
  OtherNavigation = 4,
  Airborne = 5,
}
export const ActivityType = LocationActivityType;

export const PermissionStatus = { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' } as const;

export interface FakePermission {
  status: 'granted' | 'denied' | 'undetermined';
  granted: boolean;
  canAskAgain: boolean;
  expires: 'never';
}

export interface FakeLocationObject {
  coords: { latitude: number; longitude: number; altitude: number | null; accuracy: number | null; altitudeAccuracy: number | null; heading: number | null; speed: number | null };
  timestamp: number;
}

interface Watcher {
  options: unknown;
  callback: (location: FakeLocationObject) => void;
  errorHandler?: (reason: string) => void;
  removed: boolean;
}

export const permission = (status: FakePermission['status'], canAskAgain = true): FakePermission => ({ status, granted: status === 'granted', canAskAgain, expires: 'never' });

const state = {
  foreground: permission('granted'),
  background: permission('granted'),
  /** What a foreground request answers (defaults to granting). */
  foregroundAnswer: permission('granted'),
  backgroundAnswer: permission('granted'),
  watchers: [] as Watcher[],
};

const resets: (() => void)[] = [];

const fakeFn = <A extends unknown[], R>(impl: (...args: A) => R): jest.Mock<R, A> => {
  const fn = jest.fn(impl);
  resets.push(() => {
    fn.mockReset();
    fn.mockImplementation(impl);
  });
  return fn;
};

export const getForegroundPermissionsAsync = fakeFn(async (): Promise<FakePermission> => state.foreground);
export const requestForegroundPermissionsAsync = fakeFn(async (): Promise<FakePermission> => {
  state.foreground = state.foregroundAnswer;
  return state.foreground;
});
export const getBackgroundPermissionsAsync = fakeFn(async (): Promise<FakePermission> => state.background);
export const requestBackgroundPermissionsAsync = fakeFn(async (): Promise<FakePermission> => {
  state.background = state.backgroundAnswer;
  return state.background;
});
export const hasServicesEnabledAsync = fakeFn(async (): Promise<boolean> => true);
export const getCurrentPositionAsync = fakeFn(async (_options?: unknown): Promise<FakeLocationObject> => makeLocation());
export const getLastKnownPositionAsync = fakeFn(async (_options?: unknown): Promise<FakeLocationObject | null> => null);

export const watchPositionAsync = fakeFn(async (options: unknown, callback: (location: FakeLocationObject) => void, errorHandler?: (reason: string) => void) => {
  const watcher: Watcher = { options, callback, errorHandler, removed: false };
  state.watchers.push(watcher);
  return {
    remove: jest.fn(() => {
      watcher.removed = true;
    }),
  };
});

export const startLocationUpdatesAsync = fakeFn(async (taskName: string, options?: unknown): Promise<void> => {
  __registerTask(taskName, options ?? {});
});
export const stopLocationUpdatesAsync = fakeFn(async (taskName: string): Promise<void> => {
  __unregisterTask(taskName);
});

export function makeLocation(overrides: Partial<FakeLocationObject['coords']> = {}, timestamp = Date.now()): FakeLocationObject {
  return {
    coords: { latitude: 37.7749, longitude: -122.4194, altitude: 10, accuracy: 5, altitudeAccuracy: 3, heading: 90, speed: 4, ...overrides },
    timestamp,
  };
}

export function __setForeground(status: FakePermission['status'], canAskAgain = true): void {
  state.foreground = permission(status, canAskAgain);
}

export function __setBackground(status: FakePermission['status'], canAskAgain = true): void {
  state.background = permission(status, canAskAgain);
}

export function __setForegroundAnswer(status: FakePermission['status'], canAskAgain = true): void {
  state.foregroundAnswer = permission(status, canAskAgain);
}

export function __setBackgroundAnswer(status: FakePermission['status'], canAskAgain = true): void {
  state.backgroundAnswer = permission(status, canAskAgain);
}

export function __activeWatchers(): number {
  return state.watchers.filter((watcher) => !watcher.removed).length;
}

/** Delivers a fix to every live watcher. */
export function __emitWatcherFix(location: FakeLocationObject): void {
  state.watchers.filter((watcher) => !watcher.removed).forEach((watcher) => watcher.callback(location));
}

export function __resetLocation(): void {
  state.foreground = permission('granted');
  state.background = permission('granted');
  state.foregroundAnswer = permission('granted');
  state.backgroundAnswer = permission('granted');
  state.watchers = [];
  resets.forEach((reset) => reset());
}
