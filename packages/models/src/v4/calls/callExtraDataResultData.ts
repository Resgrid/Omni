import { CallPriorityResultData } from '../callPriorities/callPriorityResultData';
import { type CallProtocolsResultData } from '../callProtocols/callProtocolsResultData';
import { type DispatchedEventResultData } from './dispatchedEventResultData';

export class CallExtraDataResultData {
  public CallFormData: string = '';
  public Activity: DispatchedEventResultData[] = [];
  /** Who is on the call now. Units and directly dispatched people released from it are left out (they are in the lists below). */
  public Dispatches: DispatchedEventResultData[] = [];
  /**
   * Units released (stood down) from the call while it stays open (Type "Unit", Id = unit id, with `ReleasedOn` and
   * `ReleasedBy`). Absent from servers that predate releasing: read it through `getReleasedUnits`, which treats that as none.
   */
  public ReleasedUnits?: DispatchedEventResultData[];
  /**
   * People released from the call (Type "User", Id = user id). Someone reached through a dispatched group or role keeps
   * that group's or role's entry in `Dispatches`, so this list is what takes them off the call. Absent from older servers.
   */
  public ReleasedPersonnel?: DispatchedEventResultData[];
  public Priority: CallPriorityResultData = new CallPriorityResultData();
  public Protocols: CallProtocolsResultData[] = [];
}
