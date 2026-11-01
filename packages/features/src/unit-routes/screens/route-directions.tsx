import { useRoutesStore } from '@resgrid/data';
import { useNavigationHandoff } from '@resgrid/features/contacts';
import { useTranslation } from '@resgrid/i18n';
import type { RouteDirectionWaypointData } from '@resgrid/models';
import { Button, ButtonText, HStack, Loading, Pressable, ScreenHeader, ScrollView, Text, useToast, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { ExternalLink, Map as MapIcon, Navigation } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { RouteStats } from '../components/route-stats';
import { formatArrivalTime, formatDistance, formatDuration } from '../lib/route-format';
import { isMappable, parseRouteGeometry } from '../lib/route-geo';
import { mapBounds, routeColor, waypointMapStops } from '../lib/route-map';
import { isStopDone, sortStops, stopStatusLook } from '../lib/route-status';
import { type RenderRouteMap, RouteMapSlot } from '../map-slot';
import { readRouteParam, unitRoutesRoutes } from '../routes';

export interface RouteDirectionsScreenProps {
  instanceId?: string;
  renderMap?: RenderRouteMap;
}

/**
 * Directions for the running route (`/routes/directions?instanceId=`): the server's route from the unit's position through
 * the remaining stops (`GetInstanceDirections` — Unit called the Mapbox Directions API from the device with its token),
 * distance, drive time and arrival, every waypoint, and hand-off of the next stop to the crew's navigation app.
 * In-app turn-by-turn is a later phase (`@resgrid/navigation`).
 */
export default function RouteDirectionsScreen({ instanceId: instanceIdProp, renderMap }: RouteDirectionsScreenProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const handoff = useNavigationHandoff();
  const params = useLocalSearchParams<{ instanceId?: string | string[] }>();
  const activeInstance = useRoutesStore((state) => state.activeInstance);
  const instanceId = instanceIdProp ?? readRouteParam(params.instanceId) ?? activeInstance?.RouteInstanceId ?? null;
  const directions = useRoutesStore((state) => (state.directions && (!instanceId || state.directions.RouteInstanceId === instanceId || !state.directions.RouteInstanceId) ? state.directions : null));
  const isLoading = useRoutesStore((state) => state.loading.directions === true);
  const error = useRoutesStore((state) => state.errors.directions ?? null);
  const plans = useRoutesStore((state) => state.routePlans);

  useEffect(() => {
    if (instanceId) void useRoutesStore.getState().fetchDirections(instanceId);
  }, [instanceId]);

  const waypoints = useMemo(() => sortStops(directions?.Waypoints ?? []), [directions?.Waypoints]);
  const next = useMemo(() => waypoints.find((waypoint) => !isStopDone(waypoint.Status)) ?? null, [waypoints]);
  const nextId = next ? (next.RouteInstanceStopId ?? next.RouteStopId) : null;
  const line = useMemo(() => parseRouteGeometry(directions?.Geometry), [directions?.Geometry]);
  const mapStops = useMemo(() => waypointMapStops(waypoints, nextId), [nextId, waypoints]);
  const origin = directions && isMappable(directions.OriginLatitude, directions.OriginLongitude) ? { latitude: directions.OriginLatitude as number, longitude: directions.OriginLongitude as number } : null;
  const color = routeColor(plans.find((plan) => plan.RoutePlanId === (directions?.RoutePlanId ?? activeInstance?.RoutePlanId))?.RouteColor);

  const navigateTo = useCallback(
    async (waypoint: RouteDirectionWaypointData) => {
      const label = waypoint.Name || t('routes.destination');
      const target = isMappable(waypoint.Latitude, waypoint.Longitude) ? { latitude: waypoint.Latitude, longitude: waypoint.Longitude, label } : waypoint.Address ? { address: waypoint.Address, label } : null;
      if (!target) return;
      const opened = await handoff.navigateTo(target);
      if (!opened) toast.error(t('map.failed_to_open_maps'));
    },
    [handoff, t, toast]
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace(unitRoutesRoutes.active(null, instanceId)));

  if (!directions) {
    return (
      <View className="flex-1 bg-background-50" testID="route-directions-screen">
        <ScreenHeader title={t('routes.directions')} onBack={back} />
        {isLoading ? (
          <Loading text={t('routes.loading_directions')} />
        ) : (
          <ZeroState icon={MapIcon} isError={!!error} heading={t('routes.no_directions')} description={error ? t(error.messageKey) : undefined} testID="route-directions-none" />
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background-50" testID="route-directions-screen">
      <ScreenHeader title={t('routes.directions')} onBack={back} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <RouteMapSlot kind="directions" renderMap={renderMap} height={300} stops={mapStops} line={line} geofence={null} color={color} bounds={mapBounds(mapStops, line, origin)} showUserLocation />
        <VStack space="md" className="px-4 pt-4">
          <VStack className="rounded-xl bg-background-0 p-4">
            <Text className="mb-2 text-lg font-bold text-typography-900">{t('routes.route_summary')}</Text>
            <RouteStats
              stats={[
                { id: 'distance', label: t('routes.estimated_distance'), value: formatDistance(directions.EstimatedDistanceMeters) },
                { id: 'duration', label: t('routes.estimated_duration'), value: formatDuration(directions.EstimatedDurationSeconds, t) },
                { id: 'eta', label: t('routes.eta'), value: formatArrivalTime(directions.EstimatedDurationSeconds) },
              ]}
            />
          </VStack>
          {next ? (
            <Button onPress={() => void navigateTo(next)} testID="route-directions-open-next" style={{ minHeight: 52 }}>
              <View style={styles.buttonIcon}>
                <ExternalLink size={16} color="#ffffff" />
              </View>
              <ButtonText>{t('unit_routes.navigate_to_next', { name: next.Name ?? '' })}</ButtonText>
            </Button>
          ) : null}
          <VStack className="rounded-xl bg-background-0 p-4">
            <Text className="mb-2 text-lg font-bold text-typography-900">{t('routes.remaining_steps')}</Text>
            {waypoints.length === 0 ? <Text className="py-2 text-typography-500">{t('routes.no_stops')}</Text> : null}
            {waypoints.map((waypoint, index) => {
              const id = waypoint.RouteInstanceStopId ?? waypoint.RouteStopId ?? `waypoint-${index}`;
              const look = stopStatusLook(waypoint.Status);
              return (
                <HStack key={id} space="md" className="items-center border-b border-outline-100 py-3" testID={`route-directions-waypoint-${id}`}>
                  <View style={StyleSheet.flatten([styles.order, { backgroundColor: look.color }])}>
                    <Text className="text-xs font-bold text-typography-0">{String(waypoint.StopOrder)}</Text>
                  </View>
                  <VStack className="flex-1">
                    <Text className={`font-semibold ${isStopDone(waypoint.Status) ? 'text-typography-400' : 'text-typography-900'}`}>{waypoint.Name || t('routes.destination')}</Text>
                    {waypoint.Address ? <Text className="text-xs text-typography-500">{waypoint.Address}</Text> : null}
                    <Text className="text-xs" style={{ color: look.color }}>
                      {t(look.labelKey)}
                    </Text>
                  </VStack>
                  {isStopDone(waypoint.Status) ? null : (
                    <Pressable onPress={() => void navigateTo(waypoint)} accessibilityRole="button" accessibilityLabel={t('routes.open_in_maps')} testID={`route-directions-navigate-${id}`} className="p-3">
                      <Navigation size={18} color="#2563eb" />
                    </Pressable>
                  )}
                </HStack>
              );
            })}
          </VStack>
        </VStack>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  order: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonIcon: { marginRight: 6 },
});
