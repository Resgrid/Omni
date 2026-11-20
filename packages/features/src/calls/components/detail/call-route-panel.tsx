import { useCapability } from '@resgrid/config';
import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useRoutesStore, useUnitsStore } from '@resgrid/data';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { routePlansRoutes } from '@resgrid/features/route-plans/routes';
import { instanceStatusLook } from '@resgrid/features/unit-routes/lib/route-status';
import { useTranslation } from '@resgrid/i18n';
import type { CallExtraDataResultData, CallResultData, CallRouteInstanceResultData } from '@resgrid/models';
import { Button, ButtonText, Text, useThemeColors } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import { Eye, Navigation, Truck } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { callRouteInstancesOf, callRouteName, callRoutePlanEndpoints, callRoutePlanId, callRoutePlanSummary } from '../../lib/call-route';

export interface CallRoutePanelProps {
  call: CallResultData;
  extraData: CallExtraDataResultData | null;
}

/**
 * The call's Route tab (Core M0322): the pre-defined route — its name, stops, distance, time, start and end, and a link to
 * its preview (`routes.preview`) — and the runs units started for the call (`GetCallExtraData.RouteInstances`): unit,
 * status, stops done of the total, when it started, reached the route's start and ended. Starting a run is the unit's
 * action beside the title (`CallDetailAction`), not this tab's.
 */
export const CallRoutePanel: React.FC<CallRoutePanelProps> = ({ call, extraData }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const timeZone = useDepartmentTimeZone();
  const routes = useCapability('routes');
  const plans = useRoutesStore((state) => state.callRoutePlans);
  const units = useUnitsStore((state) => state.units);
  const planId = callRoutePlanId(call);
  const plan = planId ? (plans.find((entry) => entry.RoutePlanId === planId) ?? null) : null;
  const name = callRouteName(call, plans);
  const runs = callRouteInstancesOf(extraData);
  const previewPath = planId && routes.preview ? routePlansRoutes.preview(planId) : null;

  useEffect(() => {
    // The plan's stops, distance and ends come from the routes a call may run (cached; persisted for offline).
    if (planId) void useRoutesStore.getState().fetchCallRoutePlans();
  }, [planId]);

  const time = (utc: string | null): string => (utc ? formatUtcInDepartmentTime(utc, timeZone) : '');

  const renderRun = (run: CallRouteInstanceResultData) => {
    const look = instanceStatusLook(run.Status);
    const unitName = run.UnitName?.trim() || units.find((unit) => String(unit.UnitId) === String(run.UnitId))?.Name || t('routes.unit');

    const details = [
      t('unit_routes.stops_done', { done: run.StopsCompleted, total: run.StopsTotal }),
      run.ActualStartOn ? t('call_detail.route_run_started', { time: time(run.ActualStartOn) }) : '',
      run.StartReachedOn ? t('call_detail.route_run_start_reached', { time: time(run.StartReachedOn) }) : '',
      run.ActualEndOn ? t('call_detail.route_run_ended', { time: time(run.ActualEndOn) }) : '',
    ].filter((part) => part !== '');

    return (
      <View key={run.RouteInstanceId} style={styles.run} className="border-outline-100" testID={`call-route-run-${run.RouteInstanceId}`}>
        <View style={styles.runHeader}>
          <View style={styles.icon}>
            <Truck size={14} color={colors.primary} />
          </View>
          <Text className="flex-1 font-semibold text-typography-900" numberOfLines={1}>
            {unitName}
          </Text>
          <View style={StyleSheet.flatten([styles.badge, { backgroundColor: `${look.color}26` }])} testID={`call-route-run-${run.RouteInstanceId}-status`}>
            <Text size="xs" className="font-semibold" style={{ color: look.color }}>
              {t(look.labelKey)}
            </Text>
          </View>
        </View>
        <Text size="xs" className="mt-1 text-typography-600">
          {details.join(' · ')}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.panel} testID="call-route-panel">
      {planId ? (
        <View style={styles.plan} testID="call-route-plan">
          <View style={styles.runHeader}>
            <View style={styles.icon}>
              <Navigation size={16} color={colors.primary} />
            </View>
            <Text className="flex-1 text-base font-bold text-typography-900" testID="call-route-name">
              {name || t('calls.route_unknown')}
            </Text>
          </View>
          {plan ? (
            <>
              <Text size="sm" className="mt-1 text-typography-600">
                {callRoutePlanSummary(plan, t)}
              </Text>
              <Text size="sm" className="text-typography-500" testID="call-route-endpoints">
                {callRoutePlanEndpoints(plan, t)}
              </Text>
            </>
          ) : null}
          {previewPath ? (
            <Button variant="outline" size="sm" className="mt-2 self-start" onPress={() => pushRoutePath(router, previewPath)} accessibilityLabel={t('route_plans.preview_action')} testID="call-route-preview">
              <View style={styles.icon}>
                <Eye size={14} color={colors.primary} />
              </View>
              <ButtonText>{t('route_plans.preview_action')}</ButtonText>
            </Button>
          ) : null}
        </View>
      ) : null}
      <Text className="mb-1 mt-3 font-semibold text-typography-900" accessibilityRole="header">
        {t('call_detail.route_runs')}
      </Text>
      {runs.length > 0 ? (
        runs.map(renderRun)
      ) : (
        <Text size="sm" className="text-typography-500" testID="call-route-no-runs">
          {t('call_detail.route_no_runs')}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { padding: 16 },
  plan: { paddingBottom: 4 },
  run: { paddingVertical: 8, borderBottomWidth: 1 },
  runHeader: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 6 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
});
