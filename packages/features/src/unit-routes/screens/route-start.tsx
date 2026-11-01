import { useRoutesStore, useUnitsStore } from '@resgrid/data';
import { useStatusContext } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import type { RouteStopResultData } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, Divider, HStack, Loading, Pressable, ScreenHeader, ScrollView, Text, useFormFactor, useToast, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { Clock, History, Info, MapPin, Navigation, Play, Route, Truck, User } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { RouteStats } from '../components/route-stats';
import { formatDistance, formatDuration, formatRouteTime } from '../lib/route-format';
import { parseRouteGeometry } from '../lib/route-geo';
import { mapBounds, planMapStops, routeColor } from '../lib/route-map';
import { canStartPlan, sortStops } from '../lib/route-status';
import { type RenderRouteMap, RouteMapSlot } from '../map-slot';
import { readRouteParam, unitRoutesRoutes } from '../routes';

export interface RouteStartScreenProps {
  planId?: string;
  renderMap?: RenderRouteMap;
}

/**
 * A route plan before it runs (`/routes/start?planId=`): map, assigned unit, planned distance and time, stops with their
 * planned times, contacts and notes, and Start for a unit that may run it (unassigned, or assigned to this unit). Starting
 * needs the server (it creates the instance).
 */
export default function RouteStartScreen({ planId: planIdProp, renderMap }: RouteStartScreenProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { isElectron, isDesktop } = useFormFactor();
  const params = useLocalSearchParams<{ planId?: string | string[] }>();
  const planId = planIdProp ?? readRouteParam(params.planId);
  const { activeUnitId } = useStatusContext();
  const plan = useRoutesStore((state) => (planId && state.activePlan?.RoutePlanId === planId ? state.activePlan : null));
  const isLoading = useRoutesStore((state) => state.loading.plan === true);
  const loadError = useRoutesStore((state) => state.errors.plan ?? null);
  const activeInstance = useRoutesStore((state) => state.activeInstance);
  const units = useUnitsStore((state) => state.units);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (planId) void useRoutesStore.getState().fetchRoutePlan(planId);
  }, [planId]);

  const color = routeColor(plan?.RouteColor);
  const stops = useMemo(() => sortStops(plan?.Stops ?? []), [plan?.Stops]);
  const line = useMemo(() => parseRouteGeometry(plan?.MapboxRouteGeometry), [plan?.MapboxRouteGeometry]);
  const mapStops = useMemo(() => planMapStops(stops, color), [color, stops]);
  const unitName = plan?.UnitId ? (units.find((unit) => String(unit.UnitId) === String(plan.UnitId))?.Name ?? '') : '';
  const assignedElsewhere = !!plan?.UnitId && !!activeUnitId && String(plan.UnitId) !== String(activeUnitId);
  const otherRouteRunning = !!activeInstance && !!plan && activeInstance.RoutePlanId !== plan.RoutePlanId;
  const canStart = !!plan && canStartPlan(plan.UnitId, activeUnitId) && !otherRouteRunning;
  const back = () => (router.canGoBack() ? router.back() : router.replace(unitRoutesRoutes.list()));

  const start = async () => {
    if (!plan || !activeUnitId || isStarting) return;
    setIsStarting(true);
    const ok = await useRoutesStore.getState().startRouteInstance(plan.RoutePlanId, Number(activeUnitId));
    setIsStarting(false);
    if (ok) {
      router.replace(unitRoutesRoutes.active(plan.RoutePlanId, useRoutesStore.getState().activeInstance?.RouteInstanceId ?? null));
      return;
    }
    const error = useRoutesStore.getState().actionError;
    toast.error(t(error?.messageKey ?? 'common.errorOccurred'));
  };

  if (!plan) {
    return (
      <View className="flex-1 bg-background-50" testID="route-start-screen">
        <ScreenHeader title={t('routes.view_route')} onBack={back} />
        {isLoading || (!loadError && !!planId) ? (
          <Loading text={t('routes.loading')} />
        ) : (
          <ZeroState icon={Route} isError={!!loadError} heading={t('routes.no_routes')} description={loadError ? t(loadError.messageKey) : t('routes.no_routes_description')} testID="route-start-missing" />
        )}
      </View>
    );
  }

  const renderStop = (stop: RouteStopResultData, index: number) => {
    const arrival = formatRouteTime(stop.PlannedArrivalTime);
    const departure = formatRouteTime(stop.PlannedDepartureTime);
    return (
      <View key={stop.RouteStopId} testID={`route-start-stop-${stop.RouteStopId}`}>
        <HStack space="md" className="items-start py-3">
          <View style={StyleSheet.flatten([styles.order, { backgroundColor: color }])}>
            <Text className="text-xs font-bold text-typography-0">{String(stop.StopOrder)}</Text>
          </View>
          <VStack className="flex-1" space="xs">
            <Text className="text-base font-semibold text-typography-900">{stop.Name}</Text>
            {stop.Address ? (
              <HStack space="xs" className="items-center">
                <View>
                  <MapPin size={12} color="#9ca3af" />
                </View>
                <Text className="flex-1 text-sm text-typography-600">{stop.Address}</Text>
              </HStack>
            ) : null}
            {arrival ? <Text className="text-xs text-typography-600">{`${t('routes.planned_arrival')}: ${arrival}`}</Text> : null}
            {departure ? <Text className="text-xs text-typography-600">{`${t('routes.planned_departure')}: ${departure}`}</Text> : null}
            {stop.EstimatedDwellMinutes && stop.EstimatedDwellMinutes > 0 ? (
              <HStack space="xs" className="items-center">
                <View>
                  <Clock size={12} color="#9ca3af" />
                </View>
                <Text className="text-xs text-typography-500">{`${t('routes.dwell_time')}: ${t('unit_routes.duration_minutes', { minutes: stop.EstimatedDwellMinutes })}`}</Text>
              </HStack>
            ) : null}
            {stop.Notes ? <Text className="text-xs italic text-typography-500">{stop.Notes}</Text> : null}
            {stop.ContactId ? (
              <Pressable onPress={() => router.push(unitRoutesRoutes.stopContact(stop.RouteStopId))} accessibilityRole="button" testID={`route-start-contact-${stop.RouteStopId}`}>
                <HStack space="xs" className="items-center py-1">
                  <View>
                    <User size={12} color="#2563eb" />
                  </View>
                  <Text className="text-xs font-medium text-primary-600">{stop.ContactName || t('routes.view_contact')}</Text>
                </HStack>
              </Pressable>
            ) : null}
          </VStack>
        </HStack>
        {index < stops.length - 1 ? <Divider className="ml-12" /> : null}
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background-50" testID="route-start-screen">
      <ScreenHeader
        title={t('routes.view_route')}
        onBack={back}
        right={
          <Pressable onPress={() => router.push(unitRoutesRoutes.history(plan.RoutePlanId))} accessibilityRole="button" accessibilityLabel={t('routes.history')} testID="route-start-history" className="p-2">
            <History size={20} color="#2563eb" />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <RouteMapSlot kind="plan" renderMap={renderMap} height={240} stops={mapStops} line={line} geofence={null} color={color} bounds={mapBounds(mapStops, line)} showUserLocation={false} />
        <VStack space="md" className="px-4 pt-4">
          <VStack space="sm" className="rounded-xl bg-background-0 p-4" style={StyleSheet.flatten([styles.header, { borderLeftColor: color }])}>
            <HStack space="sm" className="items-center">
              <View>
                <Navigation size={20} color="#3b82f6" />
              </View>
              <Text className="flex-1 text-xl font-bold text-typography-900">{plan.Name}</Text>
            </HStack>
            {plan.Description ? <Text className="text-sm text-typography-600">{plan.Description}</Text> : null}
            <HStack space="xs" className="items-center">
              <View>
                <Truck size={14} color={unitName ? '#3b82f6' : '#9ca3af'} />
              </View>
              <Text className={`text-sm font-medium ${unitName ? 'text-primary-600' : 'text-typography-400'}`}>{unitName || t('routes.unassigned')}</Text>
            </HStack>
            <RouteStats
              stats={[
                { id: 'stops', label: t('routes.stops'), value: String(stops.length) },
                { id: 'distance', label: t('routes.distance'), value: formatDistance(plan.EstimatedDistanceMeters) },
                { id: 'duration', label: t('routes.duration'), value: formatDuration(plan.EstimatedDurationSeconds, t) },
              ]}
            />
          </VStack>
          {assignedElsewhere ? (
            <HStack space="sm" className="items-center rounded-xl bg-warning-50 p-4" testID="route-start-assigned-elsewhere">
              <View>
                <Info size={16} color="#d97706" />
              </View>
              <Text className="flex-1 text-sm text-warning-700">{t('routes.assigned_other_unit')}</Text>
            </HStack>
          ) : null}
          {otherRouteRunning ? (
            <HStack space="sm" className="items-center rounded-xl bg-warning-50 p-4" testID="route-start-other-active">
              <View>
                <Info size={16} color="#d97706" />
              </View>
              <Text className="flex-1 text-sm text-warning-700">{t('unit_routes.other_route_active', { name: activeInstance?.RoutePlanName ?? '' })}</Text>
            </HStack>
          ) : null}
          {!activeUnitId ? <Text className="text-sm text-typography-500">{t('routes.unit_required')}</Text> : null}
          <VStack className="rounded-xl bg-background-0 p-4">
            <Text className="mb-2 text-lg font-bold text-typography-900">{`${t('routes.stops')} (${stops.length})`}</Text>
            <Divider className="mb-2" />
            {stops.length > 0 ? stops.map(renderStop) : <Text className="py-4 text-center text-typography-500">{t('routes.no_stops')}</Text>}
          </VStack>
        </VStack>
      </ScrollView>
      {canStart ? (
        <View className="border-t border-outline-200 bg-background-0 px-4 py-4">
          <Button size="xl" action="positive" onPress={() => void start()} isDisabled={isStarting} testID="route-start-button" style={{ minHeight: isElectron || isDesktop ? 64 : 52 }}>
            {isStarting ? (
              <ButtonSpinner />
            ) : (
              <>
                <View style={styles.buttonIcon}>
                  <Play size={18} color="#ffffff" />
                </View>
                <ButtonText>{t('routes.start_route')}</ButtonText>
              </>
            )}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { borderLeftWidth: 4 },
  order: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  buttonIcon: { marginRight: 8 },
});
