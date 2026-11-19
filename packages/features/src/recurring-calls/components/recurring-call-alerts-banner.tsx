import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { useRecurringCallAlertsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text, useThemeColors } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import { BellRing, ChevronRight } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { useIsRecurringCallsEnabled } from '../hooks/use-recurring-calls';
import { recurringCallsRoutes } from '../routes';

export interface RecurringCallAlertsBannerProps {
  /** The shell hides it on the alerts screen itself. */
  hidden?: boolean;
  /** Overrides navigation (a console opening a side panel instead of the route). */
  onPress?: () => void;
}

/**
 * Persistent strip under the app bar while any recurring call alert is open (a call that could not be created or was
 * missed, one held for lack of resources, one sent short, a dispatcher-mode occurrence that is due). It stays on every
 * screen — the dispatch console and the call list included — until the alerts are dealt with, and is drawn stronger while
 * alerts the dispatcher has not seen yet are among them. Opens the alerts screen.
 */
export const RecurringCallAlertsBanner: React.FC<RecurringCallAlertsBannerProps> = ({ hidden = false, onPress }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const isEnabled = useIsRecurringCallsEnabled();
  const count = useRecurringCallAlertsStore((state) => state.alerts.length);
  const unseen = useRecurringCallAlertsStore((state) => state.newAlertIds.length);

  if (!isEnabled || hidden || count === 0) return null;

  const label = t('recurring_calls.alerts.banner', { count });

  return (
    <Pressable
      onPress={onPress ?? (() => pushRoutePath(router, recurringCallsRoutes.alerts()))}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('recurring_calls.alerts.banner_open')}
      testID="recurring-call-alerts-banner"
    >
      <View className={`border-b px-3 py-1.5 ${unseen > 0 ? 'border-error-300 bg-error-50' : 'border-warning-300 bg-background-warning'}`} testID={unseen > 0 ? 'recurring-call-alerts-banner-new' : undefined}>
        <HStack space="sm" className="items-center justify-between">
          <HStack space="sm" className="shrink items-center">
            <View>
              <BellRing size={14} color={unseen > 0 ? colors.error : colors.warning} />
            </View>
            <Text size="sm" className={`shrink font-semibold ${unseen > 0 ? 'text-error-800' : 'text-warning-800'}`} numberOfLines={1}>
              {label}
            </Text>
          </HStack>
          <HStack space="xs" className="items-center">
            <Text size="xs" className="font-medium text-warning-700">
              {t('recurring_calls.alerts.banner_open')}
            </Text>
            <View>
              <ChevronRight size={14} color={colors.warning} />
            </View>
          </HStack>
        </HStack>
      </View>
    </Pressable>
  );
};
