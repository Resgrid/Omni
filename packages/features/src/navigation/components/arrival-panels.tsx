import { selectUnitById, useRoutesStore, useUnitsStore } from '@resgrid/data';
import { ActionBaseTypes, getUnitStatusOptions, UnitStatusSheet } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import type { StatusesResultData, UnitTypeStatusResultData } from '@resgrid/models';
import { isRouteStartLeg, useNavigationStore } from '@resgrid/navigation';
import { Button, ButtonText, HStack, Text, useToast, View, VStack } from '@resgrid/ui';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

/** Below this speed (m/s) the crew has stopped at the stop (§10.7: below walking speed). */
export const GEOFENCE_STOPPED_SPEED_MPS = 1.5;

/** Seconds stopped at a stop before it checks in by itself (cancellable). */
export const GEOFENCE_CHECK_IN_SECONDS = 10;

/** Seconds at the run's start before guidance goes on to the first stop by itself (cancellable with "Not there yet"). */
export const ROUTE_START_CONTINUE_SECONDS = 5;

const PENDING = 0;
const CHECKED_IN = 1;

const panelStyle = StyleSheet.create({ panel: { backgroundColor: '#ffffff', borderRadius: 12, marginBottom: 10, padding: 16 }, button: { minHeight: 52 } });

interface PanelButtonsProps {
  onNotYet: () => void;
  onEnd: () => void;
  testID: string;
}

const NotYetAndEnd: React.FC<PanelButtonsProps> = ({ onNotYet, onEnd, testID }) => {
  const { t } = useTranslation();

  return (
    <HStack className="mt-2">
      <Button variant="outline" className="mr-2 flex-1" style={panelStyle.button} onPress={onNotYet} testID={`${testID}-not-yet`}>
        <ButtonText>{t('navigation.arrival.not_yet')}</ButtonText>
      </Button>
      <Button variant="outline" action="secondary" className="flex-1" style={panelStyle.button} onPress={onEnd} testID={`${testID}-end`}>
        <ButtonText>{t('navigation.end')}</ButtonText>
      </Button>
    </HStack>
  );
};

/** The status option with the On Scene meaning in the unit's own status set (custom sets honoured), or null. */
export const findOnSceneStatus = (sets: readonly UnitTypeStatusResultData[], unit: { Type?: string | null; CustomStatusSetId?: string | number | null } | null): StatusesResultData | null =>
  getUnitStatusOptions<StatusesResultData, UnitTypeStatusResultData>(sets, unit).find((option) => option.BaseType === ActionBaseTypes.OnScene) ?? null;

export interface CallArrivalPanelProps {
  unitId: string | null;
  /** The department turned the On Scene offer off (setting 122). */
  offerOnScene?: boolean;
  onEnd: () => void;
}

/** Arrived at a call (§9.1): offer the unit's On Scene status (its own set), then end guidance. */
export const CallArrivalPanel: React.FC<CallArrivalPanelProps> = ({ unitId, offerOnScene = true, onEnd }) => {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const unit = useUnitsStore((state) => (unitId ? (selectUnitById(state, unitId) ?? state.unitInfos.find((info) => info.UnitId === unitId) ?? null) : null));
  const sets = useUnitsStore((state) => state.unitTypeStatuses);
  const onScene = useMemo(() => (offerOnScene && unitId ? findOnSceneStatus(sets, unit) : null), [offerOnScene, sets, unit, unitId]);

  return (
    <View style={panelStyle.panel} testID="navigation-arrival-call">
      <Text className="text-xl font-bold">{t('navigation.arrival.title')}</Text>
      {onScene ? (
        <Button className="mt-3" style={panelStyle.button} onPress={() => setSheetOpen(true)} testID="navigation-arrival-on-scene">
          <ButtonText>{t('navigation.arrival.set_status', { status: onScene.Text })}</ButtonText>
        </Button>
      ) : null}
      <NotYetAndEnd onNotYet={() => useNavigationStore.getState().resumeAfterArrival()} onEnd={onEnd} testID="navigation-arrival-call" />
      {onScene ? (
        <UnitStatusSheet
          isOpen={sheetOpen}
          unitId={unitId}
          initialStatusId={onScene.Id}
          onClose={() => {
            setSheetOpen(false);
          }}
        />
      ) : null}
    </View>
  );
};

export interface StopArrivalPanelProps {
  unitId: string | null;
  /** The running route's instance (the session's destination): its start is reached and its end is ended through it. */
  routeInstanceId: string;
  /** Ends the guidance and leaves the screen. */
  onEnd: () => void;
  onOpenStop: (routeInstanceStopId: string) => void;
}

/**
 * Arrived somewhere on a running route (§10.7): the leg's destination decides the panel. The leading leg of a call's route
 * (Core M0322) arrives at the run's start: reached, never checked in at. A stop is checked in and out. The live route's
 * last leg runs to the route's end point (its station by default) and carries no stop: arriving there ends the route.
 */
export const StopArrivalPanel: React.FC<StopArrivalPanelProps> = ({ unitId, routeInstanceId, onEnd, onOpenStop }) => {
  const legStop = useNavigationStore((state) => state.meta?.legStops[state.activeLegIndex] ?? null);

  if (isRouteStartLeg(legStop)) return <RouteStartArrivalPanel routeInstanceId={routeInstanceId} name={legStop?.name ?? null} onEnd={onEnd} />;

  if (legStop !== null && !legStop.routeInstanceStopId) return <RouteEndArrivalPanel routeInstanceId={routeInstanceId} name={legStop.name} onEnd={onEnd} />;

  return <RouteStopArrivalPanel unitId={unitId} onEnd={onEnd} onOpenStop={onOpenStop} />;
};

interface RouteEndpointPanelProps {
  routeInstanceId: string;
  name: string | null;
  onEnd: () => void;
}

/**
 * Arrived at the start of a call's route (Core M0322: its station or start point, before the first stop). It is reached,
 * not checked in at: going on (by hand, or by itself after a short pause) marks it reached (`ReachRouteStart`, queued
 * offline like a stop check-in) and guides to the first stop. "Not there yet" goes back to guidance without reaching it.
 */
const RouteStartArrivalPanel: React.FC<RouteEndpointPanelProps> = ({ routeInstanceId, name, onEnd }) => {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState(ROUTE_START_CONTINUE_SECONDS);
  const reachedRef = useRef(false);

  const goOn = useCallback(() => {
    if (reachedRef.current) return;
    reachedRef.current = true;
    const fix = useNavigationStore.getState().lastFix;
    // Queued through the outbox (offline-safe); a refusal rolls the optimistic `StartReachedOn` back by itself.
    useRoutesStore
      .getState()
      .reachRouteStart(routeInstanceId, fix ? { latitude: fix.latitude, longitude: fix.longitude } : null)
      .catch(() => undefined);
    useNavigationStore.getState().continueToNextLeg();
  }, [routeInstanceId]);

  useEffect(() => {
    const timer = setInterval(() => setCountdown((value) => (value > 0 ? value - 1 : value)), 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (countdown === 0) goOn();
  }, [countdown, goOn]);

  return (
    <View style={panelStyle.panel} testID="navigation-arrival-route-start">
      <Text className="text-xl font-bold">{name ? t('navigation.arrival.route_start_at', { name }) : t('navigation.arrival.route_start_title')}</Text>
      <Text className="mt-1 text-base" testID="navigation-arrival-route-start-auto">
        {t('navigation.arrival.route_start_auto', { seconds: countdown })}
      </Text>
      <Button className="mt-3" style={panelStyle.button} onPress={goOn} testID="navigation-arrival-route-start-continue">
        <ButtonText>{t('navigation.arrival.route_start_continue')}</ButtonText>
      </Button>
      <NotYetAndEnd onNotYet={() => useNavigationStore.getState().resumeAfterArrival()} onEnd={onEnd} testID="navigation-arrival-route-start" />
    </View>
  );
};

/**
 * Arrived at the route's end (the live route's last leg, no stop): "End route" ends the run (`EndRoute`, which clears the
 * unit's active route) and the guidance. A refusal says why and keeps the panel.
 */
const RouteEndArrivalPanel: React.FC<RouteEndpointPanelProps> = ({ routeInstanceId, name, onEnd }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const endRoute = async () => {
    setBusy(true);
    const ended = await useRoutesStore.getState().endRouteInstance(routeInstanceId);
    setBusy(false);

    if (!ended) {
      toast.error(t(useRoutesStore.getState().actionError?.messageKey ?? 'common.errorOccurred'));

      return;
    }

    toast.success(t('navigation.arrival.route_ended'));
    onEnd();
  };

  return (
    <View style={panelStyle.panel} testID="navigation-arrival-route-end">
      <Text className="text-xl font-bold">{name ? t('navigation.arrival.at', { name }) : t('navigation.arrival.title')}</Text>
      <Button className="mt-3" style={panelStyle.button} onPress={() => void endRoute()} isDisabled={busy} testID="navigation-arrival-end-route">
        <ButtonText>{t('navigation.arrival.end_route')}</ButtonText>
      </Button>
      <NotYetAndEnd onNotYet={() => useNavigationStore.getState().resumeAfterArrival()} onEnd={onEnd} testID="navigation-arrival-route-end" />
    </View>
  );
};

interface RouteStopArrivalPanelProps {
  unitId: string | null;
  onEnd: () => void;
  onOpenStop: (routeInstanceStopId: string) => void;
}

/**
 * Arrived at a route stop (§10.7): check in (by hand, or by itself after the crew has stood still at the stop for
 * 10 s — cancellable, through `GeofenceCheckIn`), then check out and drive on to the next stop on the same route.
 */
const RouteStopArrivalPanel: React.FC<RouteStopArrivalPanelProps> = ({ unitId, onEnd, onOpenStop }) => {
  const { t } = useTranslation();
  const legStop = useNavigationStore((state) => state.meta?.legStops[state.activeLegIndex] ?? null);
  const isLastLeg = useNavigationStore((state) => (state.route ? state.activeLegIndex >= state.route.legs.length - 1 : true));
  const fix = useNavigationStore((state) => state.lastFix);
  const routeInstanceStopId = legStop?.routeInstanceStopId ?? null;

  const status = useRoutesStore((state) => {
    if (!routeInstanceStopId) return PENDING;

    return state.instanceStops.find((stop) => stop.RouteInstanceStopId === routeInstanceStopId)?.Status ?? state.stopDetails.find((stop) => stop.RouteInstanceStopId === routeInstanceStopId)?.Status ?? PENDING;
  });

  const [autoCancelled, setAutoCancelled] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const stopped = fix !== null && (fix.speed ?? 0) < GEOFENCE_STOPPED_SPEED_MPS;
  const numericUnitId = unitId !== null && Number.isInteger(Number(unitId)) ? Number(unitId) : null;
  const canAutoCheckIn = status === PENDING && stopped && !autoCancelled && numericUnitId !== null && fix !== null;

  useEffect(() => {
    if (!canAutoCheckIn) {
      setCountdown(null);

      return undefined;
    }

    setCountdown(GEOFENCE_CHECK_IN_SECONDS);
    const timer = setInterval(() => setCountdown((value) => (value !== null && value > 0 ? value - 1 : value)), 1000);

    return () => clearInterval(timer);
  }, [canAutoCheckIn]);

  useEffect(() => {
    if (countdown !== 0 || !fix || numericUnitId === null) return;
    setCountdown(null);
    setAutoCancelled(true);
    void useRoutesStore.getState().performGeofenceCheckIn(numericUnitId, fix.latitude, fix.longitude);
  }, [countdown, fix, numericUnitId]);

  const checkIn = async () => {
    if (!routeInstanceStopId) return;
    setBusy(true);
    setAutoCancelled(true);

    try {
      await useRoutesStore.getState().checkIn(routeInstanceStopId, fix ? { latitude: fix.latitude, longitude: fix.longitude } : null);
    } finally {
      setBusy(false);
    }
  };

  const checkOutAndContinue = async () => {
    if (routeInstanceStopId) {
      setBusy(true);

      try {
        await useRoutesStore.getState().checkOut(routeInstanceStopId, fix ? { latitude: fix.latitude, longitude: fix.longitude } : null);
      } finally {
        setBusy(false);
      }
    }

    // The last stop with no leg after it (a route whose end is its last stop): the guidance is over, so the screen closes.
    if (isLastLeg) onEnd();
    else useNavigationStore.getState().continueToNextLeg();
  };

  return (
    <View style={panelStyle.panel} testID="navigation-arrival-stop">
      <VStack>
        <Text className="text-xl font-bold">{t('navigation.arrival.stop_title', { name: legStop?.name ?? t('navigation.arrival.stop_fallback') })}</Text>
        {countdown !== null ? (
          <HStack className="mt-2 items-center" testID="navigation-arrival-auto-check-in">
            <Text className="flex-1 text-base">{t('navigation.arrival.auto_check_in', { seconds: countdown })}</Text>
            <Button variant="link" onPress={() => setAutoCancelled(true)} testID="navigation-arrival-auto-cancel">
              <ButtonText>{t('navigation.arrival.cancel')}</ButtonText>
            </Button>
          </HStack>
        ) : null}
        {status === PENDING ? (
          <Button className="mt-3" style={panelStyle.button} onPress={() => void checkIn()} isDisabled={busy || !routeInstanceStopId} testID="navigation-arrival-check-in">
            <ButtonText>{t('navigation.arrival.check_in')}</ButtonText>
          </Button>
        ) : (
          <Button className="mt-3" style={panelStyle.button} onPress={() => void checkOutAndContinue()} isDisabled={busy} testID="navigation-arrival-continue">
            <ButtonText>{status === CHECKED_IN ? t('navigation.arrival.check_out_continue') : t('navigation.arrival.continue')}</ButtonText>
          </Button>
        )}
        {routeInstanceStopId ? (
          <Button variant="link" className="mt-1" onPress={() => onOpenStop(routeInstanceStopId)} testID="navigation-arrival-open-stop">
            <ButtonText>{t('navigation.arrival.open_stop')}</ButtonText>
          </Button>
        ) : null}
        <NotYetAndEnd onNotYet={() => useNavigationStore.getState().resumeAfterArrival()} onEnd={onEnd} testID="navigation-arrival-stop" />
      </VStack>
    </View>
  );
};

export interface PointArrivalPanelProps {
  name: string | null;
  onEnd: () => void;
}

export const PointArrivalPanel: React.FC<PointArrivalPanelProps> = ({ name, onEnd }) => {
  const { t } = useTranslation();

  return (
    <View style={panelStyle.panel} testID="navigation-arrival-point">
      <Text className="text-xl font-bold">{name ? t('navigation.arrival.at', { name }) : t('navigation.arrival.title')}</Text>
      <NotYetAndEnd onNotYet={() => useNavigationStore.getState().resumeAfterArrival()} onEnd={onEnd} testID="navigation-arrival-point" />
    </View>
  );
};
