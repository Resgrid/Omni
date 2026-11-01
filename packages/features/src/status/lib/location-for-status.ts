import { type DataLocationFix } from '@resgrid/data';
import { acquireLocationFix, getLocationFixErrorMessage } from '@resgrid/location';

import { type StatusOption } from './status-flow';
import { StatusSubmitError } from './status-submit-error';

/**
 * The fix a status carries. A status whose definition requires GPS takes a live fix at submission (a cached one could
 * be hours old); it is refused with the fix's own message when none can be had. Every other status sends what the data
 * layer already knows (`undefined` = last known position). On-behalf statuses never send the dispatcher's position.
 */
export async function locationForStatus(status: StatusOption, isOnBehalf: boolean): Promise<DataLocationFix | null | undefined> {
  if (isOnBehalf) return null;
  if (!status.Gps) return undefined;
  const fix = await acquireLocationFix();
  if (fix.outcome !== 'acquired' || !fix.location) {
    throw new StatusSubmitError(getLocationFixErrorMessage(fix.outcome === 'acquired' ? 'unavailable' : fix.outcome));
  }
  return fix.location.coords;
}
