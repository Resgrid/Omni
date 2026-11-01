// Minimal react-native for the Node test project: mutable Platform, NativeModules, event emitters and PermissionsAndroid.
type Listener = (...args: any[]) => void;

class FakeEmitter {
  private listeners = new Map<string, Set<Listener>>();

  addListener(event: string, listener: Listener) {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return { remove: () => set.delete(listener) };
  }

  emit(event: string, ...args: any[]) {
    [...(this.listeners.get(event) ?? [])].forEach((listener) => listener(...args));
  }

  listenerCount(event: string) {
    return this.listeners.get(event)?.size ?? 0;
  }

  removeAllListeners() {
    this.listeners.clear();
  }
}

export const Platform: { OS: string; Version: number | string; select: (spec: Record<string, unknown>) => unknown } = {
  OS: 'android',
  Version: 34,
  select: (spec) => spec[Platform.OS] ?? spec.default,
};

export const NativeModules: Record<string, any> = {};

export const DeviceEventEmitter = new FakeEmitter();

/** One emitter per native module so tests can emit iOS module events. */
const moduleEmitters = new Map<unknown, FakeEmitter>();
export const getNativeModuleEmitter = (module: unknown): FakeEmitter => {
  const existing = moduleEmitters.get(module);
  if (existing) return existing;
  const created = new FakeEmitter();
  moduleEmitters.set(module, created);
  return created;
};

export class NativeEventEmitter {
  private emitter: FakeEmitter;
  constructor(module?: unknown) {
    this.emitter = getNativeModuleEmitter(module);
  }
  addListener(event: string, listener: Listener) {
    return this.emitter.addListener(event, listener);
  }
}

export const PermissionsAndroid = {
  PERMISSIONS: {
    RECORD_AUDIO: 'android.permission.RECORD_AUDIO',
    READ_PHONE_STATE: 'android.permission.READ_PHONE_STATE',
    READ_PHONE_NUMBERS: 'android.permission.READ_PHONE_NUMBERS',
    BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
    BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
    ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
  },
  RESULTS: { GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again' },
  check: jest.fn(async () => true),
  request: jest.fn(async () => 'granted'),
  requestMultiple: jest.fn(async (permissions: string[]) => Object.fromEntries(permissions.map((p) => [p, 'granted']))),
};

export const AppState = { currentState: 'active', addEventListener: jest.fn(() => ({ remove: jest.fn() })) };

export type EmitterSubscription = { remove: () => void };
export type NativeModule = Record<string, unknown>;
export type EventSubscription = { remove: () => void };

export const resetReactNativeFake = (): void => {
  Platform.OS = 'android';
  Platform.Version = 34;
  for (const key of Object.keys(NativeModules)) delete NativeModules[key];
  DeviceEventEmitter.removeAllListeners();
  moduleEmitters.clear();
  PermissionsAndroid.check.mockImplementation(async () => true);
  PermissionsAndroid.request.mockImplementation(async () => 'granted');
  PermissionsAndroid.requestMultiple.mockImplementation(async (permissions: string[]) => Object.fromEntries(permissions.map((p) => [p, 'granted'])));
};
