import { useRoutesStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { RouteStopWithDetailsResultData } from '@resgrid/models';
import { HStack, Loading, ScreenHeader, ScrollView, Text, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { History } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { RouteStats } from '../components/route-stats';
import { formatDistance, formatDuration, formatRouteTime } from '../lib/route-format';
import { instanceMapStops, mapBounds, routeColor } from '../lib/route-map';
import { instanceStatusLook, sortStops, stopStatusLook } from '../lib/route-status';
import { type RenderRouteMap, RouteMapSlot } from '../map-slot';
import { readRouteParam, unitRoutesRoutes } from '../routes';

export interface RouteInstanceScreenProps {
  instanceId?: string;
  renderMap?: RenderRouteMap;
}

const dwellText = (seconds: number | null, t: (key: string, options?: Record<string, unknown>) => string): string => (seconds && seconds > 0 ? `${t('routes.dwell_time')}: ${formatDuration(seconds, t)}` : '');

/**
 * A past run of a route (`/routes/history/instance/[id]`): status, start/end, distance, time, and every stop's check-in,
 * check-out, dwell, skip reason and notes, with a map. Read into its own slot so the live route is never replaced
 * (Unit kept this in local screen state for the same reason).
 */
export default function RouteInstanceScreen({ instanceId: instanceIdProp, renderMap }: RouteInstanceScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const instanceId = instanceIdProp ?? readRouteParam(params.id);
  const detail = useRoutesStore((state) => (instanceId ? state.instanceDetailsById[instanceId] : undefined)) ?? null;
  const error = useRoutesStore((state) => state.errors.instanceDetail ?? null);
  const plans = useRoutesStore((state) => state.routePlans);
  const [isLoading, setIsLoading] = useState(!detail && !!instanceId);

  useEffect(() => {
    if (!instanceId) return undefined;
    let active = true;
    void useRoutesStore
      .getState()
      .fetchInstanceDetail(instanceId)
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [instanceId]);

  const stops = useMemo(() => sortStops(detail?.stops ?? []), [detail?.stops]);
  const mapStops = useMemo(() => instanceMapStops(stops, null), [stops]);
  const instance = detail?.progress?.Instance ?? null;
  const back = () => (router.canGoBack() ? router.back() : router.replace(unitRoutesRoutes.list()));

  if (!instance) {
    return (
      <View className="flex-1 bg-background-50" testID="route-instance-screen">
        <ScreenHeader title={t('routes.instance_detail')} onBack={back} />
        {isLoading ? <Loading /> : <ZeroState icon={History} isError={!!error} heading={t('routes.no_history')} description={error ? t(error.messageKey) : undefined} testID="route-instance-missing" />}
      </View>
    );
  }

  const look = instanceStatusLook(instance.Status);
  const color = routeColor(plans.find((plan) => plan.RoutePlanId === instance.RoutePlanId)?.RouteColor);

  const renderStop = (stop: RouteStopWithDetailsResultData) => {
    const id = stop.RouteInstanceStopId ?? stop.RouteStopId;
    const stopLook = stopStatusLook(stop.Status);
    const lines = [
      stop.CheckInOn ? t('unit_routes.checked_in_at', { time: formatRouteTime(stop.CheckInOn) }) : '',
      stop.CheckOutOn ? t('unit_routes.checked_out_at', { time: formatRouteTime(stop.CheckOutOn) }) : '',
      dwellText(stop.DwellSeconds, t),
      stop.SkipReason ? `${t('routes.skip_reason')}: ${stop.SkipReason}` : '',
      stop.InstanceNotes ? `${t('routes.notes')}: ${stop.InstanceNotes}` : '',
    ].filter((line) => line !== '');
    return (
      <HStack key={id} space="md" className="items-start border-b border-outline-100 py-3" testID={`route-instance-stop-${id}`}>
        <View style={StyleSheet.flatten([styles.order, { backgroundColor: stopLook.color }])}>
          <Text className="text-xs font-bold text-typography-0">{String(stop.StopOrder)}</Text>
        </View>
        <VStack className="flex-1" space="xs">
          <HStack space="sm" className="flex-wrap items-center">
            <Text className="font-semibold text-typography-900">{stop.Name}</Text>
            <Text className="text-xs font-semibold" style={{ color: stopLook.color }}>
              {t(stopLook.labelKey)}
            </Text>
          </HStack>
          {stop.Address ? <Text className="text-xs text-typography-500">{stop.Address}</Text> : null}
          {lines.map((line) => (
            <Text key={line} className="text-xs text-typography-600">
              {line}
            </Text>
          ))}
        </VStack>
      </HStack>
    );
  };

  return (
    <View className="flex-1 bg-background-50" testID="route-instance-screen">
      <ScreenHeader title={instance.RoutePlanName || t('routes.instance_detail')} onBack={back} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <RouteMapSlot kind="instance" renderMap={renderMap} height={240} stops={mapStops} line={null} geofence={null} color={color} bounds={mapBounds(mapStops, null)} showUserLocation={false} />
        <VStack space="md" className="px-4 pt-4">
          <VStack space="sm" className="rounded-xl bg-background-0 p-4">
            <HStack space="sm" className="items-center">
              <Text className="flex-1 text-lg font-bold text-typography-900">{t('routes.summary_stats')}</Text>
              <View style={StyleSheet.flatten([styles.badge, { backgroundColor: `${look.color}26` }])} testID="route-instance-status">
                <Text className="text-xs font-semibold" style={{ color: look.color }}>
                  {t(look.labelKey)}
                </Text>
              </View>
            </HStack>
            {instance.ActualStartOn ? <Text className="text-sm text-typography-700">{`${t('routes.start')}: ${formatRouteTime(instance.ActualStartOn)}`}</Text> : null}
            {instance.ActualEndOn ? <Text className="text-sm text-typography-700">{`${t('routes.end')}: ${formatRouteTime(instance.ActualEndOn)}`}</Text> : null}
            <RouteStats
              stats={[
                { id: 'stops', label: t('routes.stops_completed'), value: `${detail?.progress?.CompletedStops ?? instance.StopsCompleted}/${detail?.progress?.TotalStops ?? instance.StopsTotal}` },
                { id: 'skipped', label: t('routes.skipped'), value: detail?.progress?.SkippedStops ? String(detail.progress.SkippedStops) : '' },
                { id: 'distance', label: t('routes.total_distance'), value: formatDistance(instance.TotalDistanceMeters) },
                { id: 'duration', label: t('routes.total_duration'), value: formatDuration(instance.TotalDurationSeconds, t) },
              ]}
            />
            {instance.Notes ? <Text className="text-sm text-typography-700">{instance.Notes}</Text> : null}
          </VStack>
          <VStack className="rounded-xl bg-background-0 p-4">
            <Text className="mb-1 text-lg font-bold text-typography-900">{t('routes.stops')}</Text>
            {stops.length > 0 ? stops.map(renderStop) : <Text className="py-2 text-typography-500">{t('routes.no_stops')}</Text>}
          </VStack>
        </VStack>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  order: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
});
