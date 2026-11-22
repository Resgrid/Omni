import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { deskBreakKey, isOnBreak, useDispatcherDeskStore } from '@resgrid/data';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import { type DispatcherDeskMemberData, DispatcherDutyMode } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, HStack, Text, useThemeColors, VStack } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import { Monitor, Smartphone, Tablet } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { View } from 'react-native';

import { useDeskActions } from '../hooks/use-desk-actions';
import { useDispatcherDeskView } from '../hooks/use-dispatcher-desk';
import { breakTypeLabelKey, deviceLabelKey } from '../lib/desk-format';
import { StateChip } from './state-chip';

const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

const DEVICE_ICONS = new Map<string, LucideIcon>([
  ['phone', Smartphone],
  ['tablet', Tablet],
  ['desktop', Monitor],
]);

/** Signed-in first (available, busy, away, on break), then the rest; by name inside each. */
export const sortTeam = (members: readonly DispatcherDeskMemberData[]): DispatcherDeskMemberData[] =>
  [...members].sort((a, b) => Number(b.IsSignedIn) - Number(a.IsSignedIn) || Number(b.IsOnDuty) - Number(a.IsOnDuty) || (a.Name ?? '').localeCompare(b.Name ?? ''));

export interface TeamBoardProps {
  /** Supervisors: plan or change a dispatcher's breaks. */
  onPlanBreaks?: (member: DispatcherDeskMemberData) => void;
  testID?: string;
}

/**
 * Everyone on the desk (plan D1, D4): state with the break countdown or how long it is overdue, their duty (shift and
 * when it ends, or unscheduled), their next break, the work they hold against their capacity and the device they are
 * signed in on. A supervisor ends a dispatcher's break or opens their breaks.
 */
export const TeamBoard: React.FC<TeamBoardProps> = ({ onPlanBreaks, testID = 'desk-team-board' }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const timeZone = useDepartmentTimeZone();
  const { desk, me } = useDispatcherDeskView();
  const actions = useDeskActions();
  const busyKeys = useDispatcherDeskStore((state) => state.busyKeys);
  const members = useMemo(() => sortTeam(desk?.Members ?? []), [desk?.Members]);
  const canSupervise = me?.CanSupervise === true;

  if (!desk) return null;

  return (
    <VStack space="sm" testID={testID}>
      <Text size="sm" className={desk.BelowMinimum ? 'font-semibold text-error-700' : 'text-typography-600'} testID={`${testID}-summary`}>
        {t('dispatcher_desk.team.summary', { available: desk.AvailableCount, onBreak: desk.OnBreakCount, onDuty: desk.OnDutyCount, minimum: desk.MinimumAvailable })}
      </Text>
      {members.length === 0 ? (
        <Text size="sm" className="text-typography-500">
          {t('dispatcher_desk.team.empty')}
        </Text>
      ) : null}
      {members.map((member) => {
        const DeviceIcon = member.DeviceKind ? DEVICE_ICONS.get(member.DeviceKind) : undefined;
        const busy = busyKeys.includes(deskBreakKey(`user:${member.UserId}`));
        const isMe = member.UserId === me?.UserId;

        const duty =
          member.DutyMode === DispatcherDutyMode.Unscheduled
            ? t('dispatcher_desk.team.unscheduled', { time: member.DutyEndsOn ? formatUtcInDepartmentTime(member.DutyEndsOn, timeZone, TIME) : t('dispatcher_desk.team.open') })
            : member.Duty
              ? t('dispatcher_desk.team.on_shift', { shift: member.Duty.ShiftName ?? '', time: member.Duty.EndUtc ? formatUtcInDepartmentTime(member.Duty.EndUtc, timeZone, TIME) : '' })
              : t('dispatcher_desk.team.no_shift');

        return (
          <View key={member.UserId} className="rounded-xl border border-outline-200 bg-background-0 p-3" testID={`${testID}-${member.UserId}`}>
            <HStack className="items-center justify-between">
              <HStack space="sm" className="shrink items-center">
                {DeviceIcon && member.IsSignedIn ? (
                  <View accessibilityLabel={t(deviceLabelKey(member.DeviceKind))}>
                    <DeviceIcon size={16} color={colors.icon} />
                  </View>
                ) : null}
                <Text className="shrink font-semibold text-typography-900" numberOfLines={1}>
                  {member.Name ?? member.UserId}
                  {isMe ? ` (${t('dispatcher_desk.team.you')})` : ''}
                  {member.IsSupervisor ? ` · ${t('dispatcher_desk.team.supervisor')}` : ''}
                </Text>
              </HStack>
              <StateChip member={member} testID={`${testID}-${member.UserId}-state`} />
            </HStack>
            <Text size="xs" className="mt-1 text-typography-600">
              {duty}
            </Text>
            <Text size="xs" className="text-typography-600">
              {t('dispatcher_desk.team.holding', { count: member.ActiveItemCount, capacity: member.Capacity })}
              {member.OfferedItemCount > 0 ? ` · ${t('dispatcher_desk.team.offered', { count: member.OfferedItemCount })}` : ''}
            </Text>
            {member.NextBreak && !isOnBreak(member) ? (
              <Text size="xs" className="text-typography-600">
                {t('dispatcher_desk.team.next_break', {
                  type: t(breakTypeLabelKey(member.NextBreak.BreakType)),
                  time: member.NextBreak.ScheduledStartOn ? formatUtcInDepartmentTime(member.NextBreak.ScheduledStartOn, timeZone, TIME) : '',
                  minutes: member.NextBreak.DurationMinutes,
                })}
              </Text>
            ) : null}
            {canSupervise && !isMe ? (
              <HStack className="mt-2 flex-wrap">
                {isOnBreak(member) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    action="secondary"
                    className="mb-1 mr-2 min-h-[40px]"
                    onPress={() => void actions.run(() => useDispatcherDeskStore.getState().endBreak(member.UserId), { success: t('dispatcher_desk.team.break_ended', { name: member.Name ?? '' }) })}
                    isDisabled={busy}
                    accessibilityLabel={t('dispatcher_desk.team.end_break')}
                    testID={`${testID}-${member.UserId}-end-break`}
                  >
                    {busy ? <ButtonSpinner /> : <ButtonText>{t('dispatcher_desk.team.end_break')}</ButtonText>}
                  </Button>
                ) : null}
                {onPlanBreaks ? (
                  <Button
                    size="sm"
                    variant="outline"
                    action="secondary"
                    className="mb-1 mr-2 min-h-[40px]"
                    onPress={() => onPlanBreaks(member)}
                    accessibilityLabel={t('dispatcher_desk.team.breaks')}
                    testID={`${testID}-${member.UserId}-breaks`}
                  >
                    <ButtonText>{t('dispatcher_desk.team.breaks')}</ButtonText>
                  </Button>
                ) : null}
              </HStack>
            ) : null}
          </View>
        );
      })}
    </VStack>
  );
};
