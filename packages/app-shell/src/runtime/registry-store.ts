import { useSyncExternalStore } from 'react';

/** A tiny observable value for registries that components read (screens, slots, overlays). */
export interface RegistryStore<T> {
  get(): T;
  set(next: T): void;
  update(fn: (current: T) => T): void;
  subscribe(listener: () => void): () => void;
  useValue(): T;
}

export function createRegistryStore<T>(initial: T): RegistryStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  const store: RegistryStore<T> = {
    get: () => value,
    set(next) {
      value = next;
      listeners.forEach((listener) => listener());
    },
    update(fn) {
      store.set(fn(value));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    useValue: () => useSyncExternalStore(store.subscribe, store.get, store.get),
  };
  return store;
}
