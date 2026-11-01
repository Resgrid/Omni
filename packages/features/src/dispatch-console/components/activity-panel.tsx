import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useCheckInTimersStore, useWeatherAlertsStore } from '@resgrid/data';
import { checkInSeverity, CheckInTab, CheckInTimerCard } from '@resgrid/features/check-in';
import { ResponseCodeChip } from '@resgrid/features/runcards';
import { WeatherAlertCard, weatherAlertsRoutes } from '@resgrid/features/weather-alerts';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData, CheckInTimerStatusResultData, DispatchedEventResultData, WeatherAlertResultData } from '@resgrid/models';
import { FlatList, HStack, Pressable, Text, VStack } from '@resgrid/ui';
import { type Href, useRouter } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { AlertTriangle, CloudLightning, Info, Mic, Radio, ShieldCheck, Truck, User, Zap } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useConsoleStore } from '../hooks/use-console-store';
import type { ActivityLogEntry, ConsoleTab, RadioLogEntry } from '../lib/console-types';
import { ActionsPanel, type ConsoleActionHandlers } from './actions-panel';
import { PanelFrame } from './panel-frame';

export interface ActivityPanelProps extends ConsoleActionHandlers {
  selectedCall: CallResultData | null;
  /** The filtered call's timeline (status changes tied to it) from the call detail. */
  callActivity: readonly DispatchedEventResultData[];
  flex?: number;
  maxHeight?: number;
}

const TYPE_STYLES: Record<ActivityLogEntry['type'], { icon: LucideIcon; color: string }> = {
  call: { icon: AlertTriangle, color: '#ef4444' },
  unit: { icon: Truck, color: '#3b82f6' },
  personnel: { icon: User, color: '#8b5cf6' },
  system: { icon: Info, color: '#6b7280' },
};

const formatClock = (at: number): string => new Date(at).toLocaleTimeString(undefined, { hour12: false });

const formatDuration = (seconds: number | null): string => (seconds === null ? '…' : seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`);

const ActivityRow: React.FC<{ entry: ActivityLogEntry }> = React.memo(({ entry }) => {
  const { icon: Icon, color } = TYPE_STYLES[entry.type];
  return (
    <HStack space="sm" className="mb-2 items-start border-b border-outline-100 pb-2">
      <View style={StyleSheet.flatten([styles.icon, { backgroundColor: `${color}22` }])}>
        <Icon size={12} color={color} />
      </View>
      <VStack className="flex-1">
        <HStack className="items-center justify-between">
          <Text className="flex-1 text-xs font-semibold" numberOfLines={1}>
            {entry.action}
          </Text>
          <Text className="text-xs text-typography-400">{formatClock(entry.timestamp)}</Text>
        </HStack>
        <Text className="text-xs text-typography-600" numberOfLines={2}>
          {entry.description}
        </Text>
      </VStack>
    </HStack>
  );
});

ActivityRow.displayName = 'ActivityRow';

const CallActivityRow: React.FC<{ event: DispatchedEventResultData }> = React.memo(({ event }) => (
  <View style={StyleSheet.flatten([styles.timelineRow, { borderLeftColor: event.StatusColor || '#3b82f6' }])}>
    <HStack space="xs" className="items-center">
      <Text className="flex-1 text-xs font-semibold" style={event.StatusColor ? { color: event.StatusColor } : undefined} numberOfLines={1}>
        {event.StatusText}
      </Text>
      <ResponseCodeChip code={event.ResponseCode} name={event.ResponseCodeName} color={event.ResponseCodeColor} />
    </HStack>
    <Text className="text-xs text-typography-600" numberOfLines={1}>
      {[event.Name, event.Group].filter(Boolean).join(' — ')}
    </Text>
    <Text className="text-xs text-typography-400">{formatUtcInDepartmentTime(event.Timestamp, null, undefined, undefined, event.Timestamp)}</Text>
    {event.Note ? <Text className="text-xs text-typography-600">{event.Note}</Text> : null}
  </View>
));

CallActivityRow.displayName = 'CallActivityRow';

const RadioRow: React.FC<{ entry: RadioLogEntry }> = React.memo(({ entry }) => {
  const { t } = useTranslation();
  return (
    <HStack space="sm" className="mb-2 items-center border-b border-outline-100 pb-2" testID={`radio-entry-${entry.id}`}>
      <View style={StyleSheet.flatten([styles.icon, { backgroundColor: entry.isActive ? '#dc262622' : '#6b728022' }])}>
        <Mic size={12} color={entry.isActive ? '#dc2626' : '#6b7280'} />
      </View>
      <VStack className="flex-1">
        <Text className="text-xs font-semibold" numberOfLines={1}>
          {entry.participantName}
        </Text>
        <Text className="text-xs text-typography-500">{entry.isActive ? t('dispatch.transmitting') : formatDuration(entry.duration)}</Text>
      </VStack>
      <Text className="text-xs text-typography-400">{formatClock(entry.startedAt)}</Text>
    </HStack>
  );
});

RadioRow.displayName = 'RadioRow';

const EmptyState: React.FC<{ icon: LucideIcon; text: string }> = ({ icon: Icon, text }) => (
  <View style={styles.empty}>
    <View>
      <Icon size={28} color="#d1d5db" />
    </View>
    <Text className="mt-2 text-center text-sm text-typography-500">{text}</Text>
  </View>
);

const NO_TIMERS: CheckInTimerStatusResultData[] = [];

/**
 * The console's tabbed activity card (Dispatch baseline ActivityLogPanel): the activity log (or the filtered call's
 * timeline), the radio log, context actions, check-ins (the filtered call's timers and PAR, else every overdue timer)
 * and the active weather alerts. Selecting a call, unit or person surfaces the actions tab.
 */
export const ActivityPanel: React.FC<ActivityPanelProps> = ({ selectedCall, callActivity, flex, maxHeight, ...handlers }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const activeTab = useConsoleStore((state) => state.activeTab);
  const activityLog = useConsoleStore((state) => state.activityLog);
  const radioLog = useConsoleStore((state) => state.radioLog);
  const statusesByCall = useCheckInTimersStore((state) => state.statusesByCall);
  const weatherAlerts = useWeatherAlertsStore((state) => state.alerts);
  const callId = selectedCall?.CallId ?? null;

  const callTimers = callId ? (statusesByCall[callId] ?? NO_TIMERS) : NO_TIMERS;
  const overdueTimers = useMemo(
    () =>
      Object.values(statusesByCall)
        .flat()
        .filter((timer) => checkInSeverity(timer.Status) === 'critical'),
    [statusesByCall]
  );
  const urgentCount = callId ? callTimers.filter((timer) => checkInSeverity(timer.Status) === 'critical').length : overdueTimers.length;
  const filteredLog = useMemo(() => (callId ? activityLog.filter((entry) => entry.metadata?.callId === callId || entry.type === 'system') : activityLog), [activityLog, callId]);
  const activeTransmissions = radioLog.filter((entry) => entry.isActive).length;

  const tabs: { key: ConsoleTab; icon: LucideIcon; label: string; badge?: number }[] = [
    { key: 'activity', icon: Zap, label: t('dispatch.activity') },
    { key: 'radio', icon: Radio, label: t('dispatch.radio_log'), badge: activeTransmissions || undefined },
    { key: 'actions', icon: Info, label: t('dispatch.actions') },
    { key: 'checkins', icon: ShieldCheck, label: t('dispatch.check_ins'), badge: urgentCount || undefined },
    { key: 'weather', icon: CloudLightning, label: t('dispatch_console.weather_alerts'), badge: weatherAlerts.length || undefined },
  ];

  const renderActivity = useCallback(({ item }: { item: ActivityLogEntry }) => <ActivityRow entry={item} />, []);
  const renderCallActivity = useCallback(({ item }: { item: DispatchedEventResultData }) => <CallActivityRow event={item} />, []);
  const renderRadio = useCallback(({ item }: { item: RadioLogEntry }) => <RadioRow entry={item} />, []);
  const renderWeather = useCallback(({ item }: { item: WeatherAlertResultData }) => <WeatherAlertCard alert={item} onPress={() => router.push(weatherAlertsRoutes.detail(item.WeatherAlertId) as Href)} />, [router]);

  const renderContent = () => {
    switch (activeTab) {
      case 'radio':
        return radioLog.length === 0 ? (
          <EmptyState icon={Radio} text={t('dispatch.no_radio_activity')} />
        ) : (
          <FlatList testID="console-radio-log" data={radioLog} renderItem={renderRadio} keyExtractor={(item: RadioLogEntry) => item.id} contentContainerStyle={styles.list} />
        );
      case 'actions':
        return <ActionsPanel selectedCall={selectedCall} {...handlers} />;
      case 'checkins':
        if (selectedCall) return <CheckInTab callId={selectedCall.CallId} timersEnabled={selectedCall.CheckInTimersEnabled} pollMs={30000} />;
        return overdueTimers.length === 0 ? (
          <EmptyState icon={ShieldCheck} text={t('dispatch_console.no_overdue_check_ins')} />
        ) : (
          <FlatList
            testID="console-overdue-timers"
            data={overdueTimers}
            renderItem={({ item }: { item: CheckInTimerStatusResultData }) => <CheckInTimerCard timer={item} showCheckInButton={false} />}
            keyExtractor={(item: CheckInTimerStatusResultData, index: number) => `${item.TargetType}-${item.TargetEntityId}-${index}`}
            contentContainerStyle={styles.list}
          />
        );
      case 'weather':
        return weatherAlerts.length === 0 ? (
          <EmptyState icon={CloudLightning} text={t('dispatch_console.no_weather_alerts')} />
        ) : (
          <FlatList testID="console-weather-alerts" data={weatherAlerts} renderItem={renderWeather} keyExtractor={(item: WeatherAlertResultData) => item.WeatherAlertId} contentContainerStyle={styles.list} />
        );
      default:
        if (callId && callActivity.length > 0) {
          return (
            <FlatList
              testID="console-call-activity"
              data={callActivity as DispatchedEventResultData[]}
              renderItem={renderCallActivity}
              keyExtractor={(item: DispatchedEventResultData, index: number) => `${item.Id || index}-${item.Timestamp}`}
              contentContainerStyle={styles.list}
            />
          );
        }
        return filteredLog.length === 0 ? (
          <EmptyState icon={Info} text={callId ? t('dispatch.no_call_activity') : t('dispatch.no_activity')} />
        ) : (
          <FlatList testID="console-activity-log" data={filteredLog} renderItem={renderActivity} keyExtractor={(item: ActivityLogEntry) => item.id} contentContainerStyle={styles.list} />
        );
    }
  };

  return (
    <PanelFrame title={callId ? t('dispatch.call_activity') : t('dispatch.activity_log')} icon={Zap} iconColor="#f97316" cardKey="activity-log" flex={flex} maxHeight={maxHeight} testID="activity-panel">
      <HStack className="flex-wrap border-b border-outline-200 px-1" testID="activity-tabs">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <Pressable
              key={tab.key}
              onPress={() => useConsoleStore.getState().setActiveTab(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
              className={`mr-1 flex-row items-center px-2 py-2 ${isActive ? 'border-b-2 border-primary-500' : ''}`}
              testID={`activity-tab-${tab.key}`}
            >
              <View>
                <Icon size={14} color={isActive ? '#4f46e5' : '#6b7280'} />
              </View>
              <Text className={`ml-1 text-xs ${isActive ? 'font-semibold text-primary-600' : 'text-typography-600'}`}>{tab.label}</Text>
              {tab.badge ? (
                <View className="ml-1 rounded-full bg-error-500 px-1.5" testID={`activity-tab-${tab.key}-badge`}>
                  <Text className="text-xs font-bold text-typography-0">{tab.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </HStack>
      <View style={styles.body}>{renderContent()}</View>
    </PanelFrame>
  );
};

const styles = StyleSheet.create({
  icon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  timelineRow: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 8 },
  list: { padding: 8 },
  empty: { padding: 24, alignItems: 'center' },
  body: { flex: 1, minHeight: 160 },
});
