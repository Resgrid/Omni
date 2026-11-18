import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { useRecurringCallsStore } from '@resgrid/data';
import type { CallDetailActionProps } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import { Pressable, Text, useThemeColors } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import { ChevronRight, Repeat } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { View } from 'react-native';

import { useIsRecurringCallsEnabled } from '../hooks/use-recurring-calls';
import { scheduleName } from '../lib/schedule-format';
import { recurringCallsRoutes } from '../routes';

/**
 * On a call's detail: "Created by the recurring call …" when a schedule made it (`RecurringCallId`), so whoever opens a
 * held or scheduled transfer knows where it came from. Where the app has recurring calls the schedule is named and opens
 * on a tap; elsewhere the note is plain text. Nothing for other calls.
 */
export const RecurringCallNotice: React.FC<CallDetailActionProps> = ({ call }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const canOpen = useIsRecurringCallsEnabled();
  const recurringCallId = call.RecurringCallId ?? null;
  const schedule = useRecurringCallsStore((state) => (recurringCallId ? state.schedules.find((entry) => entry.RecurringCallId === recurringCallId) : undefined));
  const listLoaded = useRecurringCallsStore((state) => (state.fetchedAt.list ?? 0) > 0);

  useEffect(() => {
    if (canOpen && recurringCallId && !listLoaded) void useRecurringCallsStore.getState().fetchRecurringCalls();
  }, [canOpen, listLoaded, recurringCallId]);

  if (!recurringCallId) return null;

  const text = schedule ? t('recurring_calls.created_by_schedule', { schedule: scheduleName(schedule) }) : t('recurring_calls.created_by_recurring_call');

  const body = (
    <View className="mb-3 flex-row items-center rounded-xl border border-info-300 bg-info-50 p-3" testID="recurring-call-notice">
      <View className="mr-2">
        <Repeat size={18} color={colors.info} />
      </View>
      <Text size="sm" className="flex-1 text-info-800">
        {text}
      </Text>
      {canOpen ? (
        <View>
          <ChevronRight size={16} color={colors.info} />
        </View>
      ) : null}
    </View>
  );

  return canOpen ? (
    <Pressable
      onPress={() => pushRoutePath(router, recurringCallsRoutes.detail(recurringCallId))}
      accessibilityRole="link"
      accessibilityLabel={text}
      accessibilityHint={t('recurring_calls.view_schedule')}
      testID="recurring-call-notice-open"
    >
      {body}
    </Pressable>
  ) : (
    body
  );
};
