import { useRoutesStore, useUnitsStore } from '@resgrid/data';
import { useStatusContext } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import type { RoutePlanResultData } from '@resgrid/models';
import { FlatList, HStack, Input, InputField, InputIcon, InputSlot, Loading, Pressable, RefreshControl, Text, View, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { Navigation, Route, Search, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { progressPercent } from '../lib/route-status';
import { unitRoutesRoutes } from '../routes';
import { RouteCard } from './route-card';

/** Core `RouteStatus.Active`: only active plans are offered (drafts, paused and archived plans are not). */
export const ACTIVE_ROUTE_PLAN_STATUS = 1;

/**
 * Route plans (Unit routes tab): the unit's running route on top, then the department's active plans with the unit's own
 * marked, searchable by name, description and unit. Reads the persisted routes store, so it works offline.
 */
export const RoutePlansList: React.FC<{ testID?: string }> = ({ testID = 'route-plans-list' }) => {
  const { t } = useTranslation();
  const { activeUnitId } = useStatusContext();
  const routePlans = useRoutesStore((state) => state.routePlans);
  const activeInstance = useRoutesStore((state) => state.activeInstance);
  const instanceStops = useRoutesStore((state) => state.instanceStops);
  const isLoading = useRoutesStore((state) => state.loading.plans === true);
  const error = useRoutesStore((state) => state.errors.plans ?? null);
  const units = useUnitsStore((state) => state.units);
  const [query, setQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    void useRoutesStore.getState().fetchAllRoutePlans();
    if (activeUnitId) void useRoutesStore.getState().fetchActiveRoute(activeUnitId);
    if (useUnitsStore.getState().units.length === 0) void useUnitsStore.getState().fetchUnits();
  }, [activeUnitId]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([useRoutesStore.getState().fetchAllRoutePlans({ bypassCache: true }), activeUnitId ? useRoutesStore.getState().fetchActiveRoute(activeUnitId, { bypassCache: true }) : Promise.resolve()]);
    setIsRefreshing(false);
  }, [activeUnitId]);

  const unitNames = useMemo(() => new Map(units.map((unit) => [String(unit.UnitId), unit.Name])), [units]);
  const unitNameOf = useCallback((plan: RoutePlanResultData) => (plan.UnitId === null || plan.UnitId === undefined ? '' : (unitNames.get(String(plan.UnitId)) ?? '')), [unitNames]);

  const visible = useMemo(() => {
    const active = routePlans.filter((plan) => plan.RouteStatus === ACTIVE_ROUTE_PLAN_STATUS);
    const needle = query.trim().toLowerCase();
    if (!needle) return active;
    return active.filter((plan) => [plan.Name, plan.Description ?? '', unitNameOf(plan)].some((value) => value.toLowerCase().includes(needle)));
  }, [query, routePlans, unitNameOf]);

  const openPlan = useCallback(
    (plan: RoutePlanResultData) => {
      if (activeInstance && activeInstance.RoutePlanId === plan.RoutePlanId) router.push(unitRoutesRoutes.active(plan.RoutePlanId, activeInstance.RouteInstanceId));
      else router.push(unitRoutesRoutes.start(plan.RoutePlanId));
    },
    [activeInstance]
  );

  const renderItem = useCallback(
    ({ item }: { item: RoutePlanResultData }) => {
      const isMyUnit = !!activeUnitId && item.UnitId !== null && String(item.UnitId) === String(activeUnitId);
      return <RouteCard route={item} isActive={activeInstance?.RoutePlanId === item.RoutePlanId} isMyUnit={isMyUnit} unitName={unitNameOf(item)} onPress={openPlan} />;
    },
    [activeInstance?.RoutePlanId, activeUnitId, openPlan, unitNameOf]
  );

  const banner = activeInstance ? (
    <Pressable
      onPress={() => router.push(unitRoutesRoutes.active(activeInstance.RoutePlanId, activeInstance.RouteInstanceId))}
      accessibilityRole="button"
      testID={`${testID}-active-banner`}
      className="mb-3 rounded-xl border-2 border-success-500 bg-success-50 p-4"
    >
      <HStack space="sm" className="items-center">
        <View>
          <Navigation size={20} color="#16a34a" />
        </View>
        <Text className="flex-1 text-base font-bold text-success-800">{activeInstance.RoutePlanName || t('routes.active_route')}</Text>
      </HStack>
      <Text className="mt-1 text-sm text-success-700">{t('routes.progress', { percent: progressPercent(instanceStops, activeInstance) })}</Text>
    </Pressable>
  ) : null;

  if (isLoading && !isRefreshing && routePlans.length === 0) return <Loading text={t('routes.loading')} />;

  if (error && routePlans.length === 0 && !activeInstance) {
    return <ZeroState icon={Route} isError heading={t('common.errorOccurred')} description={t(error.messageKey)} testID={`${testID}-error`} />;
  }

  return (
    <View className="flex-1" testID={testID}>
      <Input className="mb-3 bg-background-0" size="md" variant="outline">
        <InputSlot className="pl-3">
          <InputIcon as={Search} />
        </InputSlot>
        <InputField placeholder={t('routes.search')} value={query} onChangeText={setQuery} accessibilityLabel={t('routes.search')} testID={`${testID}-search`} />
        {query ? (
          <InputSlot className="pr-3" onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('common.clear_search')}>
            <InputIcon as={X} />
          </InputSlot>
        ) : null}
      </Input>
      <FlatList<RoutePlanResultData>
        data={visible}
        keyExtractor={(item) => item.RoutePlanId}
        renderItem={renderItem}
        ListHeaderComponent={banner}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />}
        ListEmptyComponent={
          <ZeroState
            icon={query ? Search : Route}
            heading={query ? t('routes.no_search_results') : t('routes.no_routes')}
            description={query ? t('routes.try_different_search') : t('routes.no_routes_description_all')}
            testID={`${testID}-empty`}
          />
        }
        contentContainerStyle={{ paddingBottom: 20 }}
        testID={`${testID}-list`}
      />
    </View>
  );
};
