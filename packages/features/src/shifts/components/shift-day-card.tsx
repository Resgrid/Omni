import { useTranslation } from '@resgrid/i18n';
import type { ShiftDayResultData } from '@resgrid/models';
import { Badge, BadgeText, HStack, Pressable, Text, useThemeColors, VStack } from '@resgrid/ui';
import { Clock, Repeat, Truck, Users } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { getAssignmentTypeKey, getMyStatusLabel } from '../lib/shift-rules';
import { formatShiftDate, formatShiftTime, isOvernightShift, isWorkshiftDay } from '../lib/shift-time';

export interface ShiftDayCardProps {
  shiftDay: ShiftDayResultData;
  onPress: (shiftDay: ShiftDayResultData) => void;
  testID?: string;
}

/** One shift day: shift, date, hours (overnight marked), staffing, the caller's standing and an open trade. */
export const ShiftDayCard: React.FC<ShiftDayCardProps> = React.memo(({ shiftDay, onPress, testID }) => {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const locale = i18n.language;
  const myStatus = getMyStatusLabel(shiftDay.MyStatus);
  const date = formatShiftDate(shiftDay.ShiftDay || shiftDay.Start, locale);
  const overnight = isOvernightShift(shiftDay.Start, shiftDay.End);
  const timeRange = `${formatShiftTime(shiftDay.Start, locale)} – ${formatShiftTime(shiftDay.End, locale)}${overnight ? ` ${t('shifts.overnight')}` : ''}`;
  // A static shift (workshift) day is crewed by its units, so it has no open slots; show the caller's unit instead.
  const isWorkshift = isWorkshiftDay(shiftDay);
  const staffing = isWorkshift ? (shiftDay.MyUnitName ?? '') : shiftDay.Filled ? t('shifts.status.filled') : t('shifts.status.open_slots', { count: shiftDay.OpenSlots });
  const label = [shiftDay.ShiftName, date, timeRange, staffing, shiftDay.IsActive ? t('shifts.status.active_now') : '', myStatus ? t(myStatus.key) : '', shiftDay.MyTradeId ? t('shifts.status.trade_requested') : '']
    .filter((part) => !!part)
    .join(', ');

  return (
    <Pressable
      onPress={() => onPress(shiftDay)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('shifts.card_a11y_hint')}
      testID={testID ?? `shift-day-card-${shiftDay.ShiftDayId}`}
      className="mb-3 rounded-xl border border-outline-100 bg-background-0 p-4"
      style={StyleSheet.flatten([styles.card, { borderLeftColor: shiftDay.Color || colors.primary }])}
    >
      <VStack space="sm">
        <HStack className="items-start justify-between" space="sm">
          <VStack className="flex-1" space="xs">
            <Text className="font-semibold text-typography-900">{shiftDay.ShiftName}</Text>
            <Text size="sm" className="text-typography-600">
              {date}
            </Text>
          </VStack>
          {shiftDay.IsActive ? (
            <Badge action="success" size="sm" testID="shift-day-active-badge">
              <BadgeText>{t('shifts.status.active_now')}</BadgeText>
            </Badge>
          ) : null}
        </HStack>
        <HStack space="sm" className="items-center">
          <View>
            <Clock size={16} color={colors.icon} />
          </View>
          <Text size="sm" className="text-typography-700">
            {timeRange}
          </Text>
        </HStack>
        {isWorkshift ? (
          staffing ? (
            <HStack space="sm" className="items-center">
              <View>
                <Truck size={16} color={colors.icon} />
              </View>
              <Text size="sm" className="text-typography-700">
                {staffing}
              </Text>
            </HStack>
          ) : null
        ) : (
          <HStack space="sm" className="items-center">
            <View>
              <Users size={16} color={shiftDay.Filled ? colors.success : colors.warning} />
            </View>
            <Text size="sm" className={shiftDay.Filled ? 'text-success-700' : 'text-warning-700'}>
              {staffing}
            </Text>
          </HStack>
        )}
        <HStack className="flex-wrap">
          {myStatus ? (
            <Badge action={myStatus.action} size="sm" className="mb-1 mr-1" testID="shift-day-my-status">
              <BadgeText>{t(myStatus.key)}</BadgeText>
            </Badge>
          ) : null}
          {shiftDay.MyTradeId ? (
            <Badge action="info" size="sm" className="mb-1 mr-1" testID="shift-day-trade-badge">
              <View style={styles.badgeIcon}>
                <Repeat size={12} color={colors.info} />
              </View>
              <BadgeText>{t('shifts.status.trade_requested')}</BadgeText>
            </Badge>
          ) : null}
          <Badge action="muted" size="sm" className="mb-1 mr-1">
            <BadgeText>{t(getAssignmentTypeKey(shiftDay.ShiftType))}</BadgeText>
          </Badge>
          {shiftDay.RequireApproval ? (
            <Badge action="muted" size="sm" className="mb-1 mr-1">
              <BadgeText>{t('shifts.approval_required')}</BadgeText>
            </Badge>
          ) : null}
        </HStack>
      </VStack>
    </Pressable>
  );
});

ShiftDayCard.displayName = 'ShiftDayCard';

const styles = StyleSheet.create({
  card: { borderLeftWidth: 4 },
  badgeIcon: { marginRight: 4 },
});
