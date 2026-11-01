import { useCapability } from '@resgrid/config';
import { selectActiveCalls, useCallsStore, useCheckInTimersStore, usePersonnelStatusStore, usePersonnelStore, useUnitRolesStore, useWeatherAlertsStore } from '@resgrid/data';
import { DueChecksCard as ChecklistsDueChecksCard } from '@resgrid/features/checklists';
import { StaffingButtons, UserStaffingCard } from '@resgrid/features/staffing';
import { PersonnelStatusSheet, type StatusPickerTab, useStatusContext } from '@resgrid/features/status';
import { WeatherAlertBanner, weatherAlertsRoutes } from '@resgrid/features/weather-alerts';
import type { CheckInTimerStatusResultData, StatusesResultData } from '@resgrid/models';
import { useRealtimeEvent } from '@resgrid/realtime';
import { HStack, RefreshControl, ScrollView, SharedTabs, type TabItem, VStack } from '@resgrid/ui';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActiveCallTab } from '../components/active-call-tab';
import { HomeStatusButtons } from '../components/home-status-buttons';
import { SummaryStatsRow } from '../components/summary-stats-row';
import { UserStatusCard } from '../components/user-status-card';
import { useMemberHomeHookPoints } from '../hook-points';
import { memberHomeRoutes } from '../routes';

export interface MemberHomeScreenProps {
  /** Replaces the due-checks card (default: a registered `DueChecksCard`, else the checklists module's card). */
  dueChecks?: React.ReactNode;
  /** Clears the active call; without it the Call tab offers no clear button. */
  onClearActiveCall?: () => void;
}

interface SheetState {
  isOpen: boolean;
  tab: StatusPickerTab;
  statusId: number | string | null;
  held: boolean;
}

const CLOSED_SHEET: SheetState = { isOpen: false, tab: 'status', statusId: null, held: false };
const EMPTY_TIMERS: readonly CheckInTimerStatusResultData[] = [];

/**
 * Responder's member home (plan §7.11 `member-home`): due checks, the severe-weather banner, the member's own status
 * and staffing, the summary row, and nested tabs — Status buttons, Staffing buttons (`capabilities.status.staffing`)
 * and the active call with its check-in timers. Status and staffing open the one StatusPicker (PersonnelStatusSheet);
 * every write goes through the outbox, and id-only realtime pings refetch bypassing caches.
 */
export default function MemberHomeScreen({ dueChecks, onClearActiveCall }: MemberHomeScreenProps) {
  const statusCapability = useCapability('status');
  const { holdToConfirm, activeCallId } = useStatusContext();
  const { DueChecksCard } = useMemberHomeHookPoints();
  const calls = useCallsStore((state) => state.calls);
  const hasActiveCall = useCallsStore((state) => (activeCallId ? state.calls.some((call) => call.CallId === activeCallId) : false));
  const activeCallTimers = useCheckInTimersStore((state) => (activeCallId ? (state.statusesByCall[activeCallId] ?? EMPTY_TIMERS) : EMPTY_TIMERS));
  const [sheet, setSheet] = useState<SheetState>(CLOSED_SHEET);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (bypassCache: boolean) => {
    const personnel = usePersonnelStore.getState();
    const own = usePersonnelStatusStore.getState();
    const tasks: Promise<void>[] = [
      personnel.fetchPersonnel({ bypassCache }),
      own.fetchCurrentStatus({ bypassCache }),
      own.fetchCurrentStaffing({ bypassCache }),
      useCallsStore.getState().fetchCalls({ bypassCache }),
      useWeatherAlertsStore.getState().fetchActiveAlerts({ bypassCache }),
      // Unit seats decide which unit dispatches count as "calls I'm on".
      useUnitRolesStore.getState().fetchRoles({ bypassCache }),
    ];
    if (bypassCache || personnel.statusOptions.length === 0 || personnel.staffingOptions.length === 0) tasks.push(personnel.fetchStatusOptions({ bypassCache }));
    await Promise.allSettled(tasks);
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  // The open calls drive the missed check-ins count and the dispatches behind "calls I'm on".
  const openCalls = useMemo(() => selectActiveCalls({ calls }), [calls]);
  const openCallsKey = openCalls.map((call) => `${call.CallId}:${call.CheckInTimersEnabled ? 1 : 0}`).join(',');
  const refreshCallSummaries = useCallback(() => {
    const open = selectActiveCalls(useCallsStore.getState());
    if (open.length === 0) return;
    void useCheckInTimersStore.getState().fetchGlobalOverdueCount(open);
    void useCallsStore.getState().fetchCallDispatches(open.map((call) => call.CallId));
  }, []);
  useEffect(() => {
    refreshCallSummaries();
    // Keyed on the open calls (ids and timer flags), not the array identity: every refetch builds a new array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCallsKey]);
  // Read on focus through getState: depending on the calls array would re-run on every refetch while focused.
  useFocusEffect(refreshCallSummaries);

  const refreshOwn = useCallback(() => {
    const own = usePersonnelStatusStore.getState();
    void own.fetchCurrentStatus({ bypassCache: true });
    void own.fetchCurrentStaffing({ bypassCache: true });
    void usePersonnelStore.getState().fetchPersonnel({ bypassCache: true });
  }, []);
  useRealtimeEvent('personnelStatusUpdated', refreshOwn);
  useRealtimeEvent('personnelStaffingUpdated', refreshOwn);
  useRealtimeEvent('callsUpdated', () => void useCallsStore.getState().fetchCalls({ bypassCache: true }));

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await load(true);
    } finally {
      setIsRefreshing(false);
    }
  }, [load]);

  const openSheet = useCallback((tab: StatusPickerTab, statusId: number | string | null = null, held = false) => setSheet({ isOpen: true, tab, statusId, held }), []);
  const closeSheet = useCallback(() => setSheet(CLOSED_SHEET), []);
  const handleSelectStatus = useCallback((status: StatusesResultData, held: boolean) => openSheet('status', status.Id, held), [openSheet]);

  const overdueOnActiveCall = useMemo(() => activeCallTimers.filter((timer) => timer.Status === 'Overdue').length, [activeCallTimers]);
  const tabs = useMemo<TabItem[]>(() => {
    const items: TabItem[] = [{ key: 'status', title: 'home.tabs.status', content: <HomeStatusButtons holdToConfirm={holdToConfirm} onSelectStatus={handleSelectStatus} /> }];
    if (statusCapability.staffing) items.push({ key: 'staffing', title: 'home.tabs.staffing', content: <StaffingButtons /> });
    if (activeCallId && hasActiveCall) {
      items.push({
        key: 'call',
        title: 'home.tabs.call',
        badge: overdueOnActiveCall > 0 ? overdueOnActiveCall : undefined,
        content: <ActiveCallTab callId={activeCallId} onClearActiveCall={onClearActiveCall} />,
      });
    }
    return items;
  }, [activeCallId, handleSelectStatus, hasActiveCall, holdToConfirm, onClearActiveCall, overdueOnActiveCall, statusCapability.staffing]);

  // The checklists card renders nothing unless the department has Checklists.System.
  const DueChecks = DueChecksCard ?? ChecklistsDueChecksCard;
  const dueChecksContent = dueChecks ?? <DueChecks />;

  return (
    <View style={styles.root} className="bg-background-50" testID="member-home-screen">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />} testID="member-home-scroll">
        <VStack className="w-full max-w-3xl self-center">
          <View testID="member-home-due-checks">{dueChecksContent}</View>
          <WeatherAlertBanner />

          <HStack space="md" className="p-4">
            <View style={styles.half}>
              <UserStatusCard onPress={() => openSheet('status')} />
            </View>
            {statusCapability.staffing ? (
              <View style={styles.half}>
                <UserStaffingCard onPress={() => openSheet('staffing')} />
              </View>
            ) : null}
          </HStack>

          <VStack className="px-4 pb-4">
            <SummaryStatsRow
              activeCallId={activeCallId}
              onPressActiveCalls={() => router.push(memberHomeRoutes.calls())}
              onPressCallsImOn={() => router.push(memberHomeRoutes.calls('mine'))}
              onPressWeatherAlerts={() => router.push(weatherAlertsRoutes.list())}
            />
          </VStack>

          <VStack className="px-4 pb-4">
            <SharedTabs tabs={tabs} variant="segmented" size="md" scrollable={false} />
          </VStack>
        </VStack>
      </ScrollView>

      <PersonnelStatusSheet isOpen={sheet.isOpen} onClose={closeSheet} initialTab={sheet.tab} initialStatusId={sheet.statusId} initialHoldConfirmed={sheet.held} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  half: { flex: 1 },
});
