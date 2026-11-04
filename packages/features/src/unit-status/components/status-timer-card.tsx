import { formatElapsed, useUnitStatusTimer } from '@resgrid/features/unit-status-alerts';
import { useTranslation } from '@resgrid/i18n';
import { hasStatusTimerNotifications, useExactAlarmAccess } from '@resgrid/notifications';
import { HStack, Pressable, Text, View, VStack } from '@resgrid/ui';
import { AlarmClock, BellOff, CircleCheck, Timer } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import React from 'react';
import { StyleSheet } from 'react-native';

import { timerToneColors, unitTimerText } from '../lib/status-timer-text';

export interface StatusTimerCardProps {
  unitId: string | null;
  testID?: string;
}

/**
 * The unit's own status timer on its console (department Unit Status Timers): how long it has been in the status and
 * when the timer warns, a countdown once that is close, and how far over once it fires — the same timer dispatch's
 * console and BigBoard flag — plus whether dispatch has seen it. Renders nothing when no timer applies to the status.
 * On Android, while exact alarms are not allowed, it says the background alerts may come late and opens the system
 * screen to allow them.
 */
export const StatusTimerCard: React.FC<StatusTimerCardProps> = ({ unitId, testID = 'unit-status-timer' }) => {
  const { t } = useTranslation();
  const isDark = useColorScheme().colorScheme === 'dark';
  const timer = useUnitStatusTimer(unitId);
  const exactAlarms = useExactAlarmAccess(hasStatusTimerNotifications());

  if (!timer.hasTimer || !timer.unit) return null;
  const text = unitTimerText(t, timer, timer.unit.CurrentStatus || t('common.unknown'));
  const colors = timerToneColors(text.tone, isDark);
  const { acknowledgement, acknowledgementState } = timer;
  const seenBy = acknowledgement?.AcknowledgedByName ? t('unitAlerts.acknowledgedBy', { name: acknowledgement.AcknowledgedByName }) : t('unitAlerts.acknowledged');

  return (
    <VStack
      space="xs"
      className="rounded-xl border border-outline-100 bg-background-50 p-3"
      style={colors.edge ? StyleSheet.flatten([styles.edge, { borderLeftColor: colors.edge, backgroundColor: colors.background }]) : undefined}
      testID={`${testID}-${text.tone}`}
    >
      <HStack space="xs" className="items-center">
        <View>
          <Timer size={14} color={colors.edge ?? '#6b7280'} />
        </View>
        <Text className="flex-1 text-xs font-semibold uppercase text-typography-500">{t('unit_status.timer_title')}</Text>
        <Text className="text-sm font-bold" style={colors.edge ? { color: colors.edge } : undefined} testID={`${testID}-elapsed`}>
          {formatElapsed(timer.alert.secondsInStatus)}
        </Text>
      </HStack>
      <Text className="text-sm font-semibold text-typography-900" testID={`${testID}-headline`}>
        {text.headline}
      </Text>
      {text.detail ? (
        <Text className="text-xs text-typography-600" testID={`${testID}-detail`}>
          {text.detail}
        </Text>
      ) : null}
      {acknowledgementState !== 'none' ? (
        <HStack space="xs" className="items-center" testID={`${testID}-acknowledged`}>
          <View>{acknowledgementState === 'muted' ? <BellOff size={12} color="#6b7280" /> : <CircleCheck size={12} color="#6b7280" />}</View>
          <Text className="flex-1 text-xs text-typography-700" numberOfLines={2}>
            {acknowledgement?.Note ? `${seenBy}: ${acknowledgement.Note}` : seenBy}
          </Text>
        </HStack>
      ) : null}
      {exactAlarms.access === 'denied' ? (
        <Pressable
          onPress={() => void exactAlarms.request()}
          accessibilityRole="button"
          accessibilityLabel={t('unit_status.timer_exact_alarms_allow')}
          accessibilityHint={t('unit_status.timer_exact_alarms_hint')}
          testID={`${testID}-exact-alarms`}
        >
          <HStack space="xs" className="items-center">
            <View>
              <AlarmClock size={12} color="#6b7280" />
            </View>
            <Text className="flex-1 text-xs text-typography-700">{t('unit_status.timer_exact_alarms_hint')}</Text>
            <Text className="text-xs font-semibold text-info-600">{t('unit_status.timer_exact_alarms_allow')}</Text>
          </HStack>
        </Pressable>
      ) : null}
    </VStack>
  );
};

const styles = StyleSheet.create({
  edge: { borderLeftWidth: 4 },
});
