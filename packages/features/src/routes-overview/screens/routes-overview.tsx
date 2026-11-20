import { SharedTabs, type TabItem, useRouteTab, View } from '@resgrid/ui';
import React, { useMemo } from 'react';

import { DepartmentRoutePlans } from '../components/department-route-plans';
import { RunningRoutes } from '../components/running-routes';

/**
 * The department's routes (`/route-plans`, Dispatch's routes area, `capabilities.routes.preview`): the plans with their status
 * (a plan opens its preview) and the routes units are running with their progress (a run opens read only), as the page's
 * tabs. Nothing here starts, ends or checks in: that is the crew's, in Unit.
 */
export default function RoutesOverviewScreen() {
  const tabs = useMemo<TabItem[]>(
    () => [
      {
        key: 'running',
        title: 'routes_overview.running_tab',
        content: (
          <View className="flex-1 px-4 pt-4">
            <RunningRoutes />
          </View>
        ),
      },
      {
        key: 'plans',
        title: 'routes_overview.plans_tab',
        content: (
          <View className="flex-1 px-4 pt-4">
            <DepartmentRoutePlans />
          </View>
        ),
      },
    ],
    []
  );

  // In the route's params, so the same tab is selected after opening a plan or a run and coming Back.
  const routeTab = useRouteTab(tabs);

  return (
    <View className="flex-1 bg-background-50" testID="routes-overview-screen">
      <SharedTabs tabs={tabs} activeIndex={routeTab.activeIndex} onChange={routeTab.selectIndex} variant="pills" className="flex-1" />
    </View>
  );
}
