import { useRoutesStore } from '@resgrid/data';
import type { RenderRouteMap } from '@resgrid/features/unit-routes/map-slot';
import { readRouteParam } from '@resgrid/features/unit-routes/routes';
import { useTranslation } from '@resgrid/i18n';
import { ScreenHeader, View } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { RoutePlanPreview } from '../components/route-plan-preview';

export interface RoutePlanPreviewScreenProps {
  planId?: string;
  renderMap?: RenderRouteMap;
}

/**
 * A route plan's preview (`/route-plans/[id]`, `capabilities.routes.preview`): opened from the call form and call detail
 * (the call's pre-defined route), the Unit routes list and the department's routes. Read only; Back returns to where it
 * was opened (home when it was opened from a link).
 */
export default function RoutePlanPreviewScreen({ planId: planIdProp, renderMap }: RoutePlanPreviewScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const planId = planIdProp ?? readRouteParam(params.id);
  const name = useRoutesStore((state) => (planId ? state.planPreviewsById[planId]?.plan.Name : undefined));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View className="flex-1 bg-background-50" testID="route-plan-preview-screen">
      <ScreenHeader title={name || t('route_plans.preview_title')} onBack={back} />
      <RoutePlanPreview planId={planId} renderMap={renderMap} />
    </View>
  );
}
