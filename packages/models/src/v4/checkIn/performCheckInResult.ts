import { BaseV4Request } from '../baseV4Request';

/** Response of `CheckInTimers/PerformCheckIn`: Core returns the new check-in record id in `Id` (no `Data`). */
export class PerformCheckInResult extends BaseV4Request {
  public Id: string = '';
}
