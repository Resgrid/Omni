import { useTranslation } from '@resgrid/i18n';
import type { ShiftResultData } from '@resgrid/models';
import { Badge, BadgeText, HStack, Pressable, Text, useThemeColors, VStack } from '@resgrid/ui';
import { Calendar, Clock, Users } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { getAssignmentTypeKey, getScheduleTypeKey } from '../lib/shift-rules';
import { formatShiftDate } from '../lib/shift-time';

export interface ShiftCardProps {
  shift: ShiftResultData;
  onPress: (shift: ShiftResultData) => void;
}

/** A standing shift (the shift itself, not one day of it): hours, size, next day and its schedule. */
export const ShiftCard: React.FC<ShiftCardProps> = React.memo(({ shift, onPress }) => {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const hours = shift.StartTime && shift.EndTime ? `${shift.StartTime} – ${shift.EndTime}` : '';
  return (
    <Pressable
      onPress={() => onPress(shift)}
      accessibilityRole="button"
      accessibilityLabel={shift.Name}
      accessibilityHint={t('shifts.shift_card_a11y_hint')}
      testID={`shift-card-${shift.ShiftId}`}
      className="mb-3 rounded-xl border border-outline-100 bg-background-0 p-4"
      style={StyleSheet.flatten([styles.card, { borderLeftColor: shift.Color || colors.primary }])}
    >
      <VStack space="sm">
        <HStack className="items-start justify-between">
          <VStack space="xs" className="mr-3 flex-1">
            <Text className="font-semibold text-typography-900">{shift.Name}</Text>
            {shift.Code ? (
              <Text size="sm" className="text-typography-600">
                {`${t('shifts.shift_code')}: ${shift.Code}`}
              </Text>
            ) : null}
          </VStack>
          {shift.InShift ? (
            <Badge action="success" size="sm">
              <BadgeText>{t('shifts.in_shift')}</BadgeText>
            </Badge>
          ) : null}
        </HStack>
        {hours ? (
          <HStack space="xs" className="items-center">
            <View>
              <Clock size={16} color={colors.icon} />
            </View>
            <Text size="sm" className="text-typography-600">
              {hours}
            </Text>
          </HStack>
        ) : null}
        <HStack space="lg">
          <HStack space="xs" className="items-center">
            <View>
              <Users size={16} color={colors.icon} />
            </View>
            <Text size="sm" className="text-typography-600">
              {`${t('shifts.personnel_count')}: ${shift.PersonnelCount}`}
            </Text>
          </HStack>
          <HStack space="xs" className="items-center">
            <View>
              <Calendar size={16} color={colors.icon} />
            </View>
            <Text size="sm" className="text-typography-600">
              {`${t('shifts.groups')}: ${shift.GroupCount}`}
            </Text>
          </HStack>
        </HStack>
        {shift.NextDay ? (
          <Text size="sm" className="text-typography-700">
            {`${t('shifts.next_day')}: ${formatShiftDate(shift.NextDay, i18n.language)}`}
          </Text>
        ) : null}
        <HStack className="flex-wrap">
          <Badge action="info" size="sm" className="mb-1 mr-1">
            <BadgeText>{t(getScheduleTypeKey(shift.ScheduleType))}</BadgeText>
          </Badge>
          <Badge action="muted" size="sm" className="mb-1 mr-1">
            <BadgeText>{t(getAssignmentTypeKey(shift.AssignmentType))}</BadgeText>
          </Badge>
          {shift.RequireApproval ? (
            <Badge action="muted" size="sm" className="mb-1 mr-1">
              <BadgeText>{t('shifts.approval_required')}</BadgeText>
            </Badge>
          ) : null}
        </HStack>
      </VStack>
    </Pressable>
  );
});

ShiftCard.displayName = 'ShiftCard';

const styles = StyleSheet.create({
  card: { borderLeftWidth: 4 },
});
