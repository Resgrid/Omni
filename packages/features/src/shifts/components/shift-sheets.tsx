import { useShiftsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { ShiftDayResultData, ShiftResultData, ShiftTradeResultData } from '@resgrid/models';
import { Badge, BadgeText, Button, ButtonText, CustomBottomSheet, HStack, Text, useThemeColors, VStack } from '@resgrid/ui';
import { CalendarDays } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { ShiftTradeAction } from '../lib/shift-action-types';
import { getAssignmentTypeKey, getScheduleTypeKey } from '../lib/shift-rules';
import { formatShiftDate } from '../lib/shift-time';
import { ShiftDayCard } from './shift-day-card';
import { ShiftTradeDetails } from './shift-trade-details';

export interface ShiftTradeDetailsSheetProps {
  trade: ShiftTradeResultData | null;
  onClose: () => void;
  /** The sheet closes before the confirmation opens, so two sheets never stack. */
  onAction: (action: ShiftTradeAction) => void;
}

export const ShiftTradeDetailsSheet: React.FC<ShiftTradeDetailsSheetProps> = ({ trade, onClose, onAction }) => (
  <CustomBottomSheet isOpen={trade !== null} onClose={onClose} snapPoints={[90]} testID="shift-trade-details-sheet">
    {trade ? (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <ShiftTradeDetails tradeId={trade.ShiftSignupTradeId} fallback={trade} onAction={onAction} />
      </ScrollView>
    ) : null}
  </CustomBottomSheet>
);

export interface ShiftDetailsSheetProps {
  /** The standing shift picked from My Shifts or the calendar filter. */
  shift: ShiftResultData | null;
  onClose: () => void;
  onViewCalendar: (shiftId: string) => void;
  onOpenDay: (day: ShiftDayResultData) => void;
}

/** A standing shift: schedule, hours, groups with their role requirements and the next days. */
export const ShiftDetailsSheet: React.FC<ShiftDetailsSheetProps> = ({ shift, onClose, onViewCalendar, onOpenDay }) => {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const shiftId = shift?.ShiftId ?? '';
  const loaded = useShiftsStore((state) => (shiftId ? state.shiftsById[shiftId] : undefined));

  useEffect(() => {
    if (shiftId) void useShiftsStore.getState().fetchShift(shiftId);
  }, [shiftId]);

  const current = loaded ?? shift;
  const groups = current?.Groups ?? [];
  const days = (current?.Days ?? []).slice(0, 7);

  return (
    <CustomBottomSheet isOpen={shift !== null} onClose={onClose} snapPoints={[90]} testID="shift-details-sheet">
      {current ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <VStack space="lg">
            <VStack space="xs">
              <Text className="text-2xl font-bold text-typography-900" accessibilityRole="header">
                {current.Name}
              </Text>
              {current.Code ? (
                <Text size="sm" className="text-typography-600">
                  {`${t('shifts.shift_code')}: ${current.Code}`}
                </Text>
              ) : null}
              <HStack className="flex-wrap">
                <Badge action="info" size="sm" className="mb-1 mr-1">
                  <BadgeText>{t(getScheduleTypeKey(current.ScheduleType))}</BadgeText>
                </Badge>
                <Badge action="muted" size="sm" className="mb-1 mr-1">
                  <BadgeText>{t(getAssignmentTypeKey(current.AssignmentType))}</BadgeText>
                </Badge>
                {current.InShift ? (
                  <Badge action="success" size="sm" className="mb-1 mr-1">
                    <BadgeText>{t('shifts.in_shift')}</BadgeText>
                  </Badge>
                ) : null}
                {current.RequireApproval ? (
                  <Badge action="muted" size="sm" className="mb-1 mr-1">
                    <BadgeText>{t('shifts.approval_required')}</BadgeText>
                  </Badge>
                ) : null}
              </HStack>
            </VStack>

            <VStack space="xs">
              {current.StartTime && current.EndTime ? <Text size="sm" className="text-typography-700">{`${t('shifts.hours')}: ${current.StartTime} – ${current.EndTime}`}</Text> : null}
              <Text size="sm" className="text-typography-700">{`${t('shifts.personnel_count')}: ${current.PersonnelCount}`}</Text>
              {current.NextDay ? <Text size="sm" className="text-typography-700">{`${t('shifts.next_day')}: ${formatShiftDate(current.NextDay, i18n.language)}`}</Text> : null}
            </VStack>

            {groups.length > 0 ? (
              <VStack space="sm">
                <Text className="text-lg font-semibold text-typography-900">{t('shifts.groups')}</Text>
                {groups.map((group) => (
                  <VStack key={group.GroupId} className="rounded-lg border border-outline-200 p-3" testID={`shift-group-${group.GroupId}`}>
                    <Text className="font-semibold text-typography-900">{group.GroupName}</Text>
                    {(group.Roles ?? []).length > 0 ? (
                      group.Roles.map((role) => (
                        <HStack key={role.RoleId} className="justify-between">
                          <Text size="sm" className="text-typography-700">
                            {role.RoleName}
                          </Text>
                          <Text size="sm" className="text-typography-700">
                            {t('shifts.required_count', { count: role.Required })}
                          </Text>
                        </HStack>
                      ))
                    ) : (
                      <Text size="sm" className="text-typography-500">
                        {t('shifts.day.no_role_requirements')}
                      </Text>
                    )}
                  </VStack>
                ))}
              </VStack>
            ) : null}

            <Button variant="outline" onPress={() => onViewCalendar(current.ShiftId)} accessibilityHint={t('shifts.view_calendar_hint')} testID="shift-details-view-calendar">
              <View>
                <CalendarDays size={16} color={colors.primary} />
              </View>
              <ButtonText>{t('shifts.view_calendar')}</ButtonText>
            </Button>

            {days.length > 0 ? (
              <VStack space="sm">
                <Text className="text-lg font-semibold text-typography-900">{t('shifts.upcoming_shift_days')}</Text>
                {days.map((day) => (
                  <ShiftDayCard key={day.ShiftDayId} shiftDay={day} onPress={onOpenDay} />
                ))}
              </VStack>
            ) : null}
          </VStack>
        </ScrollView>
      ) : null}
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%' },
  content: { paddingBottom: 40 },
});
