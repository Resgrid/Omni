// react-native fake: settable Platform.OS and an AppState whose changes tests drive with __setAppState().
type AppStateListener = (state: string) => void;

const listeners = new Set<AppStateListener>();

export const Platform = {
  OS: 'ios' as string,
  select<T>(spec: Record<string, T>): T | undefined {
    return spec[Platform.OS] ?? spec.default;
  },
};

export const AppState = {
  currentState: 'active' as string,
  addEventListener: jest.fn((_event: string, listener: AppStateListener) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  }),
};

export const I18nManager = { isRTL: false, allowRTL: (): void => undefined, forceRTL: (): void => undefined };

/** Changes the app state and notifies listeners, as React Native does (currentState first). */
export function __setAppState(state: string): void {
  AppState.currentState = state;
  [...listeners].forEach((listener) => listener(state));
}

export function __appStateListenerCount(): number {
  return listeners.size;
}

export function __resetReactNative(): void {
  Platform.OS = 'ios';
  AppState.currentState = 'active';
  listeners.clear();
}
