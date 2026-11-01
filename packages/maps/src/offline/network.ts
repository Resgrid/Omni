import NetInfo, { type NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';

/** What the Wi-Fi-only policy needs to know about the current network. */
export interface OfflineNetworkState {
  isConnected: boolean;
  /** Wi-Fi or Ethernet. */
  isUnmetered: boolean;
  /** Metered (cellular, a phone hotspot) — blocks Wi-Fi-only downloads. */
  isExpensive: boolean;
}

export interface OfflineNetworkProbe {
  getState(): Promise<OfflineNetworkState>;
}

/** Maps a NetInfo state (MapLibre plan §19.5: `type` + `isConnectionExpensive`). Unknown reachability counts as connected. */
export const toOfflineNetworkState = (state: Pick<NetInfoState, 'type' | 'isConnected' | 'isInternetReachable' | 'details'>): OfflineNetworkState => {
  const isConnected = state.isConnected !== false && state.isInternetReachable !== false && state.type !== NetInfoStateType.none;
  const details = state.details as { isConnectionExpensive?: boolean } | null;
  const isUnmetered = state.type === NetInfoStateType.wifi || state.type === NetInfoStateType.ethernet;
  return { isConnected, isUnmetered, isExpensive: details?.isConnectionExpensive === true || state.type === NetInfoStateType.cellular };
};

/** NetInfo-backed probe (iOS/Android). */
export const createNetInfoNetworkProbe = (): OfflineNetworkProbe => ({
  getState: async () => toOfflineNetworkState(await NetInfo.fetch()),
});
