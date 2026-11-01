import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

/** Injected network state, so drain gating and reconnect triggers are testable and platform-neutral. */
export interface ConnectivitySource {
  isOnline(): boolean;
  /** Called on every change; returns an unsubscribe function. */
  subscribe(listener: (online: boolean) => void): () => void;
}

export interface ManualConnectivitySource extends ConnectivitySource {
  setOnline(online: boolean): void;
}

/** For tests and hosts that drive connectivity themselves. */
export function createManualConnectivitySource(initialOnline = true): ManualConnectivitySource {
  let online = initialOnline;
  const listeners = new Set<(online: boolean) => void>();
  return {
    isOnline: () => online,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setOnline: (next) => {
      if (next === online) return;
      online = next;
      listeners.forEach((listener) => listener(next));
    },
  };
}

/**
 * Online unless NetInfo positively says otherwise. Unknown reachability (`null`) counts as online:
 * it reads null while being probed and on networks that block the probe but reach Resgrid (Unit).
 */
export const isNetInfoOnline = (state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean => state.isConnected !== false && state.isInternetReachable !== false;

/** NetInfo-backed source with a single native listener however many subscribers attach. */
export function createNetInfoConnectivitySource(): ConnectivitySource & { dispose(): void } {
  const source = createManualConnectivitySource(true);
  const unsubscribe = NetInfo.addEventListener((state) => source.setOnline(isNetInfoOnline(state)));
  NetInfo.fetch()
    .then((state) => source.setOnline(isNetInfoOnline(state)))
    .catch(() => undefined);
  return {
    isOnline: source.isOnline,
    subscribe: source.subscribe,
    dispose: unsubscribe,
  };
}
