import { useCallsStore } from '@resgrid/data';
import { useNavigationHandoff } from '@resgrid/features/contacts';
import { useStatusContext } from '@resgrid/features/status';
import { unitRoutesRoutes } from '@resgrid/features/unit-routes/routes';
import { useTranslation } from '@resgrid/i18n';
import { TrafficLayer, useMapTraffic } from '@resgrid/maps';
import { type NavigationDestination, type NavigationErrorCode, NavigationSessionView, SIMULATION_SPEEDS_MPS, unitsForLocale, useNavigationStore } from '@resgrid/navigation';
import { Button, ButtonText, Loading, ScreenHeader, Text, useToast, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { Navigation } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { CallArrivalPanel, PointArrivalPanel, StopArrivalPanel } from '../components/arrival-panels';
import { useInAppNavigationAvailable } from '../hooks/use-in-app-navigation';
import { type NavigationRequest, readNavigationParams, takePointNavigationRequest } from '../routes';

export interface NavigationScreenProps {
  /**
   * Replay the route at this speed (m/s) instead of following the device — QA and documentation screenshots. Development
   * builds also take `?simulate=1`.
   */
  simulationSpeedMps?: number | null;
}

const isDevelopmentBuild = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__;

const ERROR_KEYS: Record<NavigationErrorCode, string> = {
  'no-position': 'navigation.error.no_position',
  'no-route': 'navigation.error.no_route',
  unavailable: 'navigation.error.unavailable',
  failed: 'navigation.error.failed',
};

const sameDestination = (a: NavigationDestination | null, b: NavigationDestination): boolean => {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind === 'call' && b.kind === 'call') return a.callId === b.callId;
  if (a.kind === 'route' && b.kind === 'route') return a.routeInstanceId === b.routeInstanceId;
  if (a.kind === 'point' && b.kind === 'point') return a.latitude === b.latitude && a.longitude === b.longitude;
  return false;
};

const toDestination = (request: NavigationRequest, callName: string | null): NavigationDestination | null => {
  if (!request) return null;
  if (request.kind === 'call') return { kind: 'call', callId: request.callId, name: callName };
  if (request.kind === 'route') return { kind: 'route', routeInstanceId: request.routeInstanceId, name: null };
  return { kind: 'point', latitude: request.point.latitude, longitude: request.point.longitude, name: request.point.name };
};

const deviceUnits = () => {
  try {
    return unitsForLocale(Intl.NumberFormat().resolvedOptions().locale);
  } catch {
    return 'metric' as const;
  }
};

/**
 * In-app turn-by-turn (`/navigate`, MapLibre plan §9, Unit by capability): starts a session for the call, the running
 * route's remaining stops or a handed-over point; guides with the map, banner, prompts and live ETA; and on arrival
 * offers the unit's On Scene status (call), stop check-in and the next stop (route) or just ends. When the server cannot
 * route for navigation it says so and offers the crew's navigation app instead.
 */
export default function NavigationScreen({ simulationSpeedMps: simulationProp = null }: NavigationScreenProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const handoff = useNavigationHandoff();
  const available = useInAppNavigationAvailable();
  const traffic = useMapTraffic();
  const { activeUnitId } = useStatusContext();
  const params = useLocalSearchParams<{ callId?: string | string[]; instanceId?: string | string[]; simulate?: string | string[] }>();
  const simulateParam = Array.isArray(params.simulate) ? params.simulate[0] : params.simulate;
  const simulationSpeedMps = simulationProp ?? (isDevelopmentBuild() && simulateParam === '1' ? SIMULATION_SPEEDS_MPS[1] : null);
  const [request] = useState<NavigationRequest>(() => {
    const fromUrl = readNavigationParams(params);
    if (fromUrl) return fromUrl;
    const point = takePointNavigationRequest();
    return point ? { kind: 'point', point } : null;
  });
  const call = useCallsStore((state) => (request?.kind === 'call' ? state.calls.find((item) => Number(item.CallId) === request.callId) : undefined));
  const destination = useMemo(() => toDestination(request, call?.Name ?? null), [request, call?.Name]);
  const status = useNavigationStore((state) => state.status);
  const error = useNavigationStore((state) => state.error);
  const sessionDestination = useNavigationStore((state) => state.destination);
  const unitId = activeUnitId !== null && Number.isInteger(Number(activeUnitId)) && Number(activeUnitId) > 0 ? Number(activeUnitId) : null;
  const units = useMemo(deviceUnits, []);
  const started = useRef(false);

  const start = useCallback(() => {
    if (!destination) return;
    void useNavigationStore.getState().start(destination, { unitId, simulation: simulationSpeedMps !== null });
  }, [destination, simulationSpeedMps, unitId]);

  useEffect(() => {
    if (started.current || !available || !destination) return;
    started.current = true;
    const current = useNavigationStore.getState();
    // Coming back to a session already under way (e.g. from the stop screen) keeps it.
    if ((current.status === 'navigating' || current.status === 'arrived') && sameDestination(current.destination, destination)) return;
    if (current.status !== 'idle') current.stop();
    start();
  }, [available, destination, start]);

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);

  const end = useCallback(() => {
    useNavigationStore.getState().stop();
    leave();
  }, [leave]);

  const external = useMemo(() => {
    if (request?.kind === 'point') return { latitude: request.point.latitude, longitude: request.point.longitude, label: request.point.name ?? undefined };
    const leg = useNavigationStore.getState().route?.legs.at(-1);
    return leg ? { latitude: leg.destination[1], longitude: leg.destination[0], label: destination?.name ?? undefined } : null;
    // The route's end changes only with a new route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, destination?.name, status]);

  const openExternal = useCallback(async () => {
    if (!external) return;
    const open = handoff.openExternal ?? handoff.navigateTo;
    if (!(await open(external))) toast.error(t('map.failed_to_open_maps'));
  }, [external, handoff, t, toast]);

  if (!available || !destination) {
    return (
      <View style={styles.root} testID="navigation-screen">
        <ScreenHeader title={t('navigation.title')} onBack={leave} />
        <ZeroState icon={Navigation} heading={t(destination ? 'navigation.error.unavailable' : 'navigation.error.no_destination')} />
      </View>
    );
  }

  const active = sessionDestination !== null && sameDestination(sessionDestination, destination);
  if (!active || status === 'loading' || status === 'idle') {
    return (
      <View style={styles.root} testID="navigation-screen">
        <ScreenHeader title={t('navigation.title')} onBack={leave} />
        <Loading text={t('navigation.loading')} />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.root} testID="navigation-screen">
        <ScreenHeader title={t('navigation.title')} onBack={leave} />
        <VStack className="p-4" testID="navigation-error">
          <Text className="mb-4 text-lg">{t(ERROR_KEYS[error ?? 'failed'])}</Text>
          <Button className="mb-2" style={styles.button} onPress={start} testID="navigation-retry">
            <ButtonText>{t('navigation.retry')}</ButtonText>
          </Button>
          {external ? (
            <Button variant="outline" className="mb-2" style={styles.button} onPress={() => void openExternal()} testID="navigation-error-external">
              <ButtonText>{t('navigation.open_external')}</ButtonText>
            </Button>
          ) : null}
          <Button variant="link" onPress={leave} testID="navigation-back">
            <ButtonText>{t('navigation.back')}</ButtonText>
          </Button>
        </VStack>
      </View>
    );
  }

  const arrivalPanel =
    destination.kind === 'call' ? (
      <CallArrivalPanel unitId={activeUnitId} onEnd={end} />
    ) : destination.kind === 'route' ? (
      <StopArrivalPanel unitId={activeUnitId} onEnd={end} onOpenStop={(id) => router.push(unitRoutesRoutes.stop(id))} />
    ) : (
      <PointArrivalPanel name={destination.name} onEnd={end} />
    );

  return (
    <View style={styles.root} testID="navigation-screen">
      <NavigationSessionView
        units={units}
        simulationSpeedMps={simulationSpeedMps}
        arrivalPanel={arrivalPanel}
        underlay={traffic.available ? <TrafficLayer visible={true} /> : null}
        onOpenExternal={external ? () => void openExternal() : undefined}
        onEnded={leave}
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 }, button: { minHeight: 52 } });
