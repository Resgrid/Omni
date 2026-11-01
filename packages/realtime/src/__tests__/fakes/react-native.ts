/** Minimal react-native stand-in for Node tests: Platform (mutable OS) and an AppState tests can drive. */

type AppStateListener = (state: string) => void;

const appStateListeners = new Set<AppStateListener>();

export const Platform = {
  OS: 'ios' as string,
  select<T>(options: Record<string, T>): T | undefined {
    return options[Platform.OS] ?? options.default;
  },
};

export const AppState = {
  currentState: 'active' as string,
  addEventListener(_event: string, listener: AppStateListener): { remove: () => void } {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  },
};

/** Test control: deliver an AppState change to every listener. */
export const emitAppState = (state: string): void => {
  AppState.currentState = state;
  appStateListeners.forEach((listener) => listener(state));
};

export const appStateListenerCount = (): number => appStateListeners.size;
