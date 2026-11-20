import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { selectCallById, useCallsStore } from '@resgrid/data';
import { callDisplayName } from '@resgrid/features/calls/lib/call-display';
import { callRoutes } from '@resgrid/features/calls/routes';
import { useTranslation } from '@resgrid/i18n';
import type { RouteInstanceResultData } from '@resgrid/models';
import { HStack, Pressable, Text, View } from '@resgrid/ui';
import { router } from 'expo-router';
import { Phone } from 'lucide-react-native';
import React from 'react';

import { runCallId } from '../lib/call-run';

export interface RunCallLinkProps {
  instance: Pick<RouteInstanceResultData, 'CallId'> | null;
  /** False inside something the crew already taps (a card): the call is named, not linked (a button in a button is invalid on the web). */
  linked?: boolean;
  testID?: string;
}

/**
 * The call a run was started for (Core M0322 `CallId`): its number and name from the calls store, opening the call. A call
 * the store does not hold (closed, or not loaded yet) still links, named only as "a call". Renders nothing for other runs.
 */
export const RunCallLink: React.FC<RunCallLinkProps> = ({ instance, linked = true, testID = 'route-run-call' }) => {
  const { t } = useTranslation();
  const callId = runCallId(instance);
  const call = useCallsStore((state) => (callId ? selectCallById(state, callId) : undefined));

  if (!callId) return null;
  const name = call ? callDisplayName(call, t('data_protection.protected_value')) : '';
  const label = call ? t('unit_routes.for_call', { call: call.Number ? `#${call.Number} · ${name}` : name }) : t('unit_routes.for_a_call');

  const content = (
    <HStack space="xs" className="items-center">
      <View>
        <Phone size={14} color={linked ? '#2563eb' : '#6b7280'} />
      </View>
      <Text className={`flex-1 text-sm font-medium ${linked ? 'text-primary-600' : 'text-typography-700'}`} numberOfLines={1}>
        {label}
      </Text>
    </HStack>
  );

  if (!linked) {
    return (
      <View className="py-1" testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable onPress={() => pushRoutePath(router, callRoutes.callDetail(callId))} accessibilityRole="link" testID={testID} className="py-1">
      {content}
    </Pressable>
  );
};
