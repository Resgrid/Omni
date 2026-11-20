import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { useCallsStore, useRoutesStore, useUnitsStore } from '@resgrid/data';
import { callDisplayName } from '@resgrid/features/calls/lib/call-display';
import { callRoutes } from '@resgrid/features/calls/routes';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { formatRouteTime } from '@resgrid/features/unit-routes/lib/route-format';
import { instanceStatusLook } from '@resgrid/features/unit-routes/lib/route-status';
import { useTranslation } from '@resgrid/i18n';
import type { ActiveRouteInstanceResultData, CallResultData } from '@resgrid/models';
import { FlatList, HStack, Loading, Pressable, RefreshControl, Text, View, VStack, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { Navigation, Siren, Truck } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { runningRouteProgress, sortRunningRoutes } from '../lib/routes-overview';
import { routesOverviewRoutes } from '../routes';

/** How often the list refreshes while it is open (the desk watches routes move on). */
export const RUNNING_ROUTES_POLL_MS = 60_000;

/**
 * The department's running routes (`GetActiveRouteInstances`): plan, unit, status, progress, the next stop and when it
 * started, and (Core M0322) the call a run was started for, which opens the call; a route opens its run read only.
 * Refreshes every minute while open and on pull. No start or check-in here.
 */
export const RunningRoutes: React.FC<{ testID?: string }> = ({ testID = 'running-routes' }) => {
  const { t } = useTranslation();
  const timeZone = useDepartmentTimeZone();
  const instances = useRoutesStore((state) => state.activeRouteInstances);
  const isLoading = useRoutesStore((state) => state.loading.activeInstances === true);
  const error = useRoutesStore((state) => state.errors.activeInstances ?? null);
  const units = useUnitsStore((state) => state.units);
  const calls = useCallsStore((state) => state.calls);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasCallRuns = instances.some((instance) => (instance.CallId ?? 0) > 0);

  useEffect(() => {
    void useRoutesStore.getState().fetchActiveRouteInstances();

    if (useUnitsStore.getState().units.length === 0) void useUnitsStore.getState().fetchUnits();
    const timer = setInterval(() => void useRoutesStore.getState().fetchActiveRouteInstances({ bypassCache: true }), RUNNING_ROUTES_POLL_MS);

    return () => clearInterval(timer);
  }, []);

  // A run started for a call names the call: read the active calls when this screen opens first.
  useEffect(() => {
    if (hasCallRuns && useCallsStore.getState().calls.length === 0) void useCallsStore.getState().fetchCalls();
  }, [hasCallRuns]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await useRoutesStore.getState().fetchActiveRouteInstances({ bypassCache: true });
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const rows = useMemo(() => sortRunningRoutes(instances), [instances]);
  const unitNames = useMemo(() => new Map(units.map((unit) => [String(unit.UnitId), unit.Name])), [units]);
  const callsById = useMemo(() => new Map<string, CallResultData>(calls.map((call) => [String(call.CallId), call])), [calls]);

  const renderItem = useCallback(
    ({ item }: { item: ActiveRouteInstanceResultData }) => {
      const look = instanceStatusLook(item.Status);
      const progress = runningRouteProgress(item);
      const started = formatRouteTime(item.ActualStartOn, timeZone);
      const unitName = unitNames.get(String(item.UnitId)) ?? '';
      const callId = (item.CallId ?? 0) > 0 ? String(item.CallId) : null;
      const call = callId ? (callsById.get(callId) ?? null) : null;
      const callLabel = call ? t('routes_overview.for_call', { number: call.Number || call.CallId, name: callDisplayName(call, t('data_protection.protected_value')) }) : t('routes_overview.for_a_call');

      // The call link sits beside the row's button, never inside it (a web button cannot hold another control).
      return (
        <View className="mb-2 rounded-xl bg-background-0 p-4">
          <Pressable onPress={() => pushRoutePath(router, routesOverviewRoutes.instance(item.RouteInstanceId))} accessibilityRole="button" testID={`${testID}-${item.RouteInstanceId}`}>
            <VStack space="xs">
              <HStack space="sm" className="items-center">
                <View>
                  <Navigation size={16} color="#6b7280" />
                </View>
                <Text className="flex-1 text-base font-bold text-typography-900" numberOfLines={1}>
                  {item.RoutePlanName || t('routes.active_route')}
                </Text>
                <View style={StyleSheet.flatten([styles.badge, { backgroundColor: `${look.color}26` }])} testID={`${testID}-${item.RouteInstanceId}-status`}>
                  <Text className="text-xs font-semibold" style={{ color: look.color }}>
                    {t(look.labelKey)}
                  </Text>
                </View>
              </HStack>
              <HStack space="xs" className="items-center">
                <View>
                  <Truck size={12} color="#3b82f6" />
                </View>
                <Text className="text-sm font-medium text-primary-600">{unitName || t('routes.unit')}</Text>
              </HStack>
              {item.CurrentStopName ? <Text className="text-sm text-typography-700">{t('routes_overview.next_stop', { name: item.CurrentStopName })}</Text> : null}
              <View style={styles.track}>
                <View style={StyleSheet.flatten([styles.fill, { width: `${progress}%`, backgroundColor: look.color }])} testID={`${testID}-${item.RouteInstanceId}-progress`} />
              </View>
              <Text className="text-xs text-typography-500">
                {[t('unit_routes.stops_done', { done: item.StopsCompleted, total: item.StopsTotal }), started ? t('routes_overview.started_at', { time: started }) : ''].filter((part) => part !== '').join(' · ')}
              </Text>
            </VStack>
          </Pressable>
          {callId ? (
            <Pressable
              onPress={() => pushRoutePath(router, callRoutes.callDetail(callId))}
              accessibilityRole="link"
              accessibilityLabel={callLabel}
              testID={`${testID}-${item.RouteInstanceId}-call`}
              className="mt-2 flex-row items-center self-start"
            >
              <View className="mr-1">
                <Siren size={12} color="#dc2626" />
              </View>
              <Text className="text-sm font-medium text-primary-600 underline" numberOfLines={1}>
                {callLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      );
    },
    [callsById, t, testID, timeZone, unitNames]
  );

  if (isLoading && !isRefreshing && instances.length === 0) return <Loading text={t('routes.loading')} />;

  if (error && instances.length === 0) {
    return <ZeroState icon={Navigation} isError heading={t('common.errorOccurred')} description={t(error.messageKey)} onRetry={refresh} testID={`${testID}-error`} />;
  }

  return (
    <FlatList<ActiveRouteInstanceResultData>
      data={rows}
      keyExtractor={(item) => item.RouteInstanceId}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />}
      ListEmptyComponent={
        isLoading ? (
          <Loading text={t('routes.loading')} />
        ) : (
          <ZeroState icon={Navigation} heading={t('routes_overview.no_running')} description={t('routes_overview.no_running_description')} onRetry={refresh} testID={`${testID}-empty`} />
        )
      }
      contentContainerStyle={{ paddingBottom: 20 }}
      testID={testID}
    />
  );
};

const styles = StyleSheet.create({
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  track: { height: 6, borderRadius: 3, backgroundColor: '#e5e7eb', overflow: 'hidden', marginTop: 4 },
  fill: { height: 6, borderRadius: 3 },
});
