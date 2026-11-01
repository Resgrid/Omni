import { useTranslation } from '@resgrid/i18n';
import type { RouteDeviationResultData } from '@resgrid/models';
import { HStack, Pressable, Text, View, VStack } from '@resgrid/ui';
import { TriangleAlert, X } from 'lucide-react-native';
import React from 'react';

import { formatDistance, formatRouteTime } from '../lib/route-format';
import { deviationTypeKey } from '../lib/route-status';

export interface DeviationBannerProps {
  /** This instance's unacknowledged deviations, newest first. */
  deviations: readonly RouteDeviationResultData[];
  onAcknowledge: (deviationId: string) => void;
  testID?: string;
}

/**
 * The newest unacknowledged route deviation (Unit banner, fixed: it showed a `Description` field Core never sends):
 * its type, how far off route, when, and the dispatcher's note, with Acknowledge.
 */
export const DeviationBanner: React.FC<DeviationBannerProps> = ({ deviations, onAcknowledge, testID = 'route-deviation-banner' }) => {
  const { t } = useTranslation();
  const latest = deviations[0];
  if (!latest) return null;
  const distance = formatDistance(latest.DeviationDistanceMeters);
  const detail = [distance, formatRouteTime(latest.DetectedOn)].filter((part) => part !== '').join(' · ');

  return (
    <HStack space="sm" className="mx-4 mb-2 items-center rounded-lg bg-warning-50 p-3" testID={testID}>
      <View>
        <TriangleAlert size={18} color="#d97706" />
      </View>
      <VStack className="flex-1">
        <Text className="text-sm font-semibold text-warning-800" testID={`${testID}-type`}>
          {t(deviationTypeKey(latest.DeviationType))}
        </Text>
        {detail ? <Text className="text-xs text-warning-700">{detail}</Text> : null}
        {latest.Notes ? (
          <Text className="text-xs text-warning-700" numberOfLines={2}>
            {latest.Notes}
          </Text>
        ) : null}
      </VStack>
      {deviations.length > 1 ? (
        <View className="rounded-full bg-warning-200 px-2 py-0.5">
          <Text className="text-xs font-bold text-warning-800">{`+${deviations.length - 1}`}</Text>
        </View>
      ) : null}
      <Pressable onPress={() => onAcknowledge(latest.RouteDeviationId)} accessibilityRole="button" accessibilityLabel={t('routes.acknowledge')} testID={`${testID}-ack`} className="p-2">
        <X size={18} color="#d97706" />
      </Pressable>
    </HStack>
  );
};
