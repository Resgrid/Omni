import { summarizeUnitAlerts, useUnitAlerts } from '@resgrid/features/unit-status-alerts';
import { useTranslation } from '@resgrid/i18n';
import { contentOnFill, HStack, Pressable, Text, useResolvedColorScheme, useThemeColors, VStack } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import { AlertTriangle, CalendarClock, Clock, CloudLightning, Phone, Timer, Truck, User, Users } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ConsoleStats } from '../lib/console-stats';

/** A tile's colour on a light and a dark surface: the icon square and value, and the tile's wash behind them. */
interface TileTone {
  color: string;
  darkColor: string;
  background: string;
  darkBackground: string;
}

// Dispatch's stats bar colours (Tailwind 500/400 for the mark). As on Dispatch, the call and unit tiles keep a pastel
// wash in dark mode too (its dark-mode 950 tokens), while the personnel and weather tiles turn deep indigo and purple.
const TONES = {
  active: { color: '#ef4444', darkColor: '#f87171', background: '#fef2f2', darkBackground: '#fee9e9' },
  pending: { color: '#f59e0b', darkColor: '#fbbf24', background: '#fffbeb', darkBackground: '#fffdfb' },
  scheduled: { color: '#0ea5e9', darkColor: '#38bdf8', background: '#f0f9ff', darkBackground: '#ecf8fe' },
  units: { color: '#22c55e', darkColor: '#4ade80', background: '#f0fdf4', darkBackground: '#e4fff4' },
  personnel: { color: '#6366f1', darkColor: '#818cf8', background: '#f8f9ff', darkBackground: '#1e1b4b' },
  onDuty: { color: '#8b5cf6', darkColor: '#a78bfa', background: '#faf8ff', darkBackground: '#2e1065' },
  weather: { color: '#7b1fa2', darkColor: '#ba68c8', background: '#f3e5f5', darkBackground: '#4a148c' },
} satisfies Record<string, TileTone>;

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  tone: TileTone;
  onPress?: () => void;
  testID: string;
}

// Labels on a pastel wash stay dark and on a deep one light, whatever the scheme, so every tile reads.
const LABEL_ON_LIGHT = '#4b5563';
const LABEL_ON_DARK = '#d1d5db';

const StatTile: React.FC<StatTileProps> = React.memo(({ icon: Icon, label, value, tone, onPress, testID }) => {
  const isDark = useResolvedColorScheme() === 'dark';
  const background = isDark ? tone.darkBackground : tone.background;
  const isLightWash = contentOnFill(background) !== '#ffffff';
  const color = isLightWash ? tone.color : tone.darkColor;

  const content = (
    <HStack space="sm" className="flex-1 items-center rounded-lg p-2" style={{ backgroundColor: background }}>
      <View style={StyleSheet.flatten([styles.icon, { backgroundColor: color }])}>
        <Icon size={16} color="#ffffff" />
      </View>
      <VStack className="flex-1">
        <Text className="text-lg font-bold" style={{ color }} testID={`${testID}-value`}>
          {value}
        </Text>
        <Text className="text-xs" style={{ color: isLightWash ? LABEL_ON_LIGHT : LABEL_ON_DARK }} numberOfLines={1}>
          {label}
        </Text>
      </VStack>
    </HStack>
  );

  // Only the queue, timer and weather tiles open something; the others are plain tiles (a disabled Pressable is drawn dimmed).
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={styles.tile} testID={testID}>
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={styles.tile} testID={testID}>
      {content}
    </View>
  );
});

StatTile.displayName = 'StatTile';

/** Ticking clock in its own leaf: the one-second interval re-renders only this text (not every tile). */
const LiveClock: React.FC = React.memo(() => {
  const format = () => new Date().toLocaleTimeString(undefined, { hour12: false });
  const [time, setTime] = useState(format);

  useEffect(() => {
    const timer = setInterval(() => setTime(format()), 1000);

    return () => clearInterval(timer);
  }, []);

  return <Text className="text-sm font-bold text-typography-800">{time}</Text>;
});

LiveClock.displayName = 'LiveClock';

/**
 * Units over their status timer that nobody has acknowledged yet, in the alert's red (amber while only warnings): the
 * dispatcher's cue to contact them. Its own leaf, since the timers re-evaluate on a tick. Hidden while there are none.
 */
const UnitTimersTile: React.FC<{ onPress?: () => void }> = React.memo(({ onPress }) => {
  const { t } = useTranslation();
  const { annotated } = useUnitAlerts();
  const summary = useMemo(() => summarizeUnitAlerts(annotated), [annotated]);

  if (summary.unacknowledged === 0) return null;

  return (
    <StatTile
      icon={Timer}
      label={t('dispatch_console.unit_timers')}
      value={summary.unacknowledged}
      tone={summary.worstUnacknowledged === 'alert' ? TONES.active : TONES.pending}
      onPress={onPress}
      testID={`stat-unit-timers-${summary.worstUnacknowledged}`}
    />
  );
});

UnitTimersTile.displayName = 'UnitTimersTile';

export interface StatsHeaderProps {
  stats: ConsoleStats;
  /** Calls saved as Pending, from the pending queue. */
  pendingCalls: number;
  extremeAlerts: number;
  severeAlerts: number;
  onPendingCallsPress?: () => void;
  onScheduledCallsPress?: () => void;
  onWeatherAlertsPress?: () => void;
  /** Opens the units over their status timers (the console's Unit timers tab). */
  onUnitTimersPress?: () => void;
  /** Off in tests (the clock ticks every second). */
  showClock?: boolean;
}

/**
 * The console's stats bar (Dispatch baseline): active, pending and scheduled calls, available units and personnel,
 * personnel on duty, units over their status timers, extreme/severe weather alerts and a clock, each tile washed in its
 * own colour. The queue, timer and weather tiles open their screens or tab.
 */
export const StatsHeader: React.FC<StatsHeaderProps> = ({ stats, pendingCalls, extremeAlerts, severeAlerts, onPendingCallsPress, onScheduledCallsPress, onWeatherAlertsPress, onUnitTimersPress, showClock = true }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <View className="border-b border-outline-200 bg-background-0 p-1" testID="console-stats-header">
      <HStack className="flex-wrap items-stretch">
        <StatTile icon={AlertTriangle} label={t('dispatch.active_calls')} value={stats.activeCalls} tone={TONES.active} testID="stat-active-calls" />
        <StatTile icon={Phone} label={t('pending_calls.title')} value={pendingCalls} tone={TONES.pending} onPress={onPendingCallsPress} testID="stat-pending-calls" />
        <StatTile icon={CalendarClock} label={t('scheduled_calls.title')} value={stats.scheduledCalls} tone={TONES.scheduled} onPress={onScheduledCallsPress} testID="stat-scheduled-calls" />
        <StatTile icon={Truck} label={t('dispatch_console.units_available')} value={stats.unitsAvailable} tone={TONES.units} testID="stat-units-available" />
        <StatTile icon={User} label={t('dispatch_console.personnel_available')} value={stats.personnelAvailable} tone={TONES.personnel} testID="stat-personnel-available" />
        <StatTile icon={Users} label={t('dispatch_console.personnel_on_duty')} value={stats.personnelOnDuty} tone={TONES.onDuty} testID="stat-personnel-on-duty" />
        <UnitTimersTile onPress={onUnitTimersPress} />
        {extremeAlerts + severeAlerts > 0 ? (
          <StatTile icon={CloudLightning} label={t('dispatch_console.weather_alerts')} value={`${extremeAlerts} / ${severeAlerts}`} tone={TONES.weather} onPress={onWeatherAlertsPress} testID="stat-weather-alerts" />
        ) : null}
        {showClock ? (
          <HStack space="xs" className="items-center justify-center rounded-lg bg-background-50 px-4 py-2" style={styles.tile} testID="stat-clock">
            <View>
              <Clock size={14} color={colors.textMuted} />
            </View>
            <LiveClock />
          </HStack>
        ) : null}
      </HStack>
    </View>
  );
};

const styles = StyleSheet.create({
  tile: { flexGrow: 1, flexBasis: 120, margin: 4, minWidth: 120 },
  icon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
