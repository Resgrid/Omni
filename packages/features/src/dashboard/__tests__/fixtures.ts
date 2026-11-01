import { securityStore } from '@resgrid/auth';
import { useCallsStore, useMapMarkersStore, useMessagesStore, useNotesStore, usePersonnelStore, useUnitsStore, useUnitStatusAlertsStore, useWeatherAlertsStore } from '@resgrid/data';
import type { DepartmentRightsResultData, GetConfigResultData } from '@resgrid/models';

import { useDashboardStore } from '../hooks/use-dashboard-store';
import { useDashboardViewStore } from '../hooks/use-dashboard-view-store';
import { useDashboardConfigStore } from '../hooks/use-department-config';
import { useWidgetSettingsStore } from '../hooks/use-widget-settings-store';

const noop = () => jest.fn(async () => undefined);

/** Replaces every fetch the dashboard can trigger with a jest mock and empties the stores. Returns the mocks. */
export function stubDataStores() {
  const mocks = {
    fetchCalls: noop(),
    fetchCallPriorities: noop(),
    fetchScheduledCalls: noop(),
    fetchCallDispatches: noop(),
    fetchCallExtraData: jest.fn(async () => null),
    fetchUnitInfos: noop(),
    fetchPersonnel: noop(),
    fetchStatusOptions: noop(),
    fetchGroups: noop(),
    fetchNotes: noop(),
    fetchActiveAlerts: noop(),
    fetchAcknowledgements: noop(),
    acknowledge: jest.fn(async () => ({ ok: true as const })),
    clear: jest.fn(async () => ({ ok: true as const })),
    fetchRecipients: noop(),
    fetchMarkers: noop(),
    loadConfig: noop(),
  };
  useCallsStore.setState({
    calls: [],
    callPriorities: [],
    scheduledCalls: [],
    callDispatches: {},
    loading: {},
    errors: {},
    fetchCalls: mocks.fetchCalls,
    fetchCallPriorities: mocks.fetchCallPriorities,
    fetchScheduledCalls: mocks.fetchScheduledCalls,
    fetchCallDispatches: mocks.fetchCallDispatches,
    fetchCallExtraData: mocks.fetchCallExtraData,
  });
  useUnitsStore.setState({ unitInfos: [], loading: {}, errors: {}, fetchUnitInfos: mocks.fetchUnitInfos });
  usePersonnelStore.setState({
    personnel: [],
    statusOptions: [],
    staffingOptions: [],
    groups: [],
    loading: {},
    errors: {},
    fetchPersonnel: mocks.fetchPersonnel,
    fetchStatusOptions: mocks.fetchStatusOptions,
    fetchGroups: mocks.fetchGroups,
  });
  useNotesStore.setState({ notes: [], loading: {}, errors: {}, fetchNotes: mocks.fetchNotes });
  useWeatherAlertsStore.setState({ alerts: [], loading: {}, errors: {}, fetchActiveAlerts: mocks.fetchActiveAlerts });
  useUnitStatusAlertsStore.setState({ acknowledgements: {}, loading: {}, errors: {}, fetchAcknowledgements: mocks.fetchAcknowledgements, acknowledge: mocks.acknowledge, clear: mocks.clear });
  useMessagesStore.setState({ recipients: [], fetchRecipients: mocks.fetchRecipients });
  useMapMarkersStore.setState({ markers: [], centerLatitude: null, centerLongitude: null, loading: {}, errors: {}, fetchedAt: {}, fetchMarkers: mocks.fetchMarkers });
  useDashboardConfigStore.setState({ config: null, isLoading: false, hasError: false, load: mocks.loadConfig });
  useDashboardStore.setState({ widgets: [] });
  useDashboardViewStore.setState({ isEditMode: false, showAddMenu: false });
  useWidgetSettingsStore.getState().resetAllSettings();
  setRights({ CanCreateCalls: true, CanViewPII: true });
  return mocks;
}

export function setRights(rights: Partial<DepartmentRightsResultData>): void {
  securityStore.setState({ rights: { DepartmentId: '1', ...rights } as DepartmentRightsResultData });
}

export function setConfig(config: Partial<GetConfigResultData>): void {
  useDashboardConfigStore.setState({ config: { UnitStatusThresholds: [], ...config } as GetConfigResultData });
}

export const NOW = Date.now();
/** A UTC wire value `seconds` ago, without "Z" (as some Core fields arrive). */
export const utcAgo = (seconds: number): string => new Date(Date.now() - seconds * 1000).toISOString().replace('Z', '');
