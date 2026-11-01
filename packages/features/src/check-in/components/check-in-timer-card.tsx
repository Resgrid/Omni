import { parseUtcMs } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import type { CheckInTimerStatusResultData } from '@resgrid/models';
import { Button, ButtonText, Text } from '@resgrid/ui';
import { Timer } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CHECK_IN_SEVERITY_COLORS, CHECK_IN_STATUS_LABEL_KEYS, checkInSeverity, timerProgress } from '../lib/check-in-status';
import { checkInTimerTitle } from '../lib/check-in-target';

export interface CheckInTimerCardProps {
  timer: CheckInTimerStatusResultData;
  onCheckIn?: (timer: CheckInTimerStatusResultData) => void;
  /** Hidden when this device may not check in against the timer (capability + identity). */
  showCheckInButton?: boolean;
  /** A check-in for this timer is queued on the device (offline). */
  isQueued?: boolean;
  /** Re-render interval for the local elapsed count between polls (ms). */
  tickMs?: number;
  testID?: string;
}

/**
 * One check-in timer (Unit baseline card): target, status pill, progress through the window, minutes since the last
 * check-in, and the check-in action. Elapsed time ticks locally between polls.
 */
export const CheckInTimerCard: React.FC<CheckInTimerCardProps> = ({ timer, onCheckIn, showCheckInButton = true, isQueued = false, tickMs = 15000, testID }) => {
  const { t } = useTranslation();
  const receivedAt = useRef(Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    receivedAt.current = Date.now();
    setNow(Date.now());
  }, [timer.ElapsedMinutes]);

  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(handle);
  }, [tickMs]);

  const severity = checkInSeverity(timer.Status);
  const color = CHECK_IN_SEVERITY_COLORS[severity];
  const statusKey = CHECK_IN_STATUS_LABEL_KEYS[timer.Status];
  const statusLabel = statusKey ? t(statusKey) : timer.Status || t('common.unknown');
  const elapsed = timer.ElapsedMinutes + Math.max(0, now - receivedAt.current) / 60000;
  const progress = timerProgress(timer, elapsed);
  const lastCheckInMs = parseUtcMs(timer.LastCheckIn);
  const minutesSince = lastCheckInMs === null ? null : Math.max(0, Math.floor((now - lastCheckInMs) / 60000));
  const title = checkInTimerTitle(timer) || t('check_in.unnamed_target');
  const cardTestId = testID ?? `check-in-timer-${timer.TargetType}-${timer.TargetEntityId || timer.UnitId || 'all'}`;

  return (
    <View style={styles.card} className="border-outline-100 bg-background-0" testID={cardTestId} accessible={false}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.icon}>
            <Timer size={20} color={color} />
          </View>
          <View style={styles.titleBlock}>
            <Text className="font-semibold text-typography-900">{title}</Text>
            <Text size="xs" className="text-typography-500">
              {timer.TargetTypeName}
            </Text>
          </View>
        </View>
        <View style={StyleSheet.flatten([styles.pill, { backgroundColor: `${color}22` }])} accessible accessibilityLabel={`${t('check_in.timer_status')}: ${statusLabel}`} testID={`${cardTestId}-status`}>
          <Text size="xs" style={StyleSheet.flatten([styles.pillText, { color }])}>
            {statusLabel}
          </Text>
        </View>
      </View>

      <View style={styles.track} accessible accessibilityRole="progressbar" accessibilityLabel={t('check_in.elapsed')} accessibilityValue={{ min: 0, max: timer.DurationMinutes || 0, now: Math.floor(elapsed) }}>
        <View style={StyleSheet.flatten([styles.fill, { width: `${progress * 100}%`, backgroundColor: color }])} />
      </View>

      <View style={styles.footer}>
        <Text size="xs" className="text-typography-500">
          {minutesSince === null ? `${t('check_in.last_check_in')}: —` : `${t('check_in.last_check_in')}: ${minutesSince} ${t('check_in.minutes_ago')}`}
        </Text>
        <Text size="xs" className="text-typography-500">
          {`${Math.floor(elapsed)}/${timer.DurationMinutes} ${t('check_in.duration')}`}
        </Text>
      </View>

      {isQueued ? (
        <Text size="xs" className="mt-1 font-semibold text-warning-700" testID={`${cardTestId}-queued`}>
          {t('check_in.queued_offline')}
        </Text>
      ) : null}

      {showCheckInButton && onCheckIn ? (
        <Button size="sm" className="mt-2" onPress={() => onCheckIn(timer)} accessibilityLabel={`${t('check_in.perform_check_in')}: ${title}`} testID={`${cardTestId}-button`}>
          <ButtonText>{t('check_in.perform_check_in')}</ButtonText>
        </Button>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  icon: { marginRight: 8 },
  titleBlock: { flex: 1 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontWeight: '600' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#E5E7EB', overflow: 'hidden', marginTop: 8 },
  fill: { height: '100%', minWidth: 4, borderRadius: 4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
});
