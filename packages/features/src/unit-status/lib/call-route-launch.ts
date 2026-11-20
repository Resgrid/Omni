import { RouteInstanceStatus } from '@resgrid/data';
import { navigationRoutes } from '@resgrid/features/navigation/routes';
import { unitRoutesRoutes } from '@resgrid/features/unit-routes/routes';
import type { RouteInstanceResultData } from '@resgrid/models';
import { create } from 'zustand';

/**
 * A call's pre-defined route on the Unit (Core M0322). When the crew makes a call with a route their active call — or taps
 * "Start route" / "Continue route" — the unit's run of it starts (`Routes/StartCallRoute`, idempotent per call) and opens:
 * in-app navigation through its stops where the app can navigate, else the running route screen. One launcher (the
 * `CallRouteLauncher` shell overlay) does it for every path; this module holds what the buttons and the overlay share.
 */

/** The unit runs another route (409 `route_in_progress`): the crew ends or cancels it to start the call's route, or keeps it. */
export interface CallRouteConflict {
  callId: string;
  /** The unit whose start was refused: the conflict is that unit's, and goes away when another unit is chosen. */
  unitId: string;
  /** The run the unit has going (the ProblemDetails `detail`, else the unit's active route); null when unknown. */
  existingInstanceId: string | null;
  existingName: string | null;
}

interface CallRouteLaunchState {
  /** The calls whose route is being started, one entry per launch under way (their buttons show they are busy). */
  launchingCallIds: string[];
  conflict: CallRouteConflict | null;
}

export const useCallRouteLaunchStore = create<CallRouteLaunchState>()(() => ({ launchingCallIds: [], conflict: null }));

/** Whether a start (or continue) of this call's route is under way. */
export const isCallRouteLaunching = (state: Pick<CallRouteLaunchState, 'launchingCallIds'>, callId: string | null | undefined): boolean => !!callId && state.launchingCallIds.includes(callId);

type LaunchListener = (callId: string) => void;

const listeners = new Set<LaunchListener>();

/** Starts (or continues) the call's route for the active unit: handled by the mounted `CallRouteLauncher`. */
export function requestCallRouteLaunch(callId: string): void {
  for (const listener of [...listeners]) listener(callId);
}

/** The launcher listens here; returns the unsubscribe. */
export function onCallRouteLaunchRequested(listener: LaunchListener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** A run that is still going: in progress or paused. */
export const isRunGoing = (status: number | null | undefined): boolean => status === RouteInstanceStatus.InProgress || status === RouteInstanceStatus.Paused;

/** The unit's run of this call that is still going, from the unit's active route; null when it runs none (or another). */
export const runOfCall = (instance: RouteInstanceResultData | null | undefined, callId: string | null | undefined, unitId: string | null | undefined): RouteInstanceResultData | null => {
  if (!instance || !callId || !unitId || !isRunGoing(instance.Status)) return null;

  return String(instance.CallId ?? '') === callId && String(instance.UnitId) === unitId ? instance : null;
};

/** Where a started run opens: in-app navigation through its stops where the app can navigate, else the running route screen. */
export const runScreenPath = (instance: Pick<RouteInstanceResultData, 'RouteInstanceId' | 'RoutePlanId'>, inAppNavigation: boolean): string | null =>
  inAppNavigation ? navigationRoutes.toRouteStops(instance.RouteInstanceId) : unitRoutesRoutes.active(instance.RoutePlanId, instance.RouteInstanceId);

/** Test helper. */
export function resetCallRouteLaunchForTests(): void {
  listeners.clear();
  useCallRouteLaunchStore.setState({ launchingCallIds: [], conflict: null });
}
