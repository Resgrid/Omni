import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useCheckInTimersStore, useWeatherAlertsStore } from '@resgrid/data';
import { checkInSeverity, CheckInTab, CheckInTimerCard } from '@resgrid/features/check-in';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { ResponseCodeChip } from '@resgrid/features/runcards';
import { summarizeUnitAlerts, UnitAlertList, useUnitAlerts } from '@resgrid/features/unit-status-alerts';
import { WeatherAlertCard, weatherAlertsRoutes } from '@resgrid/features/weather-alerts';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData, CheckInTimerStatusResultData, DispatchedEventResultData, WeatherAlertResultData } from '@resgrid/models';
import { FlatList, HStack, Pressable, Text, useReadableColor, useThemeColors, VStack } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { AlertTriangle, CloudLightning, Info, Mic, Radio, ShieldCheck, Timer, Truck, User, Zap } from 'lucide-react-native';
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
          <Text className="flex-1 text-xs font-semibold text-typography-800" numberOfLines={1}>
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

const CallActivityRow: React.FC<{ event: DispatchedEventResultData }> = React.memo(({ event }) => {
  const readable = useReadableColor();
  const timeZone = useDepartmentTimeZone();

  return (
    <View style={StyleSheet.flatten([styles.timelineRow, { borderLeftColor: readable.mark(event.StatusColor, '#3b82f6') }])}>
      <HStack space="xs" className="items-center">
        <Text className="flex-1 text-xs font-semibold text-typography-800" style={event.StatusColor ? { color: readable.text(event.StatusColor) } : undefined} numberOfLines={1}>
          {event.StatusText}
        </Text>
        <ResponseCodeChip code={event.ResponseCode} name={event.ResponseCodeName} color={event.ResponseCodeColor} />
      </HStack>
      <Text className="text-xs text-typography-600" numberOfLines={1}>
        {[event.Name, event.Group].filter(Boolean).join(' — ')}
      </Text>
      <Text className="text-xs text-typography-400">{formatUtcInDepartmentTime(event.Timestamp, timeZone, undefined, undefined, event.Timestamp)}</Text>
      {event.Note ? <Text className="text-xs text-typography-600">{event.Note}</Text> : null}
    </View>
  );
});

CallActivityRow.displayName = 'CallActivityRow';

const RadioRow: React.FC<{ entry: RadioLogEntry }> = React.memo(({ entry }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const color = entry.isActive ? '#dc2626' : colors.token('typography-500');

  return (
    <HStack space="sm" className="mb-2 items-center border-b border-outline-100 pb-2" testID={`radio-entry-${entry.id}`}>
      <View style={StyleSheet.flatten([styles.icon, { backgroundColor: entry.isActive ? '#dc262622' : '#6b728022' }])}>
        <Mic size={12} color={color} />
      </View>
      <VStack className="flex-1">
        <Text className="text-xs font-semibold text-typography-800" numberOfLines={1}>
          {entry.participantName}
        </Text>
        <Text className="text-xs text-typography-500">{entry.isActive ? t('dispatch.transmitting') : formatDuration(entry.duration)}</Text>
      </VStack>
      <Text className="text-xs text-typography-400">{formatClock(entry.startedAt)}</Text>
    </HStack>
  );
});

RadioRow.displayName = 'RadioRow';

const EmptyState: React.FC<{ icon: LucideIcon; text: string }> = ({ icon: Icon, text }) => {
  const colors = useThemeColors();

  return (
    <View style={styles.empty}>
      <View>
        <Icon size={28} color={colors.token('typography-300')} />
      </View>
      <Text className="mt-2 text-center text-sm text-typography-500">{text}</Text>
    </View>
  );
};

const NO_TIMERS: CheckInTimerStatusResultData[] = [];

/**
 * The console's tabbed activity card (Dispatch baseline ActivityLogPanel): the activity log (or the filtered call's
 * timeline), the radio log, context actions, check-ins (the filtered call's timers and PAR, else every overdue timer),
 * the units over their status timers (acknowledge or mute each once contacted) and the active weather alerts. Selecting
 * a call, unit or person surfaces the actions tab.
 */
export const ActivityPanel: React.FC<ActivityPanelProps> = ({ selectedCall, callActivity, flex, maxHeight, ...handlers }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const activeTab = useConsoleStore((state) => state.activeTab);
  const activityLog = useConsoleStore((state) => state.activityLog);
  const radioLog = useConsoleStore((state) => state.radioLog);
  const statusesByCall = useCheckInTimersStore((state) => state.statusesByCall);
  const weatherAlerts = useWeatherAlertsStore((state) => state.alerts);
  const { annotated } = useUnitAlerts();
  const unitTimers = useMemo(() => summarizeUnitAlerts(annotated), [annotated]);
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
  // The tab shows the filtered call's timeline when it has one, else the (filtered) activity log.
  const activityCount = callId && callActivity.length > 0 ? callActivity.length : filteredLog.length;

  // Dispatch's tab counts; an overdue check-in, a unit nobody has contacted about its status timer or a live transmission
  // is urgent and stays red whichever tab is open.
  const tabs: { key: ConsoleTab; icon: LucideIcon; label: string; badge?: number; urgent?: boolean }[] = [
    { key: 'activity', icon: Zap, label: t('dispatch.activity'), badge: activityCount || undefined },
    { key: 'radio', icon: Radio, label: t('dispatch.radio_log'), badge: activeTransmissions || undefined, urgent: true },
    { key: 'actions', icon: Info, label: t('dispatch.actions') },
    { key: 'checkins', icon: ShieldCheck, label: t('dispatch.check_ins'), badge: urgentCount || undefined, urgent: true },
    { key: 'unit-timers', icon: Timer, label: t('dispatch_console.unit_timers'), badge: unitTimers.unacknowledged || undefined, urgent: true },
    { key: 'weather', icon: CloudLightning, label: t('dispatch_console.weather_alerts'), badge: weatherAlerts.length || undefined },
  ];

  const renderActivity = useCallback(({ item }: { item: ActivityLogEntry }) => <ActivityRow entry={item} />, []);
  const renderCallActivity = useCallback(({ item }: { item: DispatchedEventResultData }) => <CallActivityRow event={item} />, []);
  const renderRadio = useCallback(({ item }: { item: RadioLogEntry }) => <RadioRow entry={item} />, []);
  const renderWeather = useCallback(({ item }: { item: WeatherAlertResultData }) => <WeatherAlertCard alert={item} onPress={() => pushRoutePath(router, weatherAlertsRoutes.detail(item.WeatherAlertId))} />, [router]);

  const renderContent = () => {
    switch (activeTab) {
      case 'radio':
        return radioLog.length === 0 ? (
          <EmptyState icon={Radio} text={t('dispatch.no_radio_activity')} />
        ) : (
          <FlatList nestedScrollEnabled testID="console-radio-log" data={radioLog} renderItem={renderRadio} keyExtractor={(item: RadioLogEntry) => item.id} contentContainerStyle={styles.list} />
        );
      case 'actions':
        return <ActionsPanel selectedCall={selectedCall} {...handlers} />;
      case 'checkins':
        if (selectedCall) return <CheckInTab callId={selectedCall.CallId} timersEnabled={selectedCall.CheckInTimersEnabled} pollMs={30000} />;

        return overdueTimers.length === 0 ? (
          <EmptyState icon={ShieldCheck} text={t('dispatch_console.no_overdue_check_ins')} />
        ) : (
          <FlatList
            nestedScrollEnabled
            testID="console-overdue-timers"
            data={overdueTimers}
            renderItem={({ item }: { item: CheckInTimerStatusResultData }) => <CheckInTimerCard timer={item} showCheckInButton={false} />}
            keyExtractor={(item: CheckInTimerStatusResultData, index: number) => `${item.TargetType}-${item.TargetEntityId}-${index}`}
            contentContainerStyle={styles.list}
          />
        );
      case 'unit-timers':
        return (
          <View style={styles.timers} testID="console-unit-timers">
            <UnitAlertList onOpenUnit={handlers.onViewUnit} />
          </View>
        );
      case 'weather':
        return weatherAlerts.length === 0 ? (
          <EmptyState icon={CloudLightning} text={t('dispatch_console.no_weather_alerts')} />
        ) : (
          <FlatList
            nestedScrollEnabled
            testID="console-weather-alerts"
            data={weatherAlerts}
            renderItem={renderWeather}
            keyExtractor={(item: WeatherAlertResultData) => item.WeatherAlertId}
            contentContainerStyle={styles.list}
          />
        );
      default:
        if (callId && callActivity.length > 0) {
          return (
            <FlatList
              nestedScrollEnabled
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
          <FlatList nestedScrollEnabled testID="console-activity-log" data={filteredLog} renderItem={renderActivity} keyExtractor={(item: ActivityLogEntry) => item.id} contentContainerStyle={styles.list} />
        );
    }
  };

  return (
    <PanelFrame title={callId ? t('dispatch.call_activity') : t('dispatch.activity_log')} icon={Zap} iconColor="#f97316" cardKey="activity-log" flex={flex} maxHeight={maxHeight} testID="activity-panel">
      <HStack className="flex-wrap border-b border-outline-200 px-2" testID="activity-tabs">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          const badgeColor = tab.urgent ? '#ef4444' : isActive ? '#6366f1' : null;

          return (
            <Pressable
              key={tab.key}
              onPress={() => useConsoleStore.getState().setActiveTab(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
              style={StyleSheet.flatten([styles.tab, isActive ? styles.tabActive : null])}
              testID={`activity-tab-${tab.key}`}
            >
              <View>
                <Icon size={14} color={isActive ? colors.primaryStrong : colors.token('typography-500')} />
              </View>
              <Text className={`ml-1 text-xs font-medium ${isActive ? 'text-primary-600' : 'text-typography-500'}`}>{tab.label}</Text>
              {tab.badge ? (
                <View style={StyleSheet.flatten([styles.badge, badgeColor ? { backgroundColor: badgeColor } : null])} testID={`activity-tab-${tab.key}-badge`}>
                  <Text className={`text-xs font-bold ${badgeColor ? '' : 'text-typography-600'}`} style={badgeColor ? styles.onFill : undefined}>
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </Text>
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
  timers: { flex: 1, padding: 8 },
  // Dispatch's tabs: an indigo underline, and a grey count that turns indigo on the open tab.
  tab: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#6366f1' },
  badge: { minWidth: 18, height: 18, borderRadius: 9, marginLeft: 4, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(107, 114, 128, 0.2)' },
  onFill: { color: '#ffffff' },
  empty: { padding: 24, alignItems: 'center' },
  body: { flex: 1, minHeight: 160 },
});
