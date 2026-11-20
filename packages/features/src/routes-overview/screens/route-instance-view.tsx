import RouteInstanceScreen from '@resgrid/features/unit-routes/screens/route-instance';
import { router } from 'expo-router';
import React, { useCallback } from 'react';

import { routesOverviewRoutes } from '../routes';

/**
 * A route run read only (`/route-instances/[id]`, Dispatch's routes area): status, start, progress and every stop's
 * check-in, check-out, dwell and skip, on a map with the plan's route line; pull to refresh while it runs. The Unit
 * history screen's view, with Back to the department's routes.
 */
export default function RouteInstanceViewScreen() {
  const toRoutes = useCallback(() => router.replace(routesOverviewRoutes.list()), []);

  return <RouteInstanceScreen onBack={toRoutes} showPlanLine={true} />;
}
