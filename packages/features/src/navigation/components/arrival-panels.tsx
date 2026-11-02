import { selectUnitById, useRoutesStore, useUnitsStore } from '@resgrid/data';
import { ActionBaseTypes, getUnitStatusOptions, UnitStatusSheet } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import type { StatusesResultData, UnitTypeStatusResultData } from '@resgrid/models';
import { useNavigationStore } from '@resgrid/navigation';
import { Button, ButtonText, HStack, Text, View, VStack } from '@resgrid/ui';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

/** Below this speed (m/s) the crew has stopped at the stop (§10.7: below walking speed). */
export const GEOFENCE_STOPPED_SPEED_MPS = 1.5;
/** Seconds stopped at a stop before it checks in by itself (cancellable). */
export const GEOFENCE_CHECK_IN_SECONDS = 10;

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
  onEnd: () => void;
  onOpenStop: (routeInstanceStopId: string) => void;
}

/**
 * Arrived at a route stop (§10.7): check in (by hand, or by itself after the crew has stood still at the stop for
 * 10 s — cancellable, through `GeofenceCheckIn`), then check out and drive on to the next stop on the same route.
 */
export const StopArrivalPanel: React.FC<StopArrivalPanelProps> = ({ unitId, onEnd, onOpenStop }) => {
  const { t } = useTranslation();
  const legStop = useNavigationStore((state) => state.meta?.legStops[state.activeLegIndex] ?? null);
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
    useNavigationStore.getState().continueToNextLeg();
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
