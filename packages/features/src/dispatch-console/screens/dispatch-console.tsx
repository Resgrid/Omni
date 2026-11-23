import { useTerm } from '@resgrid/auth';
import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { personnelFullName, useCallsStore, usePersonnelStore, useUnitsStore, useWeatherAlertsStore } from '@resgrid/data';
import { callQueuesRoutes } from '@resgrid/features/call-queues';
import { callDisplayName, callDisplayText, CallNotesModal, type CallRelease, callRoutes, CloseCallSheet, isPersonReleasableFromCall, isUnitDispatchedToCall, useReleaseFromCall } from '@resgrid/features/calls';
import { personnelRoutes } from '@resgrid/features/personnel';
import { unitsRoutes } from '@resgrid/features/units';
import { weatherAlertsRoutes } from '@resgrid/features/weather-alerts';
import { useTranslation } from '@resgrid/i18n';
import { type CallResultData, WeatherAlertSeverity } from '@resgrid/models';
import { BottomAnchoredKeyboardView, TabBar, type TabBarItem, useBottomSafeAreaInset, useFormFactor } from '@resgrid/ui';
import { type Href, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ConsoleActionHandlers } from '../components/actions-panel';
import { ActiveCallFilterBanner } from '../components/active-call-filter-banner';
import { ActiveCallsPanel } from '../components/active-calls-panel';
import { ActivityPanel } from '../components/activity-panel';
import { AddNoteSheet } from '../components/add-note-sheet';
import { AddResourcesSheet } from '../components/add-resources-sheet';
import { ConsolePersonnelStatusSheet, ConsoleUnitStatusSheet } from '../components/console-status-sheets';
import { MapPanel } from '../components/map-panel';
import { NotesPanel } from '../components/notes-panel';
import { ConsolePanelPlacementContext } from '../components/panel-frame';
import { PersonnelPanel } from '../components/personnel-panel';
import { PttPanel } from '../components/ptt-panel';
import { ResourcesPanel } from '../components/resources-panel';
import { StatsHeader } from '../components/stats-header';
import { UnitTimerActivity } from '../components/unit-timer-activity';
import { UnitsPanel } from '../components/units-panel';
import { ViewToggles } from '../components/view-toggles';
import { useConsoleData } from '../hooks/use-console-data';
import { useConsoleStore } from '../hooks/use-console-store';
import { useDashboardViewStore } from '../hooks/use-dashboard-view-store';
import { useRadioLog } from '../hooks/use-radio-log';
import { useSelectedCall } from '../hooks/use-selected-call';
import { resolveConsoleLayout } from '../lib/console-layout';
import { computeConsoleStats } from '../lib/console-stats';

export interface DispatchConsoleScreenProps {
  /** Subscribe to SignalR pings (default true; off in tests). */
  realtime?: boolean;
  /** The full map route the map card expands to; null hides the button. Default `/map` (canonical). */
  mapHref?: string | null;
  /** Replaces the built-in MapLibre map card content. */
  mapSlot?: React.ReactNode;
  /** The stats bar clock (default true). */
  showClock?: boolean;
  /** "Available only" / "Single list" under the stats bar (default true); the app puts them in the app bar instead. */
  showViewToggles?: boolean;
  /** Clock for stats and ages (tests). */
  now?: () => number;
}

/**
 * The phone's console tabs: one panel at a time at full height. Units and personnel share one tab with "Single list" on.
 * Push-to-talk stays under every tab.
 */
type PhoneTab = 'calls' | 'units' | 'personnel' | 'resources' | 'map' | 'activity' | 'notes';

const PHONE_TABS_SPLIT: readonly PhoneTab[] = ['calls', 'units', 'personnel', 'map', 'activity', 'notes'];
const PHONE_TABS_SINGLE_LIST: readonly PhoneTab[] = ['calls', 'resources', 'map', 'activity', 'notes'];
const PHONE_TAB_PLACEMENT = { isTab: true } as const;

/** The console body's margin (`styles.body` padding), kept at the bottom too where there is no home indicator. */
const BODY_MARGIN = 8;

/** The tab to show from the one picked: a units or personnel tab becomes the merged list with "Single list", and back. */
const resolvePhoneTab = (picked: PhoneTab, tabs: readonly PhoneTab[]): PhoneTab => {
  if (tabs.includes(picked)) return picked;

  if (picked === 'resources') return 'units';

  return picked === 'units' || picked === 'personnel' ? 'resources' : 'calls';
};

type StatusTarget = { kind: 'unit'; unitId: string } | { kind: 'personnel'; userId: string } | null;

/**
 * The Dispatch console (omni-plan §7.11; Dispatch baseline home / home.web): stats bar, the call filter banner and the
 * panels — active calls, units, personnel (or one resources list), notes, the live map, the tabbed activity card
 * (activity, radio, actions, check-ins, unit timers, weather) and push-to-talk — laid out in three columns on desktop,
 * Electron and landscape tablets, two on portrait tablets, and on phones as tabs (one full-height panel at a time, the
 * stats on one sideways-scrolling line, push-to-talk under every tab; picking a call, unit or person to act on opens the
 * Activity tab on its actions). Selecting a call filters
 * every panel to it; units support multi-select for one status change. Units over their status timer are flagged in
 * the stats bar, their rows and the Unit timers tab, and each crossing is logged. Writes in Dispatch's offline scope (statuses on behalf, call
 * notes, check-ins) go through the outbox; dispatching, releasing resources, closing and department notes are online.
 */
export default function DispatchConsoleScreen({ realtime = true, mapHref = '/map', mapSlot, showClock = true, showViewToggles = true, now = Date.now }: DispatchConsoleScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const formFactor = useFormFactor();
  const layout = resolveConsoleLayout(formFactor);
  const singleList = useDashboardViewStore((state) => state.singleList);
  const calls = useCallsStore((state) => state.calls);
  const pendingCount = useCallsStore((state) => state.pendingCalls.length);
  const units = useUnitsStore((state) => state.unitInfos);
  const personnel = usePersonnelStore((state) => state.personnel);
  const weatherAlerts = useWeatherAlertsStore((state) => state.alerts);
  const selectedCallId = useConsoleStore((state) => state.selectedCallId);
  const isCallFilterActive = useConsoleStore((state) => state.isCallFilterActive);
  const { call: selectedCall, extraData, callFilter } = useSelectedCall();
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [notesCallId, setNotesCallId] = useState<string | null>(null);
  const [closeCallId, setCloseCallId] = useState<string | null>(null);
  const [addResourcesCall, setAddResourcesCall] = useState<CallResultData | null>(null);
  const [statusTarget, setStatusTarget] = useState<StatusTarget>(null);
  const bottomInset = useBottomSafeAreaInset();
  const bottomPadding = Math.max(bottomInset, BODY_MARGIN);
  const isPhone = layout === 'single-column';
  const [pickedPhoneTab, setPickedPhoneTab] = useState<PhoneTab>('calls');
  const actionsRequest = useConsoleStore((state) => state.actionsRequest);
  const [seenActionsRequest, setSeenActionsRequest] = useState(actionsRequest);
  const unitsTerm = useTerm('module.units', t('dispatch.units'));
  const personnelTerm = useTerm('module.personnel', t('dispatch.personnel'));
  const mapTerm = useTerm('module.mapping', t('dispatch.map'));
  const notesTerm = useTerm('module.notes', t('dispatch.notes'));

  // A call, unit or person picked to act on (or "Set status" for several units) opens the actions, which a phone shows
  // in its Activity tab. Adjusted while rendering rather than in an effect, so the tab switches in the same pass.
  if (seenActionsRequest !== actionsRequest) {
    setSeenActionsRequest(actionsRequest);

    if (isPhone) setPickedPhoneTab('activity');
  }

  useConsoleData({ realtime });
  useRadioLog(realtime);

  const stats = useMemo(() => computeConsoleStats(calls, units, personnel, now()), [calls, now, personnel, units]);
  const extremeAlerts = useMemo(() => weatherAlerts.filter((alert) => alert.Severity === WeatherAlertSeverity.Extreme).length, [weatherAlerts]);
  const severeAlerts = useMemo(() => weatherAlerts.filter((alert) => alert.Severity === WeatherAlertSeverity.Severe).length, [weatherAlerts]);
  const filteredCall = isCallFilterActive ? selectedCall : null;

  const log = useConsoleStore((state) => state.addActivity);

  // A confirmation open for a unit or member that has left the filtered call (released elsewhere, another call picked) closes.
  const isReleasable = useCallback(
    (target: CallRelease) => {
      if (!callFilter || callFilter.callId !== target.callId) return false;

      if (target.kind === 'unit') return isUnitDispatchedToCall(units.find((unit) => unit.UnitId === target.id) ?? { UnitId: target.id, Name: target.name }, callFilter.dispatches);
      const person = personnel.find((entry) => entry.UserId === target.id);

      return person ? isPersonReleasableFromCall(person, callFilter) : false;
    },
    [callFilter, personnel, units]
  );

  // Release (stand down) a unit or member from the filtered call; the call stays open.
  const release = useReleaseFromCall({
    call: filteredCall,
    isReleasable,
    onReleased: (released) => log({ type: released.kind === 'unit' ? 'unit' : 'personnel', action: t('calls.release.action'), description: released.name, metadata: { callId: released.callId } }),
    testID: 'console-release-dialog',
  });

  const { requestRelease } = release;
  const canRelease = release.permissions.canReleaseAny;

  const releaseUnit = useCallback(
    (unitId: string) => {
      const unit = useUnitsStore.getState().unitInfos.find((entry) => entry.UnitId === unitId);

      requestRelease({ kind: 'unit', id: unitId, name: unit?.Name || unitId });
    },
    [requestRelease]
  );

  const releasePersonnel = useCallback(
    (userId: string) => {
      const person = usePersonnelStore.getState().personnel.find((entry) => entry.UserId === userId);

      requestRelease({ kind: 'personnel', id: userId, name: (person ? personnelFullName(person) : '') || userId });
    },
    [requestRelease]
  );

  const handleSelectCall = useCallback(
    (callId: string) => {
      const isOn = useConsoleStore.getState().toggleCallFilter(callId);
      const call = useCallsStore.getState().calls.find((entry) => entry.CallId === callId);
      const protectedLabel = t('data_protection.protected_value');

      if (call) {
        log({
          type: 'call',
          action: isOn ? t('dispatch.call_filter_active') : t('dispatch.call_filter_cleared'),
          description: `#${call.Number} - ${callDisplayName(call, protectedLabel) || callDisplayText(call, 'Nature', protectedLabel)}`,
          metadata: { callId },
        });
      }
    },
    [log, t]
  );

  const handleClearFilter = useCallback(() => {
    useConsoleStore.getState().clearCallFilter();
    log({ type: 'system', action: t('dispatch.call_filter_cleared'), description: t('dispatch.showing_all_data') });
  }, [log, t]);

  const handleSelectUnit = useCallback(
    (unitId: string) => {
      const isOn = useConsoleStore.getState().selectUnit(unitId);
      const unit = useUnitsStore.getState().unitInfos.find((entry) => entry.UnitId === unitId);

      if (unit) log({ type: 'unit', action: isOn ? t('dispatch.unit_selected') : t('dispatch.unit_deselected'), description: unit.Name, metadata: { unitId } });
    },
    [log, t]
  );

  const handleSelectPersonnel = useCallback(
    (userId: string) => {
      const isOn = useConsoleStore.getState().selectPersonnel(userId);
      const person = usePersonnelStore.getState().personnel.find((entry) => entry.UserId === userId);

      if (person)
        log({ type: 'personnel', action: isOn ? t('dispatch.personnel_selected') : t('dispatch.personnel_deselected'), description: `${person.FirstName} ${person.LastName}`.trim(), metadata: { personnelId: userId } });
    },
    [log, t]
  );

  const handlers: ConsoleActionHandlers = {
    onCreateCall: () => router.push(callRoutes.callNew()),
    onViewCall: (callId) => pushRoutePath(router, callRoutes.callDetail(callId)),
    onAddCallNote: (callId) => setNotesCallId(callId),
    onCloseCall: (callId) => setCloseCallId(callId),
    onAddResources: (call) => setAddResourcesCall(call),
    onViewUnit: (unitId) => pushRoutePath(router, unitsRoutes.detail(unitId)),
    onViewPersonnel: (userId) => pushRoutePath(router, personnelRoutes.detail(userId)),
    onStatusSaved: (kind, names) =>
      log({ type: kind === 'unit' ? 'unit' : 'personnel', action: t('dispatch_console.status_saved'), description: names, ...(selectedCallId ? { metadata: { callId: selectedCallId } } : {}) }),
  };

  const callsPanel = (sizing: { flex?: number; maxHeight?: number }) => (
    <ActiveCallsPanel
      selectedCallId={selectedCallId}
      isFilterActive={isCallFilterActive}
      onSelectCall={handleSelectCall}
      onOpenCall={handlers.onViewCall}
      onNewCall={handlers.onCreateCall}
      onAddResources={handlers.onAddResources}
      now={now}
      {...sizing}
    />
  );

  const unitsPanel = (sizing: { flex?: number; maxHeight?: number }) => (
    <UnitsPanel
      callFilter={callFilter}
      onSelectUnit={handleSelectUnit}
      onOpenUnit={handlers.onViewUnit}
      onSetStatusForCall={(unitId) => setStatusTarget({ kind: 'unit', unitId })}
      onReleaseFromCall={canRelease ? releaseUnit : undefined}
      {...sizing}
    />
  );

  const personnelPanel = (sizing: { flex?: number; maxHeight?: number }) => (
    <PersonnelPanel
      callFilter={callFilter}
      onSelectPersonnel={handleSelectPersonnel}
      onOpenPersonnel={handlers.onViewPersonnel}
      onSetStatusForCall={(userId) => setStatusTarget({ kind: 'personnel', userId })}
      onReleaseFromCall={canRelease ? releasePersonnel : undefined}
      {...sizing}
    />
  );

  const resourcesPanel = (sizing: { flex?: number; maxHeight?: number }) => (
    <ResourcesPanel
      callFilter={callFilter}
      onSelectUnit={handleSelectUnit}
      onSelectPersonnel={handleSelectPersonnel}
      onOpenUnit={handlers.onViewUnit}
      onOpenPersonnel={handlers.onViewPersonnel}
      onSetUnitStatusForCall={(unitId) => setStatusTarget({ kind: 'unit', unitId })}
      onSetPersonnelStatusForCall={(userId) => setStatusTarget({ kind: 'personnel', userId })}
      onReleaseUnitFromCall={canRelease ? releaseUnit : undefined}
      onReleasePersonnelFromCall={canRelease ? releasePersonnel : undefined}
      {...sizing}
    />
  );

  const notesPanel = (sizing: { flex?: number; maxHeight?: number }) => <NotesPanel callId={filteredCall ? filteredCall.CallId : null} onNewNote={() => setIsAddNoteOpen(true)} {...sizing} />;
  const mapPanel = (sizing: { flex?: number; maxHeight?: number }) => <MapPanel selectedCall={filteredCall} onExpand={mapHref ? () => router.push(mapHref as Href) : undefined} mapSlot={mapSlot} {...sizing} />;
  const activityPanel = (sizing: { flex?: number; maxHeight?: number }) => <ActivityPanel selectedCall={filteredCall} callActivity={extraData?.Activity ?? []} {...handlers} {...sizing} />;

  const renderLayout = () => {
    if (layout === 'three-column') {
      return (
        <View style={styles.row} testID="console-layout-three-column">
          <View style={styles.column}>
            {callsPanel({ flex: singleList ? 2 : 1 })}
            {singleList ? notesPanel({ flex: 1 }) : unitsPanel({ flex: 1 })}
          </View>
          <View style={StyleSheet.flatten([styles.column, styles.center])}>
            {mapPanel({ flex: 1 })}
            {activityPanel({ flex: 1 })}
          </View>
          <View style={styles.column}>
            {singleList ? resourcesPanel({ flex: 1 }) : personnelPanel({ flex: 1 })}
            {singleList ? null : notesPanel({ flex: 1 })}
            <PttPanel />
          </View>
        </View>
      );
    }

    if (layout === 'two-column') {
      return (
        <View style={styles.row} testID="console-layout-two-column">
          <View style={styles.column}>
            {callsPanel({ flex: singleList ? 2 : 1 })}
            {singleList ? notesPanel({ flex: 1 }) : unitsPanel({ flex: 1 })}
            {singleList ? null : personnelPanel({ flex: 1 })}
          </View>
          <View style={styles.column}>
            {mapPanel({ flex: 1 })}
            {singleList ? resourcesPanel({ flex: 1 }) : notesPanel({ flex: 1 })}
            <PttPanel />
            {activityPanel({ flex: 1 })}
          </View>
        </View>
      );
    }

    const phoneTabs = singleList ? PHONE_TABS_SINGLE_LIST : PHONE_TABS_SPLIT;
    const phoneTab = resolvePhoneTab(pickedPhoneTab, phoneTabs);

    const phoneTabLabels: Record<PhoneTab, string> = {
      calls: t('dispatch.active_calls'),
      units: unitsTerm,
      personnel: personnelTerm,
      resources: t('dispatch_console.resources'),
      map: mapTerm,
      activity: t('dispatch.activity'),
      notes: notesTerm,
    };

    // The active calls count rides on the Calls tab (a tab bar hides a badge of 0).
    const tabItems: TabBarItem<PhoneTab>[] = phoneTabs.map((key) => ({ key, label: phoneTabLabels[key], badge: key === 'calls' ? stats.activeCalls : 0 }));
    const fill = { flex: 1 };

    const panels: Record<PhoneTab, () => React.ReactNode> = {
      calls: () => callsPanel(fill),
      units: () => unitsPanel(fill),
      personnel: () => personnelPanel(fill),
      resources: () => resourcesPanel(fill),
      map: () => mapPanel(fill),
      activity: () => activityPanel(fill),
      notes: () => notesPanel(fill),
    };

    return (
      <View style={styles.fill} testID="console-layout-single-column">
        <TabBar
          tabs={tabItems}
          activeKey={phoneTab}
          onChange={(key) => setPickedPhoneTab(key)}
          variant="underlined"
          tabStyle={styles.phoneTab}
          accessibilityLabel={t('dispatch_console.title')}
          testID="console-phone-tabs"
        />
        <ConsolePanelPlacementContext.Provider value={PHONE_TAB_PLACEMENT}>
          <View style={styles.phonePanel} testID={`console-phone-panel-${phoneTab}`}>
            {panels[phoneTab]()}
          </View>
        </ConsolePanelPlacementContext.Provider>
        <PttPanel />
      </View>
    );
  };

  return (
    <View style={styles.screen} className="bg-background-canvas" testID="dispatch-console">
      <StatsHeader
        stats={stats}
        pendingCalls={pendingCount}
        extremeAlerts={extremeAlerts}
        severeAlerts={severeAlerts}
        onPendingCallsPress={() => router.push(callQueuesRoutes.pending())}
        onScheduledCallsPress={() => router.push(callQueuesRoutes.scheduled())}
        onWeatherAlertsPress={() => router.push(weatherAlertsRoutes.list())}
        onUnitTimersPress={() => {
          useConsoleStore.getState().setActiveTab('unit-timers');

          if (isPhone) setPickedPhoneTab('activity');
        }}
        showClock={showClock}
        compact={isPhone}
      />
      <UnitTimerActivity />
      {showViewToggles ? <ViewToggles /> : null}
      {filteredCall ? <ActiveCallFilterBanner call={filteredCall} onClearFilter={handleClearFilter} /> : null}
      {/* The console reaches the bottom of the screen (drawer shell), so while the keyboard is up its panels sit on top of
          it: a call note typed in the notes card stays in view. The layout inside keeps clear of the home indicator (at
          least the body's margin), and the keyboard view owes the keyboard only the rest. */}
      <BottomAnchoredKeyboardView offset={bottomPadding} style={styles.body}>
        <View style={StyleSheet.flatten([styles.fill, { paddingBottom: bottomPadding }])}>{renderLayout()}</View>
      </BottomAnchoredKeyboardView>

      <AddNoteSheet isOpen={isAddNoteOpen} onClose={() => setIsAddNoteOpen(false)} onNoteAdded={() => log({ type: 'system', action: t('dispatch.note_created'), description: t('dispatch.note_added_to_console') })} />
      {notesCallId ? <CallNotesModal isOpen onClose={() => setNotesCallId(null)} callId={notesCallId} /> : null}
      {closeCallId ? (
        <CloseCallSheet
          isOpen
          callId={closeCallId}
          onClose={() => setCloseCallId(null)}
          onClosed={() => {
            if (useConsoleStore.getState().selectedCallId === closeCallId) useConsoleStore.getState().clearCallFilter();
            void useCallsStore.getState().fetchCalls({ bypassCache: true });
          }}
        />
      ) : null}
      <AddResourcesSheet call={addResourcesCall} onClose={() => setAddResourcesCall(null)} />
      {statusTarget?.kind === 'unit' ? <ConsoleUnitStatusSheet isOpen onClose={() => setStatusTarget(null)} unitIds={[statusTarget.unitId]} defaultCallId={selectedCallId} /> : null}
      {statusTarget?.kind === 'personnel' ? <ConsolePersonnelStatusSheet isOpen onClose={() => setStatusTarget(null)} userId={statusTarget.userId} defaultCallId={selectedCallId} /> : null}
      {release.dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, padding: BODY_MARGIN },
  row: { flex: 1, flexDirection: 'row' },
  column: { flex: 1, minWidth: 0, marginHorizontal: 4 },
  center: { flex: 1.5 },
  fill: { flex: 1 },
  phonePanel: { flex: 1, marginTop: 8, marginBottom: 8 },
  // A 44 pt touch target for each tab.
  phoneTab: { minHeight: 44 },
});
