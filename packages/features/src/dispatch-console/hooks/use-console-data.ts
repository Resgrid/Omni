import { useCallDetailStore, useCallsStore, useMapMarkersStore, useNotesStore, usePersonnelStore, useUnitsStore, useWeatherAlertsStore } from '@resgrid/data';
import { CALL_LIST_REFRESH_EVENTS } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import { type RealtimeEventName, useRealtimeEvent, useRealtimeRefetch } from '@resgrid/realtime';
import { useCallback, useEffect } from 'react';

import type { ActivityLogEntry } from '../lib/console-types';
import { useConsoleStore } from './use-console-store';

export const CONSOLE_PERSONNEL_EVENTS: readonly RealtimeEventName[] = ['personnelStatusUpdated', 'personnelStaffingUpdated', 'eventingHubJoined'];
export const CONSOLE_UNIT_EVENTS: readonly RealtimeEventName[] = ['unitStatusUpdated', 'eventingHubJoined'];

const EVENT_KEYS: Partial<Record<RealtimeEventName, { key: string; type: ActivityLogEntry['type'] }>> = {
  personnelStatusUpdated: { key: 'dispatch.personnel_status_updated', type: 'personnel' },
  personnelStaffingUpdated: { key: 'dispatch.personnel_staffing_updated', type: 'personnel' },
  unitStatusUpdated: { key: 'dispatch.unit_status_updated', type: 'unit' },
  callsUpdated: { key: 'dispatch.calls_updated', type: 'call' },
  callAdded: { key: 'dispatch.call_added', type: 'call' },
  callClosed: { key: 'dispatch.call_closed', type: 'call' },
};

/** Re-reads the call the console is filtered to (dispatches, activity), bypassing caches. */
export const refreshSelectedCall = async (): Promise<void> => {
  const { isCallFilterActive, selectedCallId } = useConsoleStore.getState();
  if (isCallFilterActive && selectedCallId) await useCallDetailStore.getState().fetchCallDetail(selectedCallId, { bypassCache: true });
};

/**
 * The console's data (Dispatch baseline home screen): calls, priorities, the pending/scheduled queues, units (infos and
 * status sets), personnel, department notes, weather alerts and the map pins — read from the persisted stores first
 * (works offline) and refreshed on mount. SignalR events are id-only pings: each refetches its lists bypassing caches
 * (single flight with one trailing run) and adds a line to the activity log; a hub rejoin catches everything up.
 */
export function useConsoleData({ realtime = true }: { realtime?: boolean } = {}): { refreshAll: () => Promise<void> } {
  const { t } = useTranslation();

  const refreshCalls = useCallback(async () => {
    const calls = useCallsStore.getState();
    await Promise.all([calls.fetchCalls({ bypassCache: true }), calls.refreshQueuedCallLists(), refreshSelectedCall(), useMapMarkersStore.getState().fetchMarkers({ bypassCache: true })]);
  }, []);

  const refreshUnits = useCallback(async () => {
    await Promise.all([useUnitsStore.getState().fetchUnitInfos({ bypassCache: true }), useMapMarkersStore.getState().fetchMarkers({ bypassCache: true })]);
  }, []);

  const refreshPersonnel = useCallback(async () => {
    await usePersonnelStore.getState().fetchPersonnel({ bypassCache: true });
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshCalls(), refreshUnits(), refreshPersonnel(), useNotesStore.getState().fetchNotes({ bypassCache: true })]);
  }, [refreshCalls, refreshPersonnel, refreshUnits]);

  useEffect(() => {
    const calls = useCallsStore.getState();
    void calls.fetchCalls();
    void calls.fetchCallPriorities();
    // Pending calls are not in GetActiveCalls: the Pending tile counts them from their own queue.
    void calls.fetchPendingCalls();
    void calls.fetchScheduledCalls();
    void useUnitsStore.getState().fetchUnitInfos();
    void useUnitsStore.getState().fetchUnits();
    void usePersonnelStore.getState().fetchPersonnel();
    void usePersonnelStore.getState().fetchStatusOptions();
    void useNotesStore.getState().fetchNotes();
    void useWeatherAlertsStore.getState().fetchActiveAlerts();
    void useMapMarkersStore.getState().fetchMarkers();
  }, []);

  useRealtimeRefetch(CALL_LIST_REFRESH_EVENTS, refreshCalls, realtime);
  useRealtimeRefetch(CONSOLE_UNIT_EVENTS, refreshUnits, realtime);
  useRealtimeRefetch(CONSOLE_PERSONNEL_EVENTS, refreshPersonnel, realtime);

  const logEvent = useCallback(
    (name: RealtimeEventName) => {
      const entry = EVENT_KEYS[name];
      if (entry) useConsoleStore.getState().addActivity({ type: entry.type, action: t('dispatch.signalr_update'), description: t(entry.key) });
    },
    [t]
  );

  useRealtimeEvent('personnelStatusUpdated', () => logEvent('personnelStatusUpdated'), realtime);
  useRealtimeEvent('personnelStaffingUpdated', () => logEvent('personnelStaffingUpdated'), realtime);
  useRealtimeEvent('unitStatusUpdated', () => logEvent('unitStatusUpdated'), realtime);
  useRealtimeEvent('callsUpdated', () => logEvent('callsUpdated'), realtime);
  useRealtimeEvent('callAdded', () => logEvent('callAdded'), realtime);
  useRealtimeEvent('callClosed', () => logEvent('callClosed'), realtime);
  useRealtimeEvent(
    'eventingHubJoined',
    (info) => {
      if (info.rejoin) useConsoleStore.getState().addActivity({ type: 'system', action: t('dispatch.signalr_connected'), description: t('dispatch.realtime_updates_active') });
    },
    realtime
  );

  return { refreshAll };
}
