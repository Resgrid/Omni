import { useRoutesStore, useUnitsStore } from '@resgrid/data';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { RouteStats } from '@resgrid/features/unit-routes/components/route-stats';
import { formatDistance, formatDuration, formatRouteTime } from '@resgrid/features/unit-routes/lib/route-format';
import { mapBounds, planMapStops, routeColor } from '@resgrid/features/unit-routes/lib/route-map';
import { sortStops } from '@resgrid/features/unit-routes/lib/route-status';
import { type RenderRouteMap, RouteMapSlot } from '@resgrid/features/unit-routes/map-slot';
import { useTranslation } from '@resgrid/i18n';
import type { RouteStopResultData } from '@resgrid/models';
import { Divider, HStack, Loading, ScrollView, Text, View, VStack, ZeroState } from '@resgrid/ui';
import { AlertTriangle, Clock, Flag, MapPin, Navigation, Route, Truck } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { endpointText, planPreviewLine, ROUTE_END_COLOR, ROUTE_START_COLOR, routeEndpointMarkers, type RouteEndpointPreview, routeEndpointsOf, routePlanStatusLook, routingProfileKey } from '../lib/route-plan-preview';

export interface RoutePlanPreviewProps {
  planId: string | null;
  /** Route map renderer; defaults to the one the app registers around the shell (`UnitRoutesMapProvider`). */
  renderMap?: RenderRouteMap | null;
  mapHeight?: number;
  /** Shown under the stops (e.g. a caller's own action). */
  footer?: React.ReactNode;
  testID?: string;
}

/**
 * A route plan before it runs, for any app (Core M0322; `GetRoutePlan/{id}` + `GetDirections/{id}`, which Core lets a member
 * who can view calls read for an Active plan): map with the route line, the numbered stops and the route's start and end,
 * then the plan's status, unit, stops, distance, time and travel mode, its start and end, and the stops in order. Read into
 * its own store slot, so a preview never replaces the unit's running route. Read only.
 */
export const RoutePlanPreview: React.FC<RoutePlanPreviewProps> = ({ planId, renderMap, mapHeight = 260, footer, testID = 'route-plan-preview' }) => {
  const { t } = useTranslation();
  const timeZone = useDepartmentTimeZone();
  const preview = useRoutesStore((state) => (planId ? state.planPreviewsById[planId] : undefined)) ?? null;
  const error = useRoutesStore((state) => state.errors.planPreview ?? null);
  const units = useUnitsStore((state) => state.units);
  const [isLoading, setIsLoading] = useState(!preview && !!planId);

  const load = useCallback(
    async (bypassCache: boolean) => {
      if (!planId) return;
      setIsLoading(true);

      try {
        await useRoutesStore.getState().fetchRoutePlanPreview(planId, { bypassCache });
      } finally {
        setIsLoading(false);
      }
    },
    [planId]
  );

  useEffect(() => {
    void load(false);

    if (useUnitsStore.getState().units.length === 0) void useUnitsStore.getState().fetchUnits();
  }, [load]);

  const plan = preview?.plan ?? null;
  const directions = preview?.directions ?? null;
  const color = routeColor(plan?.RouteColor);
  const stops = useMemo(() => sortStops(plan?.Stops ?? []), [plan?.Stops]);
  const line = useMemo(() => (plan ? planPreviewLine(plan, directions) : null), [directions, plan]);
  const endpoints = useMemo(() => routeEndpointsOf(directions, stops), [directions, stops]);
  const mapStops = useMemo(() => [...routeEndpointMarkers(endpoints, { start: t('route_plans.map_start_label'), end: t('route_plans.map_end_label') }), ...planMapStops(stops, color)], [color, endpoints, stops, t]);

  if (!plan) {
    return isLoading || (!error && !!planId) ? (
      <Loading text={t('routes.loading')} />
    ) : (
      <ZeroState
        icon={Route}
        isError={!!error}
        heading={t('route_plans.not_found')}
        description={error ? t(error.messageKey) : t('route_plans.not_found_description')}
        onRetry={planId ? () => load(true) : undefined}
        testID={`${testID}-missing`}
      />
    );
  }

  const unitName = plan.UnitId ? (units.find((unit) => String(unit.UnitId) === String(plan.UnitId))?.Name ?? '') : '';
  const status = routePlanStatusLook(plan.RouteStatus);
  const profileKey = routingProfileKey(plan.RoutingProfile);
  const withStops = plan.EstimatedDurationWithDwellSeconds && plan.EstimatedDurationWithDwellSeconds !== plan.EstimatedDurationSeconds ? formatDuration(plan.EstimatedDurationWithDwellSeconds, t) : '';

  const renderEndpoint = ({ kind, endpoint, isStop }: RouteEndpointPreview) => (
    <HStack key={kind} space="sm" className="items-center" testID={`${testID}-${kind}`}>
      <View style={StyleSheet.flatten([styles.endpointDot, { backgroundColor: kind === 'start' ? ROUTE_START_COLOR : ROUTE_END_COLOR }])} />
      <Text className="w-14 text-sm font-semibold text-typography-700">{kind === 'start' ? t('routes.start') : t('routes.end')}</Text>
      <Text className="flex-1 text-sm text-typography-700">{isStop ? `${endpointText(endpoint)} · ${t(kind === 'start' ? 'route_plans.first_stop' : 'route_plans.last_stop')}` : endpointText(endpoint)}</Text>
    </HStack>
  );

  const renderStop = (stop: RouteStopResultData, index: number) => {
    const arrival = formatRouteTime(stop.PlannedArrivalTime, timeZone);

    return (
      <View key={stop.RouteStopId} testID={`${testID}-stop-${stop.RouteStopId}`}>
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
            {stop.EstimatedDwellMinutes && stop.EstimatedDwellMinutes > 0 ? (
              <HStack space="xs" className="items-center">
                <View>
                  <Clock size={12} color="#9ca3af" />
                </View>
                <Text className="text-xs text-typography-500">{`${t('routes.dwell_time')}: ${t('unit_routes.duration_minutes', { minutes: stop.EstimatedDwellMinutes })}`}</Text>
              </HStack>
            ) : null}
            {stop.Notes ? <Text className="text-xs italic text-typography-500">{stop.Notes}</Text> : null}
          </VStack>
        </HStack>
        {index < stops.length - 1 ? <Divider className="ml-12" /> : null}
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content} testID={testID}>
      <RouteMapSlot
        kind="preview"
        renderMap={renderMap}
        height={mapHeight}
        stops={mapStops}
        line={line}
        geofence={null}
        color={color}
        bounds={mapBounds(mapStops, line)}
        showUserLocation={false}
        testID={`${testID}-map`}
      />
      <VStack space="md" className="px-4 pt-4">
        <VStack space="sm" className="rounded-xl bg-background-0 p-4" style={StyleSheet.flatten([styles.header, { borderLeftColor: color }])}>
          <HStack space="sm" className="items-center">
            <View>
              <Navigation size={20} color="#3b82f6" />
            </View>
            <Text className="flex-1 text-xl font-bold text-typography-900">{plan.Name}</Text>
            <View style={StyleSheet.flatten([styles.badge, { backgroundColor: `${status.color}26` }])} testID={`${testID}-status`}>
              <Text className="text-xs font-semibold" style={{ color: status.color }}>
                {t(status.labelKey)}
              </Text>
            </View>
          </HStack>
          {plan.Description ? <Text className="text-sm text-typography-600">{plan.Description}</Text> : null}
          <HStack space="xs" className="items-center">
            <View>
              <Truck size={14} color={unitName ? '#3b82f6' : '#9ca3af'} />
            </View>
            <Text className={`text-sm font-medium ${unitName ? 'text-primary-600' : 'text-typography-400'}`}>{unitName || t('routes.unassigned')}</Text>
          </HStack>
          <RouteStats
            testID={`${testID}-stats`}
            stats={[
              { id: 'stops', label: t('routes.stops'), value: String(stops.length) },
              { id: 'distance', label: t('routes.distance'), value: formatDistance(plan.EstimatedDistanceMeters) },
              { id: 'duration', label: t('routes.duration'), value: formatDuration(plan.EstimatedDurationSeconds, t) },
              { id: 'with-stops', label: t('route_plans.duration_with_stops'), value: withStops },
              { id: 'profile', label: t('route_plans.profile_label'), value: profileKey ? t(profileKey) : '' },
            ]}
          />
          {endpoints.length > 0 ? <VStack space="xs">{endpoints.map(renderEndpoint)}</VStack> : null}
          {plan.RouteIsStale ? (
            <HStack space="sm" className="items-center rounded-lg bg-warning-50 p-3" testID={`${testID}-stale`}>
              <View>
                <AlertTriangle size={16} color="#d97706" />
              </View>
              <Text className="flex-1 text-sm text-warning-700">{t('route_plans.stale_route')}</Text>
            </HStack>
          ) : null}
        </VStack>
        <VStack className="rounded-xl bg-background-0 p-4">
          <HStack space="sm" className="mb-2 items-center">
            <View>
              <Flag size={16} color="#6b7280" />
            </View>
            <Text className="text-lg font-bold text-typography-900">{`${t('routes.stops')} (${stops.length})`}</Text>
          </HStack>
          <Divider className="mb-2" />
          {stops.length > 0 ? stops.map(renderStop) : <Text className="py-4 text-center text-typography-500">{t('routes.no_stops')}</Text>}
        </VStack>
        {footer ?? null}
      </VStack>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  header: { borderLeftWidth: 4 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  order: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  endpointDot: { width: 10, height: 10, borderRadius: 5 },
});
