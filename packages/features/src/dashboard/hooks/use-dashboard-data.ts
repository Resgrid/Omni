import { useCallsStore, useNotesStore, usePersonnelStore, useUnitsStore, useUnitStatusAlertsStore, useWeatherAlertsStore } from '@resgrid/data';
import { useWeatherAlertsRealtime } from '@resgrid/features/weather-alerts';
import { type RealtimeEventName, useRealtimeRefetch } from '@resgrid/realtime';
import { useCallback, useEffect, useMemo } from 'react';

import { type DashboardDataSource, dataSourcesFor, type WidgetType } from '../lib/widget-types';
import { useDashboardConfigStore } from './use-department-config';

const CALL_EVENTS: readonly RealtimeEventName[] = ['callsUpdated', 'callAdded', 'callClosed', 'eventingHubJoined'];
const UNIT_EVENTS: readonly RealtimeEventName[] = ['unitStatusUpdated', 'eventingHubJoined'];
const PERSONNEL_EVENTS: readonly RealtimeEventName[] = ['personnelStatusUpdated', 'personnelStaffingUpdated', 'eventingHubJoined'];
/** A status change ends the episode an acknowledgement covered, so acknowledgements refetch on unit pushes too. */
const UNIT_ALERT_EVENTS: readonly RealtimeEventName[] = ['unitStatusAlertUpdated', 'unitStatusUpdated', 'eventingHubJoined'];
/** Department settings changed (status timers, map centre, weather key). */
const CONFIG_EVENTS: readonly RealtimeEventName[] = ['departmentUpdated'];
/** Notes have no push; a wall board re-reads them now and then. */
export const NOTES_REFRESH_MS = 15 * 60 * 1000;

/** Loads the dispatch badges of the open calls (the call rows' ticker); cached per call by the calls store. */
const loadCallDispatches = async (bypassCache: boolean): Promise<void> => {
  const ids = useCallsStore.getState().calls.map((call) => call.CallId);
  if (ids.length > 0) await useCallsStore.getState().fetchCallDispatches(ids, { bypassCache });
};

/**
 * Loads — and keeps live — only the data the widgets on the board read (BigBoard had every widget subscribe and fetch on
 * its own, so two widgets doubled every request). Reads come from the persisted @resgrid/data stores, so a board that
 * starts offline shows its last data; id-only realtime pings refetch bypassing caches (resgrid-realtime-push).
 */
export function useDashboardData(widgetTypes: readonly WidgetType[], enabled: boolean = true): Set<DashboardDataSource> {
  // Keyed on the sorted type list, not the array identity (a new array every render must not refetch).
  const key = [...widgetTypes].sort().join('|');
  const sources = useMemo(() => dataSourcesFor(key ? (key.split('|') as WidgetType[]) : []), [key]);
  const has = (source: DashboardDataSource): boolean => enabled && sources.has(source);
  const wantsCalls = has('calls');
  const wantsPriorities = has('callPriorities');
  const wantsScheduled = has('scheduledCalls');
  const wantsUnits = has('units');
  const wantsPersonnel = has('personnel');
  const wantsPersonnelOptions = has('personnelOptions');
  const wantsNotes = has('notes');
  const wantsWeatherAlerts = has('weatherAlerts');
  const wantsUnitAlerts = has('unitAlerts');
  const wantsConfig = has('config');

  const refreshCalls = useCallback(async () => {
    const tasks: Promise<void>[] = [];
    if (wantsCalls)
      tasks.push(
        useCallsStore
          .getState()
          .fetchCalls({ bypassCache: true })
          .then(() => loadCallDispatches(true))
      );
    if (wantsScheduled) tasks.push(useCallsStore.getState().fetchScheduledCalls({ bypassCache: true }));
    await Promise.all(tasks);
  }, [wantsCalls, wantsScheduled]);
  const refreshUnits = useCallback(() => useUnitsStore.getState().fetchUnitInfos({ bypassCache: true }), []);
  const refreshPersonnel = useCallback(() => usePersonnelStore.getState().fetchPersonnel({ bypassCache: true }), []);
  const refreshUnitAlerts = useCallback(() => useUnitStatusAlertsStore.getState().fetchAcknowledgements({ bypassCache: true }), []);
  const refreshConfig = useCallback(() => useDashboardConfigStore.getState().load({ bypassCache: true }), []);

  useEffect(() => {
    if (wantsCalls)
      void useCallsStore
        .getState()
        .fetchCalls()
        .then(() => loadCallDispatches(false));
  }, [wantsCalls]);
  useEffect(() => {
    if (wantsPriorities) void useCallsStore.getState().fetchCallPriorities();
  }, [wantsPriorities]);
  useEffect(() => {
    if (wantsScheduled) void useCallsStore.getState().fetchScheduledCalls();
  }, [wantsScheduled]);
  useEffect(() => {
    if (wantsUnits) void useUnitsStore.getState().fetchUnitInfos();
  }, [wantsUnits]);
  useEffect(() => {
    if (wantsPersonnel) void usePersonnelStore.getState().fetchPersonnel();
  }, [wantsPersonnel]);
  useEffect(() => {
    if (wantsPersonnelOptions) void usePersonnelStore.getState().fetchStatusOptions();
  }, [wantsPersonnelOptions]);
  useEffect(() => {
    if (wantsWeatherAlerts) void useWeatherAlertsStore.getState().fetchActiveAlerts();
  }, [wantsWeatherAlerts]);
  useEffect(() => {
    if (wantsUnitAlerts) void useUnitStatusAlertsStore.getState().fetchAcknowledgements();
  }, [wantsUnitAlerts]);
  useEffect(() => {
    if (wantsConfig && !useDashboardConfigStore.getState().config) void useDashboardConfigStore.getState().load();
  }, [wantsConfig]);
  useEffect(() => {
    if (!wantsNotes) return undefined;
    void useNotesStore.getState().fetchNotes();
    const timer = setInterval(() => void useNotesStore.getState().fetchNotes({ bypassCache: true }), NOTES_REFRESH_MS);
    return () => clearInterval(timer);
  }, [wantsNotes]);

  useRealtimeRefetch(CALL_EVENTS, refreshCalls, wantsCalls || wantsScheduled);
  useRealtimeRefetch(UNIT_EVENTS, refreshUnits, wantsUnits);
  useRealtimeRefetch(PERSONNEL_EVENTS, refreshPersonnel, wantsPersonnel);
  useRealtimeRefetch(UNIT_ALERT_EVENTS, refreshUnitAlerts, wantsUnitAlerts);
  useRealtimeRefetch(CONFIG_EVENTS, refreshConfig, wantsConfig);
  useWeatherAlertsRealtime(wantsWeatherAlerts);

  return sources;
}
