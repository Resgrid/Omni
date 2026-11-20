import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { useRoutesStore, useUnitsStore } from '@resgrid/data';
import { routePlanStatusLook } from '@resgrid/features/route-plans/lib/route-plan-preview';
import { routePlansRoutes } from '@resgrid/features/route-plans/routes';
import { RouteCard } from '@resgrid/features/unit-routes/components/route-card';
import { useTranslation } from '@resgrid/i18n';
import type { RoutePlanResultData } from '@resgrid/models';
import { FlatList, Input, InputField, InputIcon, InputSlot, Loading, RefreshControl, View, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { Route, Search, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { sortPlansForOverview } from '../lib/routes-overview';

/**
 * The department's route plans (`GetRoutePlans`) with their status (Active first), searchable by name, description and
 * unit; a plan opens its preview. Read only.
 */
export const DepartmentRoutePlans: React.FC<{ testID?: string }> = ({ testID = 'department-route-plans' }) => {
  const { t } = useTranslation();
  const routePlans = useRoutesStore((state) => state.routePlans);
  const isLoading = useRoutesStore((state) => state.loading.plans === true);
  const error = useRoutesStore((state) => state.errors.plans ?? null);
  const units = useUnitsStore((state) => state.units);
  const [query, setQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    void useRoutesStore.getState().fetchAllRoutePlans();

    if (useUnitsStore.getState().units.length === 0) void useUnitsStore.getState().fetchUnits();
  }, []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await useRoutesStore.getState().fetchAllRoutePlans({ bypassCache: true });
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const unitNames = useMemo(() => new Map(units.map((unit) => [String(unit.UnitId), unit.Name])), [units]);
  const unitNameOf = useCallback((plan: RoutePlanResultData) => (plan.UnitId === null || plan.UnitId === undefined ? '' : (unitNames.get(String(plan.UnitId)) ?? '')), [unitNames]);
  const visible = useMemo(() => sortPlansForOverview(routePlans, query, unitNameOf), [query, routePlans, unitNameOf]);
  const openPreview = useCallback((plan: RoutePlanResultData) => pushRoutePath(router, routePlansRoutes.preview(plan.RoutePlanId)), []);

  const renderItem = useCallback(
    ({ item }: { item: RoutePlanResultData }) => {
      const status = routePlanStatusLook(item.RouteStatus);

      return <RouteCard route={item} unitName={unitNameOf(item)} statusBadge={{ label: t(status.labelKey), color: status.color }} onPress={openPreview} />;
    },
    [openPreview, t, unitNameOf]
  );

  if (isLoading && !isRefreshing && routePlans.length === 0) return <Loading text={t('routes.loading')} />;

  if (error && routePlans.length === 0) {
    return <ZeroState icon={Route} isError heading={t('common.errorOccurred')} description={t(error.messageKey)} onRetry={refresh} testID={`${testID}-error`} />;
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
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />}
        ListEmptyComponent={
          isLoading ? (
            <Loading text={t('routes.loading')} />
          ) : (
            <ZeroState
              icon={query ? Search : Route}
              heading={query ? t('routes.no_search_results') : t('routes.no_routes')}
              description={query ? t('routes.try_different_search') : t('routes.no_routes_description_all')}
              onRetry={refresh}
              testID={`${testID}-empty`}
            />
          )
        }
        contentContainerStyle={{ paddingBottom: 20 }}
        testID={`${testID}-list`}
      />
    </View>
  );
};
