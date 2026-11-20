import { useCapability, useHasModule } from '@resgrid/config';
import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { isCallActiveState, RouteInstanceStatus, selectCallById, useCallDetailStore, useCallsStore, useRoutesStore } from '@resgrid/data';
import { callHasRoute } from '@resgrid/features/calls';
import { useInAppNavigationAvailable } from '@resgrid/features/navigation/hooks/use-in-app-navigation';
import { onActiveCallChanged, useStatusContext } from '@resgrid/features/status';
import { unitRoutesRoutes } from '@resgrid/features/unit-routes/routes';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData, RouteInstanceResultData } from '@resgrid/models';
import { useToast } from '@resgrid/ui';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { type CallRouteConflict, onCallRouteLaunchRequested, runOfCall, runScreenPath, useCallRouteLaunchStore } from '../lib/call-route-launch';
import { type RouteConflictChoice, RouteConflictDialog } from './route-conflict-dialog';

/** The call from the calls list, else from its loaded detail, else read now; null when it cannot be found. */
const findCall = async (callId: string): Promise<CallResultData | null> => {
  const known = selectCallById(useCallsStore.getState(), callId) ?? useCallDetailStore.getState().details[callId]?.call ?? null;

  if (known) return known;

  try {
    await useCallDetailStore.getState().fetchCallDetail(callId);
  } catch {
    return null;
  }

  return useCallDetailStore.getState().details[callId]?.call ?? null;
};

const setLaunching = (launchingCallId: string | null): void => useCallRouteLaunchStore.setState({ launchingCallId });

const setConflict = (conflict: CallRouteConflict | null): void => useCallRouteLaunchStore.setState({ conflict });

/**
 * Runs a call's pre-defined route on the Unit (Core M0322), mounted once as a shell overlay. When the crew makes a call with
 * a route their active call (the call picker, the status sheet's destination step once it closes, "Set Active", the map)
 * or taps "Start route" / "Continue route", it starts the unit's run (`StartCallRoute`, idempotent per call; a paused run
 * is resumed) and opens in-app navigation through its stops — leading to the route's start first — where the app can
 * navigate, else the running route screen. When the unit runs another route it asks to end or cancel that one, or keep it.
 * At start it refreshes the unit's running (or paused) route, so a run that outlived the app is picked up again.
 *
 * Inert where the device does not report status for a unit, the app has no routes module or no unit is chosen.
 */
export const CallRouteLauncher: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const { subject } = useCapability('status');
  const hasRoutes = useHasModule('unit-routes');
  const navigationInApp = useCapability('maps').navigationInApp;
  const inAppAvailable = useInAppNavigationAvailable();
  const { activeUnitId } = useStatusContext();
  const conflict = useCallRouteLaunchStore((state) => state.conflict);
  const [isResolving, setIsResolving] = useState(false);
  const enabled = subject === 'unit' && hasRoutes && !!activeUnitId;
  const inAppNavigation = navigationInApp && inAppAvailable;

  // A run that outlived the app (or was started elsewhere) is the unit's active route again.
  useEffect(() => {
    if (enabled && activeUnitId) void useRoutesStore.getState().fetchActiveRoute(activeUnitId);
  }, [activeUnitId, enabled]);

  const showError = useCallback((messageKey: string | null | undefined) => toast.error(t(messageKey ?? 'common.errorOccurred')), [t, toast]);

  const openRun = useCallback(
    async (instance: RouteInstanceResultData) => {
      // A paused run is resumed: the crew asked to drive it. Without the server it stays paused, on its own screen.
      if (instance.Status === RouteInstanceStatus.Paused && !(await useRoutesStore.getState().resumeRouteInstance(instance.RouteInstanceId))) {
        showError(useRoutesStore.getState().actionError?.messageKey);
        pushRoutePath(router, unitRoutesRoutes.active(instance.RoutePlanId, instance.RouteInstanceId));

        return;
      }

      pushRoutePath(router, runScreenPath(instance, inAppNavigation));
    },
    [inAppNavigation, showError]
  );

  const launch = useCallback(
    async (callId: string) => {
      // One launch per call at a time: picking the call and tapping its route button together starts it once.
      if (!enabled || !activeUnitId || useCallRouteLaunchStore.getState().launchingCallId === callId) return;
      setLaunching(callId);

      try {
        const call = await findCall(callId);

        if (!call || !callHasRoute(call) || !isCallActiveState(call.State)) return;
        const routes = useRoutesStore.getState();
        const result = await routes.startCallRoute(callId, activeUnitId);

        if (result.status === 'started') {
          await openRun(result.instance);

          return;
        }

        if (result.status === 'route_in_progress') {
          // Named by the 409's detail; the unit's active route (read again) gives its name.
          await useRoutesStore.getState().fetchActiveRoute(activeUnitId, { bypassCache: true });
          const running = useRoutesStore.getState().activeInstance;
          const existingInstanceId = result.existingInstanceId ?? running?.RouteInstanceId ?? null;
          const existingName = running && running.RouteInstanceId === existingInstanceId ? running.RoutePlanName || null : null;
          setConflict({ callId, existingInstanceId, existingName });

          return;
        }

        // Offline (or refused): a run of this call the device already knows still opens, else the crew hears why.
        const known = runOfCall(useRoutesStore.getState().activeInstance, callId, activeUnitId);

        if (known) pushRoutePath(router, runScreenPath(known, inAppNavigation));
        else showError(result.error.messageKey);
      } finally {
        setLaunching(null);
      }
    },
    [activeUnitId, enabled, inAppNavigation, openRun, showError]
  );

  // Listeners subscribe once and always call the newest launch.
  const launchRef = useRef(launch);

  useEffect(() => {
    launchRef.current = launch;
  }, [launch]);

  useEffect(() => {
    const offSelected = onActiveCallChanged((callId) => void launchRef.current(callId));
    const offRequested = onCallRouteLaunchRequested((callId) => void launchRef.current(callId));

    return () => {
      offSelected();
      offRequested();
    };
  }, []);

  const resolve = useCallback(
    async (choice: RouteConflictChoice) => {
      const current = useCallRouteLaunchStore.getState().conflict;

      if (!current) return;

      if (choice === 'keep' || !current.existingInstanceId) {
        setConflict(null);

        return;
      }

      setIsResolving(true);
      const routes = useRoutesStore.getState();
      const ended = choice === 'end' ? await routes.endRouteInstance(current.existingInstanceId) : await routes.cancelRouteInstance(current.existingInstanceId);
      setIsResolving(false);

      if (!ended) {
        showError(useRoutesStore.getState().actionError?.messageKey);

        return;
      }

      setConflict(null);
      await launch(current.callId);
    },
    [launch, showError]
  );

  if (!enabled) return null;

  return <RouteConflictDialog isOpen={conflict !== null} existingName={conflict?.existingName ?? null} canReplace={!!conflict?.existingInstanceId} isBusy={isResolving} onChoose={(choice) => void resolve(choice)} />;
};
