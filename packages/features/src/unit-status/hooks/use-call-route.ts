import { useCapability, useHasModule } from '@resgrid/config';
import { isCallActiveState, RouteInstanceStatus, useCallDetailStore, useRoutesStore } from '@resgrid/data';
import { callHasRoute, callRouteInstanceForUnit, callRouteName, callRoutePlanId, isCallRouteRunning } from '@resgrid/features/calls';
import { useStatusContext } from '@resgrid/features/status';
import { isStopDone } from '@resgrid/features/unit-routes/lib/route-status';
import type { CallResultData } from '@resgrid/models';
import { useMemo } from 'react';

import { isCallRouteLaunching, runOfCall, useCallRouteLaunchStore } from '../lib/call-route-launch';

/** The unit's run of the call's route that is still going. */
export interface CallRouteRun {
  instanceId: string;
  planId: string;
  isPaused: boolean;
  /** Stops checked out or skipped, of all its stops. */
  done: number;
  total: number;
}

export interface CallRouteState {
  /** The call has a route and this app runs it for the device's unit (unit status subject, the routes module, an active unit). */
  canRun: boolean;
  planId: string | null;
  /** The route's name (the call's `RoutePlanName`, else the routes a call may run); empty when unknown. */
  name: string;
  run: CallRouteRun | null;
  /** Its start (or continue) is under way. */
  isLaunching: boolean;
}

/**
 * The call's pre-defined route as the device's unit sees it (Core M0322): whether it can run it, and its run that is still
 * going with progress — from the unit's active route (kept fresh by the launcher), else the call detail's route runs.
 */
export function useCallRoute(call: Pick<CallResultData, 'CallId' | 'State' | 'RoutePlanId' | 'RoutePlanName'> | null | undefined): CallRouteState {
  const { subject } = useCapability('status');
  const hasRoutes = useHasModule('unit-routes');
  const { activeUnitId } = useStatusContext();
  const callId = call?.CallId ?? null;
  const callPlans = useRoutesStore((state) => state.callRoutePlans);
  const activeInstance = useRoutesStore((state) => state.activeInstance);
  const instanceStops = useRoutesStore((state) => state.instanceStops);
  const extraData = useCallDetailStore((state) => (callId ? state.details[callId]?.extraData : undefined));
  const isLaunching = useCallRouteLaunchStore((state) => isCallRouteLaunching(state, callId));

  return useMemo<CallRouteState>(() => {
    const planId = callRoutePlanId(call);
    const canRun = subject === 'unit' && hasRoutes && !!activeUnitId && !!call && callHasRoute(call) && isCallActiveState(call.State);
    const name = callRouteName(call, callPlans);

    if (!canRun || !planId) return { canRun: false, planId, name, run: null, isLaunching };
    const live = runOfCall(activeInstance, callId, activeUnitId);

    if (live) {
      // The store's stop progress is the active instance's (GetRouteProgress / GetActiveRouteForUnit read them together).
      const total = instanceStops.length > 0 ? instanceStops.length : live.StopsTotal;
      const done = instanceStops.length > 0 ? instanceStops.filter((stop) => isStopDone(stop.Status)).length : live.StopsCompleted;

      return { canRun, planId, name, run: { instanceId: live.RouteInstanceId, planId: live.RoutePlanId, isPaused: live.Status === RouteInstanceStatus.Paused, done, total }, isLaunching };
    }

    const fromDetail = callRouteInstanceForUnit(extraData, activeUnitId);

    const run =
      fromDetail && isCallRouteRunning(fromDetail)
        ? { instanceId: fromDetail.RouteInstanceId, planId: fromDetail.RoutePlanId, isPaused: fromDetail.Status === RouteInstanceStatus.Paused, done: fromDetail.StopsCompleted, total: fromDetail.StopsTotal }
        : null;

    return { canRun, planId, name, run, isLaunching };
  }, [activeInstance, activeUnitId, call, callId, callPlans, extraData, hasRoutes, instanceStops, isLaunching, subject]);
}
