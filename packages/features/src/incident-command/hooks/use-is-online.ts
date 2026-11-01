import { useNetInfo } from '@react-native-community/netinfo';
import { isNetInfoOnline } from '@resgrid/offline';

/** True unless NetInfo positively reports no connection (the outbox's rule). Local copy: the calls feature imports this one. */
export function useIsOnline(): boolean {
  return isNetInfoOnline(useNetInfo());
}
