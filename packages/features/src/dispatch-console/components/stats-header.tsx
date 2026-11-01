import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text, VStack } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import { AlertTriangle, CalendarClock, Clock, CloudLightning, Hourglass, Truck, User, Users } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ConsoleStats } from '../lib/console-stats';

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: number;
  color: string;
  onPress?: () => void;
  testID: string;
}

const StatTile: React.FC<StatTileProps> = React.memo(({ icon: Icon, label, value, color, onPress, testID }) => (
  <Pressable
    onPress={onPress}
    disabled={!onPress}
    accessibilityRole={onPress ? 'button' : undefined}
    accessibilityLabel={`${label}: ${value}`}
    className="m-1 min-w-[120px] flex-1 flex-row items-center rounded-lg bg-background-50 p-2"
    testID={testID}
  >
    <View style={StyleSheet.flatten([styles.icon, { backgroundColor: color }])}>
      <Icon size={16} color="#ffffff" />
    </View>
    <VStack className="ml-2">
      <Text className="text-lg font-bold" style={{ color }} testID={`${testID}-value`}>
        {value}
      </Text>
      <Text className="text-xs text-typography-600" numberOfLines={1}>
        {label}
      </Text>
    </VStack>
  </Pressable>
));

StatTile.displayName = 'StatTile';

/** Ticking clock in its own leaf: the one-second interval re-renders only this text (not every tile). */
const LiveClock: React.FC = React.memo(() => {
  const format = () => new Date().toLocaleTimeString(undefined, { hour12: false });
  const [time, setTime] = useState(format);
  useEffect(() => {
    const timer = setInterval(() => setTime(format()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <Text className="text-sm font-bold">{time}</Text>;
});

LiveClock.displayName = 'LiveClock';

export interface StatsHeaderProps {
  stats: ConsoleStats;
  /** Calls saved as Pending, from the pending queue. */
  pendingCalls: number;
  extremeAlerts: number;
  severeAlerts: number;
  onPendingCallsPress?: () => void;
  onScheduledCallsPress?: () => void;
  onWeatherAlertsPress?: () => void;
  /** Off in tests (the clock ticks every second). */
  showClock?: boolean;
}

/**
 * The console's stats bar (Dispatch baseline): active, pending and scheduled calls, available units and personnel,
 * personnel on duty, extreme/severe weather alerts and a clock. The queue and weather tiles open their screens.
 */
export const StatsHeader: React.FC<StatsHeaderProps> = ({ stats, pendingCalls, extremeAlerts, severeAlerts, onPendingCallsPress, onScheduledCallsPress, onWeatherAlertsPress, showClock = true }) => {
  const { t } = useTranslation();
  const alertCount = extremeAlerts + severeAlerts;
  return (
    <View className="border-b border-outline-200 bg-background-0 px-1 py-1" testID="console-stats-header">
      <HStack className="flex-wrap items-center">
        <StatTile icon={AlertTriangle} label={t('dispatch.active_calls')} value={stats.activeCalls} color="#ef4444" testID="stat-active-calls" />
        <StatTile icon={Hourglass} label={t('pending_calls.title')} value={pendingCalls} color="#f97316" onPress={onPendingCallsPress} testID="stat-pending-calls" />
        <StatTile icon={CalendarClock} label={t('scheduled_calls.title')} value={stats.scheduledCalls} color="#8b5cf6" onPress={onScheduledCallsPress} testID="stat-scheduled-calls" />
        <StatTile icon={Truck} label={t('dispatch_console.units_available')} value={stats.unitsAvailable} color="#22c55e" testID="stat-units-available" />
        <StatTile icon={User} label={t('dispatch_console.personnel_available')} value={stats.personnelAvailable} color="#3b82f6" testID="stat-personnel-available" />
        <StatTile icon={Users} label={t('dispatch_console.personnel_on_duty')} value={stats.personnelOnDuty} color="#0ea5e9" testID="stat-personnel-on-duty" />
        {alertCount > 0 ? (
          <StatTile icon={CloudLightning} label={t('dispatch_console.weather_alerts')} value={alertCount} color={extremeAlerts > 0 ? '#7f1d1d' : '#dc2626'} onPress={onWeatherAlertsPress} testID="stat-weather-alerts" />
        ) : null}
        {showClock ? (
          <HStack space="xs" className="m-1 items-center px-2">
            <View>
              <Clock size={14} color="#6b7280" />
            </View>
            <LiveClock />
          </HStack>
        ) : null}
      </HStack>
    </View>
  );
};

const styles = StyleSheet.create({
  icon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
