import { isOverdueOrWarning, selectActiveCalls, selectSevereAlerts, useCallsStore, useCheckInTimersStore, useWeatherAlertsStore } from '@resgrid/data';
import { isCurrentUserOnCall, useCallAssignmentContext } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import type { CheckInTimerStatusResultData } from '@resgrid/models';
import { Card, HStack, Pressable, Text, VStack } from '@resgrid/ui';
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';

export interface SummaryStatsRowProps {
  /** The call the member is working (its timers count when the global count is not in yet). */
  activeCallId?: string | null;
  onPressActiveCalls?: () => void;
  onPressCallsImOn?: () => void;
  onPressWeatherAlerts?: () => void;
  onPressCheckIns?: () => void;
  testID?: string;
}

interface StatTileProps {
  label: string;
  value: number;
  accentClassName: string;
  /** Draws attention (missed check-ins): a ring instead of Responder's pulse, so it reads the same with reduced motion. */
  isAlert?: boolean;
  onPress?: () => void;
  testID: string;
}

const StatTile: React.FC<StatTileProps> = ({ label, value, accentClassName, isAlert = false, onPress, testID }) => {
  const tile = (
    <Card className={`rounded-2xl border-0 p-2 ${accentClassName}`} style={isAlert ? styles.alert : undefined} testID={testID}>
      <VStack space="xs" className="items-center">
        <Text className="text-lg font-bold text-typography-0" testID={`${testID}-value`}>
          {String(value)}
        </Text>
        <Text className="text-center text-2xs font-semibold uppercase text-typography-0" numberOfLines={1}>
          {label}
        </Text>
      </VStack>
    </Card>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={styles.tile} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} testID={`${testID}-press`}>
      {tile}
    </Pressable>
  ) : (
    <VStack style={styles.tile} accessibilityLabel={`${label}: ${value}`}>
      {tile}
    </VStack>
  );
};

const EMPTY: readonly CheckInTimerStatusResultData[] = [];

/**
 * The member home's summary row (Responder): open calls, calls the member is dispatched on (personnel, group, role or a
 * unit they ride), active severe weather alerts and overdue/warning check-in timers across the open calls.
 */
export const SummaryStatsRow: React.FC<SummaryStatsRowProps> = ({ activeCallId, onPressActiveCalls, onPressCallsImOn, onPressWeatherAlerts, onPressCheckIns, testID = 'summary-stats-row' }) => {
  const { t } = useTranslation();
  const calls = useCallsStore((state) => state.calls);
  const callExtrasById = useCallsStore((state) => state.callExtrasById);
  const callDispatches = useCallsStore((state) => state.callDispatches);
  const alerts = useWeatherAlertsStore((state) => state.alerts);
  const globalOverdueCount = useCheckInTimersStore((state) => state.globalOverdueCount);
  const activeCallTimers = useCheckInTimersStore((state) => (activeCallId ? (state.statusesByCall[activeCallId] ?? EMPTY) : EMPTY));
  const assignment = useCallAssignmentContext();

  const activeCalls = useMemo(() => selectActiveCalls({ calls }), [calls]);
  const callsImOn = useMemo(
    () =>
      activeCalls.filter((call) => {
        const dispatches = callExtrasById[call.CallId]?.Dispatches ?? callDispatches[call.CallId];
        return isCurrentUserOnCall(dispatches ? { Dispatches: dispatches } : null, assignment);
      }).length,
    [activeCalls, assignment, callDispatches, callExtrasById]
  );
  const severeAlerts = useMemo(() => selectSevereAlerts({ alerts }).length, [alerts]);
  // The aggregate across every open call when it is in; otherwise the active call's own timers.
  const missedCheckIns = globalOverdueCount > 0 ? globalOverdueCount : activeCallTimers.filter(isOverdueOrWarning).length;

  return (
    <HStack space="xs" testID={testID}>
      <StatTile label={t('home.summary.active_calls')} value={activeCalls.length} accentClassName="bg-info-600" onPress={onPressActiveCalls} testID="summary-active-calls" />
      <StatTile label={t('home.summary.calls_im_on')} value={callsImOn} accentClassName="bg-success-600" onPress={onPressCallsImOn} testID="summary-calls-im-on" />
      <StatTile label={t('home.summary.active_severe_weather_alerts')} value={severeAlerts} accentClassName="bg-warning-600" onPress={onPressWeatherAlerts} testID="summary-weather-alerts" />
      <StatTile
        label={t('home.summary.pending_missed_checkins')}
        value={missedCheckIns}
        accentClassName={missedCheckIns > 0 ? 'bg-error-600' : 'bg-secondary-800'}
        isAlert={missedCheckIns > 0}
        onPress={onPressCheckIns}
        testID="summary-checkins"
      />
    </HStack>
  );
};

const styles = StyleSheet.create({
  tile: { flex: 1 },
  alert: { borderWidth: 2, borderColor: '#fda4af' },
});
