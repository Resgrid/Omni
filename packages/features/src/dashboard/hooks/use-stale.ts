import { useIsOnline } from '@resgrid/features/calls';

/**
 * Whether a widget is showing its last known data rather than live data (plan §8.5: BigBoard reads offline with stale
 * indicators): it has data, and either the device is offline or the latest refresh failed.
 */
export function useStale(hasData: boolean, hasError: boolean): boolean {
  const isOnline = useIsOnline();
  return hasData && (hasError || !isOnline);
}
