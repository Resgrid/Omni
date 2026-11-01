import { useRoutesStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { RouteInstanceResultData } from '@resgrid/models';
import { FlatList, HStack, Loading, Pressable, RefreshControl, ScreenHeader, Text, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { History } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { formatDistance, formatDuration, formatRouteTime } from '../lib/route-format';
import { instanceStatusLook } from '../lib/route-status';
import { readRouteParam, unitRoutesRoutes } from '../routes';

export interface RouteHistoryScreenProps {
  planId?: string;
}

/** Past runs of a route plan (`/routes/history/[planId]`): status, when, stops done, distance and time; online read. */
export default function RouteHistoryScreen({ planId: planIdProp }: RouteHistoryScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ planId?: string | string[] }>();
  const planId = planIdProp ?? readRouteParam(params.planId);
  const history = useRoutesStore((state) => state.routeHistory);
  const isLoading = useRoutesStore((state) => state.loading.history === true);
  const error = useRoutesStore((state) => state.errors.history ?? null);
  const planName = useRoutesStore((state) => state.routePlans.find((plan) => plan.RoutePlanId === planId)?.Name ?? (state.activePlan?.RoutePlanId === planId ? state.activePlan?.Name : undefined));
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (planId) void useRoutesStore.getState().fetchRouteHistory(planId);
  }, [planId]);

  const refresh = useCallback(async () => {
    if (!planId) return;
    setIsRefreshing(true);
    await useRoutesStore.getState().fetchRouteHistory(planId);
    setIsRefreshing(false);
  }, [planId]);

  const rows = history.filter((instance) => instance.RoutePlanId === planId);
  const back = () => (router.canGoBack() ? router.back() : router.replace(unitRoutesRoutes.list()));

  const renderItem = ({ item }: { item: RouteInstanceResultData }) => {
    const look = instanceStatusLook(item.Status);
    const facts = [t('unit_routes.stops_done', { done: item.StopsCompleted, total: item.StopsTotal }), formatDistance(item.TotalDistanceMeters), formatDuration(item.TotalDurationSeconds, t)].filter(
      (fact) => fact !== ''
    );
    return (
      <Pressable onPress={() => router.push(unitRoutesRoutes.instance(item.RouteInstanceId))} accessibilityRole="button" testID={`route-history-${item.RouteInstanceId}`} className="mb-2 rounded-xl bg-background-0 p-4">
        <HStack space="sm" className="items-center">
          <VStack className="flex-1" space="xs">
            <Text className="font-semibold text-typography-900">{formatRouteTime(item.ActualStartOn ?? item.AddedOn) || t('common.unknown')}</Text>
            <Text className="text-xs text-typography-500">{facts.join(' · ')}</Text>
          </VStack>
          <View style={StyleSheet.flatten([styles.badge, { backgroundColor: `${look.color}26` }])}>
            <Text className="text-xs font-semibold" style={{ color: look.color }}>
              {t(look.labelKey)}
            </Text>
          </View>
        </HStack>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-background-50" testID="route-history-screen">
      <ScreenHeader title={planName ? `${t('routes.history')} · ${planName}` : t('routes.history')} onBack={back} />
      {isLoading && !isRefreshing && rows.length === 0 ? (
        <Loading />
      ) : (
        <FlatList<RouteInstanceResultData>
          data={rows}
          keyExtractor={(item) => item.RouteInstanceId}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <ZeroState
              icon={History}
              isError={!!error}
              heading={error ? t('common.errorOccurred') : t('routes.no_history')}
              description={error ? t(error.messageKey) : t('routes.no_history_description')}
              testID="route-history-empty"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
});
