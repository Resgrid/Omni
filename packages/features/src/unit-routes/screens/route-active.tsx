import { getDataLocationFix, RouteInstanceStatus, useRoutesStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { RouteStopWithDetailsResultData } from '@resgrid/models';
import { Button, ButtonText, HStack, Loading, Pressable, ScreenHeader, ScrollView, Text, useFormFactor, useToast, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { LogOut, Navigation, Pause, Play, Route } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet } from 'react-native';

import { ConfirmDialog } from '../components/confirm-dialog';
import { DeviationBanner } from '../components/deviation-banner';
import { SkipStopDialog } from '../components/skip-stop-dialog';
import { StopCard } from '../components/stop-card';
import { useStopActions } from '../hooks/use-stop-actions';
import { parseRouteGeometry } from '../lib/route-geo';
import { instanceMapStops, mapBounds, routeColor, stopGeofence } from '../lib/route-map';
import { currentStop, instanceDeviations, progressPercent, sortStops, type StopActionKind } from '../lib/route-status';
import { type RenderRouteMap, RouteMapSlot } from '../map-slot';
import { readRouteParam, unitRoutesRoutes } from '../routes';

/** Progress, stops and deviations are re-read this often while the screen is in the foreground (Unit: 30 s). */
export const ACTIVE_ROUTE_POLL_MS = 30_000;

export interface RouteActiveScreenProps {
  instanceId?: string;
  renderMap?: RenderRouteMap;
  pollMs?: number;
}

type ConfirmKind = 'end' | 'cancel' | null;

/**
 * The running route (`/routes/active`): map with the route line and the current stop's geofence, progress, deviations,
 * the current stop with check in / check out / skip (queued offline through the outbox), the stop list, pause/resume,
 * directions and end/cancel. Reads the persisted active instance first, so it opens offline.
 */
export default function RouteActiveScreen({ instanceId: instanceIdProp, renderMap, pollMs = ACTIVE_ROUTE_POLL_MS }: RouteActiveScreenProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { isElectron, isDesktop } = useFormFactor();
  const actionHeight = isElectron || isDesktop ? 64 : 48;
  const params = useLocalSearchParams<{ instanceId?: string | string[]; planId?: string | string[] }>();
  const activeInstance = useRoutesStore((state) => state.activeInstance);
  const instanceId = instanceIdProp ?? readRouteParam(params.instanceId) ?? activeInstance?.RouteInstanceId ?? null;
  const instance = activeInstance && activeInstance.RouteInstanceId === instanceId ? activeInstance : null;
  const stopDetails = useRoutesStore((state) => state.stopDetails);
  const instanceStops = useRoutesStore((state) => state.instanceStops);
  const directions = useRoutesStore((state) => state.directions);
  const deviations = useRoutesStore((state) => state.deviations);
  const plans = useRoutesStore((state) => state.routePlans);
  const activePlan = useRoutesStore((state) => state.activePlan);
  const isLoading = useRoutesStore((state) => state.loading.progress === true || state.loading.active === true);
  const { checkIn, checkOut, skip, busyStopId } = useStopActions();
  const [skipTarget, setSkipTarget] = useState<RouteStopWithDetailsResultData | null>(null);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(
    (bypassCache: boolean) => {
      if (!instanceId) return;
      const store = useRoutesStore.getState();
      void store.fetchRouteProgress(instanceId, { bypassCache });
      void store.fetchStopsForInstance(instanceId);
      void store.fetchDeviations();
    },
    [instanceId]
  );

  useEffect(() => {
    if (!instanceId) return;
    refresh(false);
    void useRoutesStore.getState().fetchDirections(instanceId);
  }, [instanceId, refresh]);

  useEffect(() => {
    if (!instanceId || pollMs <= 0) return undefined;
    const handle = setInterval(() => {
      // Android keeps JS timers alive in the background: never poll for a screen nobody is looking at.
      if (AppState.currentState === 'active') refresh(true);
    }, pollMs);
    return () => clearInterval(handle);
  }, [instanceId, pollMs, refresh]);

  const stops = useMemo(() => sortStops(stopDetails.filter((stop) => !instanceId || !stop.RouteInstanceId || stop.RouteInstanceId === instanceId)), [instanceId, stopDetails]);
  const current = useMemo(() => currentStop(stops), [stops]);
  const currentId = current ? (current.RouteInstanceStopId ?? current.RouteStopId) : null;
  const plan = plans.find((candidate) => candidate.RoutePlanId === instance?.RoutePlanId) ?? null;
  const planDetail = activePlan && activePlan.RoutePlanId === instance?.RoutePlanId ? activePlan : null;
  const color = routeColor(plan?.RouteColor ?? planDetail?.RouteColor);
  const line = useMemo(() => parseRouteGeometry(directions?.RouteInstanceId === instanceId ? directions?.Geometry : planDetail?.MapboxRouteGeometry), [directions, instanceId, planDetail?.MapboxRouteGeometry]);
  const mapStops = useMemo(() => instanceMapStops(stops, currentId), [currentId, stops]);
  const geofence = useMemo(() => stopGeofence(current, planDetail?.GeofenceRadiusMeters), [current, planDetail?.GeofenceRadiusMeters]);
  const ownDeviations = useMemo(() => instanceDeviations(deviations, instanceId), [deviations, instanceId]);
  const percent = progressPercent(stops.length > 0 ? stops : instanceStops, instance);
  const isPaused = instance?.Status === RouteInstanceStatus.Paused;

  const onAction = useCallback(
    (kind: StopActionKind, stop: RouteStopWithDetailsResultData) => {
      const id = stop.RouteInstanceStopId;
      if (!id) return;
      if (kind === 'checkIn') void checkIn(id);
      else if (kind === 'checkOut') void checkOut(id);
      else setSkipTarget(stop);
    },
    [checkIn, checkOut]
  );

  const runOnline = async (work: () => Promise<boolean>, after?: () => void) => {
    setIsBusy(true);
    const ok = await work();
    setIsBusy(false);
    if (ok) after?.();
    else toast.error(t(useRoutesStore.getState().actionError?.messageKey ?? 'common.errorOccurred'));
    return ok;
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace(unitRoutesRoutes.list()));

  if (!instance) {
    return (
      <View className="flex-1 bg-background-50" testID="route-active-screen">
        <ScreenHeader title={t('routes.active_route')} onBack={back} />
        {isLoading ? (
          <Loading text={t('routes.loading')} />
        ) : (
          <ZeroState icon={Route} heading={t('unit_routes.no_active_route')} description={t('unit_routes.no_active_route_description')} testID="route-active-none">
            <Button onPress={() => router.replace(unitRoutesRoutes.list())} testID="route-active-to-list">
              <ButtonText>{t('routes.all_routes')}</ButtonText>
            </Button>
          </ZeroState>
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background-50" testID="route-active-screen">
      <ScreenHeader
        title={instance.RoutePlanName || t('routes.active_route')}
        onBack={back}
        right={
          <Pressable
            onPress={() => router.push(unitRoutesRoutes.directions(instance.RouteInstanceId))}
            accessibilityRole="button"
            accessibilityLabel={t('routes.directions')}
            testID="route-active-directions-icon"
            className="p-2"
          >
            <Navigation size={20} color="#2563eb" />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <RouteMapSlot
          kind="active"
          renderMap={renderMap}
          height={280}
          stops={mapStops}
          line={line}
          geofence={geofence}
          color={color}
          bounds={mapBounds(mapStops, line, getDataLocationFix())}
          showUserLocation
          onStopPress={(stopId) => router.push(unitRoutesRoutes.stop(stopId))}
        />
        <HStack space="sm" className="items-center px-4 pt-3">
          <View className="flex-1 overflow-hidden rounded-full bg-background-200" style={styles.track}>
            <View className="h-full rounded-full bg-success-500" style={{ width: `${percent}%` }} testID="route-active-progress-bar" />
          </View>
          <Text className="text-sm font-semibold text-typography-700" testID="route-active-progress">
            {t('routes.progress', { percent })}
          </Text>
        </HStack>
        {isPaused ? (
          <HStack space="sm" className="mx-4 mt-3 items-center rounded-lg bg-warning-50 p-3" testID="route-active-paused">
            <Text className="flex-1 text-sm font-semibold text-warning-800">{t('routes.paused')}</Text>
          </HStack>
        ) : null}
        <View className="mt-3">
          <DeviationBanner deviations={ownDeviations} onAcknowledge={(id) => void runOnline(() => useRoutesStore.getState().ackDeviation(id))} />
        </View>
        <VStack className="px-4 pt-1">
          <Text className="mb-1 text-xs font-semibold uppercase text-typography-500">{t('routes.current_step')}</Text>
          {current ? (
            <StopCard
              stop={current}
              isCurrent={!isPaused}
              onAction={onAction}
              onPress={(stop) => (stop.RouteInstanceStopId ? router.push(unitRoutesRoutes.stop(stop.RouteInstanceStopId)) : undefined)}
              isBusy={busyStopId === currentId}
              actionMinHeight={actionHeight}
              testID="route-active-current"
            />
          ) : (
            <Text className="py-3 text-center text-sm text-typography-500" testID="route-active-all-done">
              {t('routes.stops_completed')}
            </Text>
          )}
        </VStack>
        <HStack space="sm" className="px-4 pb-3">
          <Button variant="outline" className="flex-1" onPress={() => router.push(unitRoutesRoutes.directions(instance.RouteInstanceId))} testID="route-active-directions" style={{ minHeight: actionHeight }}>
            <View style={styles.buttonIcon}>
              <Navigation size={16} color="#2563eb" />
            </View>
            <ButtonText>{t('routes.directions')}</ButtonText>
          </Button>
          {isPaused ? (
            <Button
              variant="outline"
              className="flex-1"
              isDisabled={isBusy}
              onPress={() => void runOnline(() => useRoutesStore.getState().resumeRouteInstance(instance.RouteInstanceId))}
              testID="route-active-resume"
              style={{ minHeight: actionHeight }}
            >
              <View style={styles.buttonIcon}>
                <Play size={16} color="#2563eb" />
              </View>
              <ButtonText>{t('routes.resume_route')}</ButtonText>
            </Button>
          ) : (
            <Button
              variant="outline"
              className="flex-1"
              isDisabled={isBusy}
              onPress={() => void runOnline(() => useRoutesStore.getState().pauseRouteInstance(instance.RouteInstanceId))}
              testID="route-active-pause"
              style={{ minHeight: actionHeight }}
            >
              <View style={styles.buttonIcon}>
                <Pause size={16} color="#2563eb" />
              </View>
              <ButtonText>{t('routes.pause_route')}</ButtonText>
            </Button>
          )}
        </HStack>
        <VStack className="px-4">
          <Text className="mb-2 text-xs font-semibold uppercase text-typography-500">{t('routes.stops')}</Text>
          {stops.map((stop) => {
            const id = stop.RouteInstanceStopId ?? stop.RouteStopId;
            return <StopCard key={id} stop={stop} onPress={(row) => (row.RouteInstanceStopId ? router.push(unitRoutesRoutes.stop(row.RouteInstanceStopId)) : undefined)} testID={`route-active-stop-${id}`} />;
          })}
        </VStack>
        <VStack space="sm" className="mx-4 mt-4">
          <Button action="negative" onPress={() => setConfirm('end')} isDisabled={isBusy} testID="route-active-end" style={{ minHeight: actionHeight }}>
            <View style={styles.buttonIcon}>
              <LogOut size={16} color="#ffffff" />
            </View>
            <ButtonText>{t('routes.end_route')}</ButtonText>
          </Button>
          <Button variant="link" action="negative" onPress={() => setConfirm('cancel')} isDisabled={isBusy} testID="route-active-cancel">
            <ButtonText>{t('routes.cancel_route')}</ButtonText>
          </Button>
        </VStack>
      </ScrollView>
      <SkipStopDialog
        isOpen={skipTarget !== null}
        stopName={skipTarget?.Name ?? ''}
        onCancel={() => setSkipTarget(null)}
        onConfirm={(reason) => {
          const id = skipTarget?.RouteInstanceStopId;
          setSkipTarget(null);
          if (id) void skip(id, reason);
        }}
      />
      <ConfirmDialog
        isOpen={confirm !== null}
        title={confirm === 'cancel' ? t('routes.cancel_route') : t('routes.end_route')}
        message={confirm === 'cancel' ? t('routes.cancel_route_confirm') : t('routes.end_route_confirm')}
        confirmLabel={confirm === 'cancel' ? t('routes.cancel_route') : t('routes.end_route')}
        cancelLabel={t('common.cancel')}
        destructive
        isBusy={isBusy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const kind = confirm;
          const id = instance.RouteInstanceId;
          void runOnline(
            () => (kind === 'cancel' ? useRoutesStore.getState().cancelRouteInstance(id) : useRoutesStore.getState().endRouteInstance(id)),
            () => router.replace(unitRoutesRoutes.list())
          ).finally(() => setConfirm(null));
        }}
        testID="route-active-confirm"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8 },
  buttonIcon: { marginRight: 6 },
});
