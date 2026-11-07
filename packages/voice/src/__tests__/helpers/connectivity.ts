import type { ConnectivitySource } from '@resgrid/offline';

export interface TestConnectivity extends ConnectivitySource {
  setOnline(online: boolean): void;
  /** A Wi-Fi ↔ cellular handover while online. */
  changeNetwork(): void;
}

/** A drivable connectivity source (the voice tests cannot load @resgrid/offline's runtime). */
export function createTestConnectivity(initialOnline = true): TestConnectivity {
  let online = initialOnline;
  const listeners = new Set<(online: boolean) => void>();
  const networkListeners = new Set<() => void>();

  return {
    isOnline: () => online,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    subscribeNetworkChange: (listener) => {
      networkListeners.add(listener);

      return () => networkListeners.delete(listener);
    },
    setOnline: (next) => {
      if (next === online) return;
      online = next;
      listeners.forEach((listener) => listener(next));
    },
    changeNetwork: () => {
      if (online) networkListeners.forEach((listener) => listener());
    },
  };
}
