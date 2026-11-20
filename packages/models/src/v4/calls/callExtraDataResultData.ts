import { CallPriorityResultData } from '../callPriorities/callPriorityResultData';
import { type CallProtocolsResultData } from '../callProtocols/callProtocolsResultData';
import { type DispatchedEventResultData } from './dispatchedEventResultData';

/** A route run started for a call (Core M0322, `CallRouteInstanceResultData`): one per unit that started the call's route. */
export interface CallRouteInstanceResultData {
  RouteInstanceId: string;
  RoutePlanId: string;
  RoutePlanName: string | null;
  UnitId: number;
  UnitName: string | null;
  /** Core `RouteInstanceStatus`: 0 Scheduled, 1 InProgress, 2 Completed, 3 Cancelled, 4 Abandoned, 5 Paused. */
  Status: number;
  StopsCompleted: number;
  StopsTotal: number;
  /** ISO-8601 UTC. */
  ActualStartOn: string | null;
  ActualEndOn: string | null;
  /** When the unit reached the route's start (the leading leg to a station or start point), ISO-8601 UTC; null until then. */
  StartReachedOn: string | null;
}

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
  /** Route runs started for this call (Core M0322). Absent from older servers: read it through `callRouteInstancesOf`. */
  public RouteInstances?: CallRouteInstanceResultData[];
}
