/**
 * Minimal external store for `useSyncExternalStore`: no zustand, so the module stays importable from the app entry and
 * from headless background launches. Listeners get the new and previous state; `setState` with an identical value
 * notifies nobody.
 */
export interface ObservableStore<T> {
  getState(): T;
  setState(next: T | ((current: T) => T)): void;
  subscribe(listener: (state: T, previous: T) => void): () => void;
}

export function createObservableStore<T>(initial: T): ObservableStore<T> {
  let state = initial;
  const listeners = new Set<(state: T, previous: T) => void>();
  return {
    getState: () => state,
    setState(next) {
      const value = typeof next === 'function' ? (next as (current: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      const previous = state;
      state = value;
      for (const listener of [...listeners]) {
        try {
          listener(state, previous);
        } catch {
          // One failing subscriber must not stop the others.
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
