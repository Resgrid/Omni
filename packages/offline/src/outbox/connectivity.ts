import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

/** Injected network state, so drain gating and reconnect triggers are testable and platform-neutral. */
export interface ConnectivitySource {
  isOnline(): boolean;
  /** Called on every change; returns an unsubscribe function. */
  subscribe(listener: (online: boolean) => void): () => void;
  /**
   * Called when the device moves to another network while staying online (Wi-Fi ↔ cellular, a new address). Sockets
   * opened on the old network are dead: long-lived media connections (voice channels, audio streams) reconnect on it
   * instead of waiting for a timeout. Optional: a source without it only reports online/offline.
   */
  subscribeNetworkChange?(listener: () => void): () => void;
}

export interface ManualConnectivitySource extends ConnectivitySource {
  setOnline(online: boolean): void;
  /** A handover to another network while online. */
  changeNetwork(): void;
  subscribeNetworkChange(listener: () => void): () => void;
}

/** For tests and hosts that drive connectivity themselves. */
export function createManualConnectivitySource(initialOnline = true): ManualConnectivitySource {
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

/**
 * Online unless NetInfo positively says otherwise. Unknown reachability (`null`) counts as online:
 * it reads null while being probed and on networks that block the probe but reach Resgrid (Unit).
 */
export const isNetInfoOnline = (state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean => state.isConnected !== false && state.isInternetReachable !== false;

/**
 * Whether two online NetInfo states are on different networks: another transport (Wi-Fi ↔ cellular). Sockets opened on
 * the old one are dead even though the device never went offline.
 */
export const isNetworkHandover = (previous: Pick<NetInfoState, 'type'>, next: Pick<NetInfoState, 'type'>): boolean => previous.type !== next.type;

/** NetInfo-backed source with a single native listener however many subscribers attach. */
export function createNetInfoConnectivitySource(): ConnectivitySource & { dispose(): void } {
  const source = createManualConnectivitySource(true);
  let lastOnline: Pick<NetInfoState, 'type'> | null = null;

  const update = (state: NetInfoState): void => {
    const online = isNetInfoOnline(state);
    const wasOnline = source.isOnline();
    source.setOnline(online);

    if (!online) {
      lastOnline = null;

      return;
    }

    if (wasOnline && lastOnline && isNetworkHandover(lastOnline, state)) source.changeNetwork();
    lastOnline = { type: state.type };
  };

  const unsubscribe = NetInfo.addEventListener(update);
  NetInfo.fetch()
    .then(update)
    .catch(() => undefined);

  return {
    isOnline: source.isOnline,
    subscribe: source.subscribe,
    subscribeNetworkChange: source.subscribeNetworkChange,
    dispose: unsubscribe,
  };
}
