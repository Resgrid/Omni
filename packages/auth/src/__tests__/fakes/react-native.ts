// Minimal react-native fake for Node tests: Platform and AppState only.
type AppStateListener = (state: string) => void;

const listeners = new Set<AppStateListener>();

export const Platform: { OS: string; select: <T>(choices: Record<string, T>) => T | undefined } = {
  OS: 'ios',
  select: (choices) => choices[Platform.OS] ?? choices.default,
};

export const AppState = {
  currentState: 'active',
  addEventListener: (_event: string, listener: AppStateListener) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  },
};

/** Test helper: move the fake app between active / background. */
export function __setAppState(state: string): void {
  AppState.currentState = state;
  for (const listener of [...listeners]) listener(state);
}

export function __setPlatformOS(os: string): void {
  Platform.OS = os;
}
