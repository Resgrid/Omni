import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { PoisListScreen } from '@resgrid/features/pois';
import { type PoiResultData } from '@resgrid/models';
import { SharedTabs, type TabItem, useRouteTab, View } from '@resgrid/ui';
import { router } from 'expo-router';
import React, { useCallback, useMemo } from 'react';

import { RoutePlansList } from '../components/route-plans-list';
import { unitRoutesRoutes } from '../routes';

export interface RoutesHomeScreenProps {
  /** POI map slot (MapLibre via `@resgrid/maps`, supplied by the app). */
  renderPoiMap?: (pois: readonly PoiResultData[]) => React.ReactNode;
}

/** Unit's Routes tab (`/routes`): route plans and the department's points of interest, as the page's tabs. */
export default function RoutesHomeScreen({ renderPoiMap }: RoutesHomeScreenProps) {
  const openPoi = useCallback((poi: PoiResultData) => pushRoutePath(router, unitRoutesRoutes.poi(poi.PoiId)), []);
  const tabs = useMemo<TabItem[]>(
    () => [
      {
        key: 'routes',
        title: 'routes.routes_tab',
        content: (
          <View className="flex-1 px-4 pt-4">
            <RoutePlansList />
          </View>
        ),
      },
      { key: 'pois', title: 'routes.pois_tab', content: <PoisListScreen onSelectPoi={openPoi} renderMap={renderPoiMap} /> },
    ],
    [openPoi, renderPoiMap]
  );

  // In the route's params, so Points of interest is still selected after opening a POI and coming Back.
  const routeTab = useRouteTab(tabs);

  return (
    <View className="flex-1 bg-background-50" testID="routes-home-screen">
      {/* The POI list pads itself; the plans tab pads in its own wrapper. */}
      <SharedTabs tabs={tabs} activeIndex={routeTab.activeIndex} onChange={routeTab.selectIndex} variant="pills" className="flex-1" />
    </View>
  );
}
