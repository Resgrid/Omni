import { useNetInfo } from '@react-native-community/netinfo';
import { isNetInfoOnline } from '@resgrid/offline';

/**
 * True unless NetInfo positively reports no connection (the outbox's own rule: unknown reachability counts as
 * online). Drives the "you are offline — this call will be queued" banner; the outbox decides what actually queues.
 */
export function useIsOnline(): boolean {
  const state = useNetInfo();
  return isNetInfoOnline(state);
}
