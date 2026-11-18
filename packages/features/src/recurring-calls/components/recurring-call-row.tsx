import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import type { RecurringCallResultData } from '@resgrid/models';
import { Pressable, Text, useThemeColors } from '@resgrid/ui';
import { BellRing, ChevronRight } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { describePattern, joinParts, modeLabelKey, recurringCallStatus, scheduleName, STATUS_LABEL_KEYS } from '../lib/schedule-format';
import { type PillTone, StatusPill } from './status-pill';

const STATUS_TONES = { active: 'success', paused: 'warning', ended: 'muted' } as const satisfies Record<string, PillTone>;

export interface RecurringCallRowProps {
  schedule: RecurringCallResultData;
  onPress: (schedule: RecurringCallResultData) => void;
}

/**
 * One schedule in the list: name, status (active, paused, ended), mode, how often, the pickup facility, the next dispatch
 * in the department's time and how many alerts are open for it.
 */
export const RecurringCallRow: React.FC<RecurringCallRowProps> = ({ schedule, onPress }) => {
  const { t, i18n } = useTranslation();
  const timeZone = useDepartmentTimeZone();
  const colors = useThemeColors();
  const status = recurringCallStatus(schedule);
  const locale = i18n?.language ?? 'en';
  const name = scheduleName(schedule);
  const next = schedule.NextDispatchOn ? formatUtcInDepartmentTime(schedule.NextDispatchOn, timeZone, { dateStyle: 'medium', timeStyle: 'short' }, locale) : '';
  const testID = `recurring-call-${schedule.RecurringCallId}`;

  return (
    <Pressable onPress={() => onPress(schedule)} accessibilityRole="button" accessibilityLabel={name} className="mb-3 rounded-xl border border-outline-100 bg-background-0 p-3" testID={testID}>
      <View className="flex-row items-center">
        <Text className="flex-1 font-bold text-typography-900" numberOfLines={1}>
          {name}
        </Text>
        <View>
          <ChevronRight size={18} color={colors.textSubtle} />
        </View>
      </View>
      <View className="mt-1 flex-row flex-wrap">
        <StatusPill label={t(STATUS_LABEL_KEYS[status])} tone={STATUS_TONES[status]} testID={`${testID}-status`} />
        <StatusPill label={t(modeLabelKey(schedule))} tone="info" testID={`${testID}-mode`} />
        {schedule.UseRunCard ? <StatusPill label={t('recurring_calls.run_card')} tone="muted" /> : null}
      </View>
      <Text size="sm" className="text-typography-700" numberOfLines={2}>
        {joinParts([describePattern(schedule, t, locale), (schedule.Times ?? []).join(', ')])}
      </Text>
      {schedule.FacilityName ? (
        <Text size="xs" className="mt-1 text-typography-500" numberOfLines={1} testID={`${testID}-facility`}>
          {t('recurring_calls.facility_value', { facility: schedule.FacilityName })}
        </Text>
      ) : null}
      <Text size="xs" className="mt-1 text-typography-500" testID={`${testID}-next`}>
        {next ? t('recurring_calls.next_dispatch', { time: next }) : t('recurring_calls.no_next_dispatch')}
      </Text>
      {schedule.OpenAlertCount > 0 ? (
        <View className="mt-2 flex-row items-center" testID={`${testID}-alerts`}>
          <View>
            <BellRing size={14} color={colors.warning} />
          </View>
          <Text size="xs" className="ml-1 font-semibold text-warning-800">
            {t('recurring_calls.open_alerts', { count: schedule.OpenAlertCount })}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
};
