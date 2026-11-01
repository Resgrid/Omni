import { useCallsStore, usePersonnelStore, useUnitsStore, useWeatherAlertsStore } from '@resgrid/data';
import { callQueuesRoutes } from '@resgrid/features/call-queues';
import { CallNotesModal, callRoutes, CloseCallSheet } from '@resgrid/features/calls';
import { personnelRoutes } from '@resgrid/features/personnel';
import { unitsRoutes } from '@resgrid/features/units';
import { weatherAlertsRoutes } from '@resgrid/features/weather-alerts';
import { useTranslation } from '@resgrid/i18n';
import { type CallResultData, WeatherAlertSeverity } from '@resgrid/models';
import { useFormFactor } from '@resgrid/ui';
import { type Href, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { ConsoleActionHandlers } from '../components/actions-panel';
import { ActiveCallFilterBanner } from '../components/active-call-filter-banner';
import { ActiveCallsPanel } from '../components/active-calls-panel';
import { ActivityPanel } from '../components/activity-panel';
import { AddNoteSheet } from '../components/add-note-sheet';
import { AddResourcesSheet } from '../components/add-resources-sheet';
import { ConsolePersonnelStatusSheet, ConsoleUnitStatusSheet } from '../components/console-status-sheets';
import { MapPanel } from '../components/map-panel';
import { NotesPanel } from '../components/notes-panel';
import { PersonnelPanel } from '../components/personnel-panel';
import { PttPanel } from '../components/ptt-panel';
import { ResourcesPanel } from '../components/resources-panel';
import { StatsHeader } from '../components/stats-header';
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
  /** Clock for stats and ages (tests). */
  now?: () => number;
}

/** Height caps of the phone column, so each panel's list stays virtualized inside the scrolling page. */
const PHONE_PANEL_HEIGHT = 400;
const PHONE_MAP_HEIGHT = 300;

type StatusTarget = { kind: 'unit'; unitId: string } | { kind: 'personnel'; userId: string } | null;

/**
 * The Dispatch console (omni-plan §7.11; Dispatch baseline home / home.web): stats bar, the call filter banner and the
 * panels — active calls, units, personnel (or one resources list), notes, the live map, the tabbed activity card
 * (activity, radio, actions, check-ins, weather) and push-to-talk — laid out in three columns on desktop, Electron and
 * landscape tablets, two on portrait tablets and one scrolling column on phones. Selecting a call filters every panel
 * to it; units support multi-select for one status change. Writes in Dispatch's offline scope (statuses on behalf, call
 * notes, check-ins) go through the outbox; dispatching, closing and department notes are online.
 */
export default function DispatchConsoleScreen({ realtime = true, mapHref = '/map', mapSlot, showClock = true, now = Date.now }: DispatchConsoleScreenProps) {
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

  useConsoleData({ realtime });
  useRadioLog(realtime);

  const stats = useMemo(() => computeConsoleStats(calls, units, personnel, now()), [calls, now, personnel, units]);
  const extremeAlerts = useMemo(() => weatherAlerts.filter((alert) => alert.Severity === WeatherAlertSeverity.Extreme).length, [weatherAlerts]);
  const severeAlerts = useMemo(() => weatherAlerts.filter((alert) => alert.Severity === WeatherAlertSeverity.Severe).length, [weatherAlerts]);
  const filteredCall = isCallFilterActive ? selectedCall : null;

  const log = useConsoleStore((state) => state.addActivity);

  const handleSelectCall = useCallback(
    (callId: string) => {
      const isOn = useConsoleStore.getState().toggleCallFilter(callId);
      const call = useCallsStore.getState().calls.find((entry) => entry.CallId === callId);
      if (call) log({ type: 'call', action: isOn ? t('dispatch.call_filter_active') : t('dispatch.call_filter_cleared'), description: `#${call.Number} - ${call.Name || call.Nature}`, metadata: { callId } });
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
    onCreateCall: () => router.push(callRoutes.callNew() as Href),
    onViewCall: (callId) => router.push(callRoutes.callDetail(callId) as Href),
    onAddCallNote: (callId) => setNotesCallId(callId),
    onCloseCall: (callId) => setCloseCallId(callId),
    onAddResources: (call) => setAddResourcesCall(call),
    onViewUnit: (unitId) => router.push(unitsRoutes.detail(unitId) as Href),
    onViewPersonnel: (userId) => router.push(personnelRoutes.detail(userId) as Href),
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
    <UnitsPanel callFilter={callFilter} onSelectUnit={handleSelectUnit} onSetStatusForCall={(unitId) => setStatusTarget({ kind: 'unit', unitId })} {...sizing} />
  );
  const personnelPanel = (sizing: { flex?: number; maxHeight?: number }) => (
    <PersonnelPanel callFilter={callFilter} onSelectPersonnel={handleSelectPersonnel} onSetStatusForCall={(userId) => setStatusTarget({ kind: 'personnel', userId })} {...sizing} />
  );
  const resourcesPanel = (sizing: { flex?: number; maxHeight?: number }) => (
    <ResourcesPanel
      callFilter={callFilter}
      onSelectUnit={handleSelectUnit}
      onSelectPersonnel={handleSelectPersonnel}
      onSetUnitStatusForCall={(unitId) => setStatusTarget({ kind: 'unit', unitId })}
      onSetPersonnelStatusForCall={(userId) => setStatusTarget({ kind: 'personnel', userId })}
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
    return (
      <ScrollView contentContainerStyle={styles.scroll} testID="console-layout-single-column">
        {callsPanel({ maxHeight: PHONE_PANEL_HEIGHT })}
        {singleList ? notesPanel({ maxHeight: PHONE_PANEL_HEIGHT }) : null}
        {mapPanel({ maxHeight: PHONE_MAP_HEIGHT })}
        {singleList ? resourcesPanel({ maxHeight: PHONE_PANEL_HEIGHT }) : unitsPanel({ maxHeight: PHONE_PANEL_HEIGHT })}
        {singleList ? null : personnelPanel({ maxHeight: PHONE_PANEL_HEIGHT })}
        <PttPanel />
        {singleList ? null : notesPanel({ maxHeight: PHONE_PANEL_HEIGHT })}
        {activityPanel({ maxHeight: PHONE_PANEL_HEIGHT })}
      </ScrollView>
    );
  };

  return (
    <View style={styles.screen} className="bg-background-100" testID="dispatch-console">
      <StatsHeader
        stats={stats}
        pendingCalls={pendingCount}
        extremeAlerts={extremeAlerts}
        severeAlerts={severeAlerts}
        onPendingCallsPress={() => router.push(callQueuesRoutes.pending() as Href)}
        onScheduledCallsPress={() => router.push(callQueuesRoutes.scheduled() as Href)}
        onWeatherAlertsPress={() => router.push(weatherAlertsRoutes.list() as Href)}
        showClock={showClock}
      />
      <ViewToggles />
      {filteredCall ? <ActiveCallFilterBanner call={filteredCall} onClearFilter={handleClearFilter} /> : null}
      <View style={styles.body}>{renderLayout()}</View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, padding: 8 },
  row: { flex: 1, flexDirection: 'row' },
  column: { flex: 1, minWidth: 0, marginHorizontal: 4 },
  center: { flex: 1.5 },
  scroll: { paddingBottom: 24 },
});
