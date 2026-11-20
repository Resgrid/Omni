import { useCapability } from '@resgrid/config';
import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import type { CallDetailActionProps } from '@resgrid/features/calls';
import { routePlansRoutes } from '@resgrid/features/route-plans/routes';
import { useStatusContext } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, HStack, Pressable, Text, View, VStack } from '@resgrid/ui';
import { router } from 'expo-router';
import { Eye, Route } from 'lucide-react-native';
import React from 'react';

import { type CallRouteState, useCallRoute } from '../hooks/use-call-route';
import { requestCallRouteLaunch } from '../lib/call-route-launch';

type RouteCall = Pick<CallResultData, 'CallId' | 'State' | 'RoutePlanId' | 'RoutePlanName'>;

/** "Start route" before the unit runs it, "Continue route" while its run is going (in progress or paused). */
export const callRouteActionKey = (route: Pick<CallRouteState, 'run'>): string => (route.run ? 'unit_status.route.continue' : 'unit_status.route.start');

/** "n of m stops" of the unit's run, or null before it runs. */
const useProgressText = (route: CallRouteState): string | null => {
  const { t } = useTranslation();

  if (!route.run) return null;
  const progress = t('unit_routes.stops_done', { done: route.run.done, total: route.run.total });

  return route.run.isPaused ? `${progress} · ${t('routes.paused')}` : progress;
};

const PreviewLink: React.FC<{ planId: string; testID: string; withLabel?: boolean }> = ({ planId, testID, withLabel = false }) => {
  const { t } = useTranslation();
  const label = t('route_plans.preview_action');

  return (
    <Pressable onPress={() => pushRoutePath(router, routePlansRoutes.preview(planId))} accessibilityRole="link" accessibilityLabel={label} hitSlop={8} className="flex-row items-center p-1" testID={testID}>
      <View>
        <Eye size={16} color="#2563eb" />
      </View>
      {withLabel ? <Text className="ml-1 text-sm font-medium text-primary-600">{label}</Text> : null}
    </Pressable>
  );
};

/**
 * The call's route on its detail screen, beside the title (the `CallDetailAction` hook point, Unit): for the crew's active
 * call with a pre-defined route, "Start route" or "Continue route" (in-app navigation through its stops, else the running
 * route screen) with the run's progress, and the route preview (`capabilities.routes.preview`). A call that is not the
 * active call offers "Set Active" instead, which starts its route too.
 */
export const CallRouteDetailAction: React.FC<CallDetailActionProps> = ({ call }) => {
  const { t } = useTranslation();
  const { activeCallId } = useStatusContext();
  const canPreview = useCapability('routes').preview;
  const route = useCallRoute(call);
  const progress = useProgressText(route);

  if (!route.canRun || !route.planId || call.CallId !== activeCallId) return null;

  return (
    <HStack className="ml-2 items-center" testID="call-detail-route">
      <VStack className="items-end">
        <Button size="sm" onPress={() => requestCallRouteLaunch(call.CallId)} isDisabled={route.isLaunching} accessibilityLabel={t(callRouteActionKey(route))} testID="call-detail-route-run">
          {route.isLaunching ? <ButtonSpinner /> : <ButtonText>{t(callRouteActionKey(route))}</ButtonText>}
        </Button>
        {progress ? (
          <Text className="mt-0.5 text-xs text-typography-500" testID="call-detail-route-progress">
            {progress}
          </Text>
        ) : null}
      </VStack>
      {canPreview ? <PreviewLink planId={route.planId} testID="call-detail-route-preview" /> : null}
    </HStack>
  );
};

export interface CallRouteStripProps {
  call: RouteCall;
  testID?: string;
}

/**
 * The active call's route under its card (Unit console): the route's name, the unit's progress on it ("2 of 5 stops") and
 * the route preview. The card's Route action starts or continues it.
 */
export const CallRouteStrip: React.FC<CallRouteStripProps> = ({ call, testID = 'call-route-strip' }) => {
  const { t } = useTranslation();
  const canPreview = useCapability('routes').preview;
  const route = useCallRoute(call);
  const progress = useProgressText(route);

  if (!route.canRun || !route.planId) return null;

  return (
    <HStack className="items-center rounded-lg border border-outline-100 bg-background-50 px-3 py-2" testID={testID}>
      <View>
        <Route size={16} color="#2563eb" />
      </View>
      <VStack className="ml-2 flex-1">
        <Text className="text-sm font-semibold text-typography-900" numberOfLines={1} testID={`${testID}-name`}>
          {route.name ? t('unit_status.route.name', { name: route.name }) : t('unit_status.route.unnamed')}
        </Text>
        {progress ? (
          <Text className="text-xs text-typography-500" testID={`${testID}-progress`}>
            {progress}
          </Text>
        ) : null}
      </VStack>
      {canPreview ? <PreviewLink planId={route.planId} testID={`${testID}-preview`} withLabel /> : null}
    </HStack>
  );
};
