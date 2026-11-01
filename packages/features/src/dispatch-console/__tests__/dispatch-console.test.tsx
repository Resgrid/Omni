/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run lazily, so they require modules inside. */
import '../../calls/__tests__/test-setup';

import { useCallDetailStore, useCallsStore, useCheckInTimersStore, useMapMarkersStore, useNotesStore, usePersonnelStore, usePoisStore, useUnitsStore, useWeatherAlertsStore } from '@resgrid/data';
import { emitRealtimeEvent } from '@resgrid/realtime';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { Dimensions } from 'react-native';

import { activateVariant, hidden, makeCall, setRights } from '../../calls/__tests__/test-utils';
import { useConsoleStore } from '../hooks/use-console-store';
import { useDashboardViewStore } from '../hooks/use-dashboard-view-store';
import DispatchConsoleScreen from '../screens/dispatch-console';

jest.mock('@resgrid/maps', () => {
  const { View } = require('react-native');
  const mockReact = require('react');
  return {
    MapView: ({ children, testID }: { children?: unknown; testID?: string }) => mockReact.createElement(View, { testID }, children),
    Camera: () => null,
    MapPins: ({ pins }: { pins: unknown[] }) => mockReact.createElement(View, { testID: `map-pins-${pins.length}` }),
    useMapStyle: () => ({ isAvailable: true, status: 'ready' }),
    useMapCenter: () => ({ latitude: 39, longitude: -105, zoomLevel: 9 }),
  };
});

const mockPtt = {
  isConnected: false,
  isConnecting: false,
  isReconnecting: false,
  isTransmitting: false,
  currentChannel: null as null | { Id: string; Name: string },
  error: null,
  connect: jest.fn(async () => ({ ok: true })),
  disconnect: jest.fn(async () => undefined),
  toggleTransmitting: jest.fn(async () => undefined),
};

jest.mock('@resgrid/voice', () => {
  const { create } = require('zustand');
  const mockLiveKitStore = create(() => ({ activeSpeakerIdentities: [] as string[] }));
  return {
    useLiveKitStore: mockLiveKitStore,
    usePtt: () => mockPtt,
    useVoiceChannels: () => ({
      channels: [
        { Id: 'c1', Name: 'Main Dispatch', IsDefault: true },
        { Id: 'c2', Name: 'Fireground', IsDefault: false },
      ],
      selectedChannel: null,
      defaultChannel: { Id: 'c1', Name: 'Main Dispatch', IsDefault: true },
      isVoiceEnabled: true,
      isLoading: false,
      selectChannel: jest.fn(),
    }),
    useVoiceStatus: () => ({ isSomeoneTalking: false }),
    useDesktopPtt: () => ({ isActive: false, isHotkeyDown: false, hotkey: { code: 'Space' } }),
    formatHotkey: () => 'Space',
    DEFAULT_DESKTOP_PTT_HOTKEY: { code: 'Space' },
  };
});

const NOW = Date.parse('2026-10-31T12:00:00Z');

const unit = (UnitId: string, overrides: Record<string, unknown> = {}) =>
  ({
    UnitId,
    Name: `E${UnitId}`,
    Type: 'Engine',
    GroupName: 'Station 1',
    CurrentStatus: 'Available',
    CurrentStatusColor: '#00ff00',
    CurrentStatusBaseType: 0,
    CurrentDestinationId: '',
    CurrentDestinationName: '',
    Roles: [],
    CustomStatusSetId: '',
    ...overrides,
  }) as never;

const person = (UserId: string, overrides: Record<string, unknown> = {}) =>
  ({
    UserId,
    FirstName: 'Pat',
    LastName: UserId,
    GroupName: 'A',
    Status: 'Available',
    StatusColor: '#00ff00',
    StatusBaseType: 0,
    Staffing: 'On shift',
    StaffingBaseType: 4,
    StatusDestinationId: '',
    Roles: [],
    ...overrides,
  }) as never;

const mocks = {
  fetchCalls: jest.fn(async () => undefined),
  refreshQueuedCallLists: jest.fn(async () => undefined),
  fetchUnitInfos: jest.fn(async () => undefined),
  fetchPersonnel: jest.fn(async () => undefined),
  fetchMarkers: jest.fn(async () => undefined),
  fetchCallDetail: jest.fn(async () => undefined),
};

const setWindow = (width: number, height: number) => {
  const metrics = { width, height, scale: 2, fontScale: 1 };
  act(() => Dimensions.set({ window: metrics, screen: metrics }));
};

beforeEach(() => {
  activateVariant('dispatch');
  setRights({ CanViewPII: true });
  useToastStore.setState({ toasts: [] });
  useConsoleStore.setState(useConsoleStore.getInitialState());
  useDashboardViewStore.setState({ availableOnly: false, singleList: false, collapsedCards: {} });
  useCallsStore.setState({
    calls: [makeCall('9', { Name: 'Kitchen fire', Number: '26-9', Priority: 1 }), makeCall('10', { Name: 'Tomorrow burn', DispatchedOnUtc: '2026-11-02T09:00:00Z' })],
    pendingCalls: [makeCall('p1', { State: 8 }), makeCall('p2', { State: 8 })],
    callPriorities: [],
    callDispatches: { '9': [{ Id: '2', Type: 'Unit', Name: 'E2' } as never] },
    loading: {},
    errors: {},
    fetchCalls: mocks.fetchCalls,
    fetchCallPriorities: jest.fn(async () => undefined),
    fetchPendingCalls: jest.fn(async () => undefined),
    fetchScheduledCalls: jest.fn(async () => undefined),
    refreshQueuedCallLists: mocks.refreshQueuedCallLists,
    fetchCallDispatches: jest.fn(async () => undefined),
  });
  useUnitsStore.setState({
    unitInfos: [unit('1'), unit('2', { CurrentStatus: 'Responding', CurrentStatusBaseType: 2, CurrentDestinationId: '9' }), unit('3')],
    unitTypeStatuses: [{ UnitType: '0', StatusId: '0', Statuses: [{ Id: 1, Text: 'Available', BaseType: 0, Detail: 0, Note: 0 }] }] as never,
    loading: {},
    errors: {},
    fetchUnitInfos: mocks.fetchUnitInfos,
    fetchUnits: jest.fn(async () => undefined),
  });
  usePersonnelStore.setState({
    personnel: [person('a'), person('b', { StatusBaseType: 3, Status: 'On scene', StatusDestinationId: '9' })],
    statusOptions: [],
    groups: [],
    loading: {},
    errors: {},
    fetchPersonnel: mocks.fetchPersonnel,
    fetchStatusOptions: jest.fn(async () => undefined),
    fetchGroups: jest.fn(async () => undefined),
  });
  usePoisStore.setState({ fetchDestinationPois: jest.fn(async () => undefined) });
  useNotesStore.setState({
    notes: [{ NoteId: 'n1', Title: 'Hydrant out', Body: '<p>Main &amp; 3rd</p>', Category: 'Water', AddedOn: '2026-10-31T10:00:00Z' } as never],
    loading: {},
    fetchNotes: jest.fn(async () => undefined),
  });
  useWeatherAlertsStore.setState({ alerts: [{ WeatherAlertId: 'w1', Severity: 0, Event: 'Tornado Warning' } as never], fetchActiveAlerts: jest.fn(async () => undefined) });
  useMapMarkersStore.setState({ markers: [{ Id: 'm1', Latitude: 40, Longitude: -105 } as never], centerLatitude: 40, centerLongitude: -105, zoomLevel: 11, fetchMarkers: mocks.fetchMarkers });
  useCheckInTimersStore.setState({ statusesByCall: {}, fetchTimerStatusesForCalls: jest.fn(async () => undefined) });
  useCallDetailStore.setState({ details: {}, fetchCallDetail: mocks.fetchCallDetail, fetchCallNotes: jest.fn(async () => undefined) });
  Object.assign(mockPtt, { isConnected: false, isTransmitting: false, currentChannel: null });
});

afterEach(() => {
  jest.restoreAllMocks();
  useToastStore.getState().clearToasts();
});

const renderConsole = () => render(<DispatchConsoleScreen realtime={false} showClock={false} now={() => NOW} />);

describe('DispatchConsoleScreen layout', () => {
  it('uses three columns on a landscape tablet, two in portrait and one on a phone', () => {
    setWindow(1366, 1024);
    const { unmount } = renderConsole();
    expect(screen.getByTestId('console-layout-three-column')).toBeTruthy();
    unmount();
    setWindow(1024, 1366);
    const second = renderConsole();
    expect(screen.getByTestId('console-layout-two-column')).toBeTruthy();
    second.unmount();
    setWindow(390, 844);
    renderConsole();
    expect(screen.getByTestId('console-layout-single-column')).toBeTruthy();
  });

  it('shows the stats by BaseType and opens the queues from their tiles', () => {
    setWindow(1366, 1024);
    renderConsole();
    expect(screen.getByTestId('stat-active-calls-value')).toHaveTextContent('1');
    expect(screen.getByTestId('stat-scheduled-calls-value')).toHaveTextContent('1');
    expect(screen.getByTestId('stat-pending-calls-value')).toHaveTextContent('2');
    expect(screen.getByTestId('stat-units-available-value')).toHaveTextContent('2');
    expect(screen.getByTestId('stat-weather-alerts-value')).toHaveTextContent('1');
    fireEvent.press(screen.getByTestId('stat-pending-calls'));
    expect(router.push).toHaveBeenCalledWith('/pending-calls');
    fireEvent.press(screen.getByTestId('stat-scheduled-calls'));
    expect(router.push).toHaveBeenCalledWith('/scheduled-calls');
  });

  it('merges units and personnel into one panel with "Single list" and hides unavailable ones with "Available only"', () => {
    setWindow(1366, 1024);
    renderConsole();
    fireEvent.press(screen.getByTestId('toggle-single-list'));
    expect(screen.getByTestId('resources-panel')).toBeTruthy();
    expect(screen.queryByTestId('units-panel')).toBeNull();
    fireEvent.press(screen.getByTestId('toggle-available-only'));
    expect(screen.queryByTestId('console-unit-2')).toBeNull();
    expect(screen.getByTestId('console-unit-1')).toBeTruthy();
  });

  it('collapses a card and remembers it', () => {
    setWindow(1366, 1024);
    renderConsole();
    fireEvent.press(screen.getByTestId('notes-panel-header'));
    expect(screen.queryByTestId('notes-list')).toBeNull();
    expect(useDashboardViewStore.getState().collapsedCards.notes).toBe(true);
  });
});

describe('DispatchConsoleScreen call filter and actions', () => {
  it('filters every panel to a pressed call and surfaces its actions', () => {
    setWindow(1366, 1024);
    renderConsole();
    expect(screen.queryByTestId('console-call-10')).toBeNull();
    fireEvent.press(screen.getByTestId('console-call-9'));
    expect(screen.getByTestId('active-call-filter-banner')).toBeTruthy();
    expect(mocks.fetchCallDetail).toHaveBeenCalledWith('9', { bypassCache: true });
    expect(screen.getByText('dispatch.units_on_call')).toBeTruthy();
    expect(screen.getByTestId('console-unit-2')).toBeTruthy();
    expect(screen.queryByTestId('console-unit-1')).toBeNull();
    expect(screen.getByTestId('console-person-b')).toBeTruthy();
    expect(screen.getByTestId('console-actions')).toBeTruthy();
    fireEvent.press(screen.getByTestId('console-action-view-call'));
    expect(router.push).toHaveBeenCalledWith('/call/9');
    fireEvent.press(screen.getByTestId('activity-tab-activity'));
    expect(within(screen.getByTestId('console-activity-log')).getByText('dispatch.call_filter_active')).toBeTruthy();
    fireEvent.press(screen.getByTestId('active-call-filter-clear'));
    expect(screen.queryByTestId('active-call-filter-banner')).toBeNull();
  });

  it('opens the close call sheet and the add-resources sheet for the filtered call', () => {
    setWindow(1366, 1024);
    renderConsole();
    fireEvent.press(screen.getByTestId('console-call-9'));
    fireEvent.press(screen.getByTestId('console-action-close-call'));
    expect(screen.getByTestId('close-call-sheet', hidden)).toBeTruthy();
    fireEvent.press(screen.getByTestId('console-call-9-add-resources'));
    expect(screen.getByTestId('add-resources-sheet', hidden)).toBeTruthy();
    expect(screen.getByTestId('add-resources-dispatch', hidden)).toBeDisabled();
  });

  it('sets a unit’s status on behalf with the filtered call as the default destination', () => {
    setWindow(1366, 1024);
    renderConsole();
    fireEvent.press(screen.getByTestId('console-call-9'));
    fireEvent.press(screen.getByTestId('console-unit-2-status-for-call'));
    expect(screen.getByTestId('console-unit-status-sheet', hidden)).toBeTruthy();
  });

  it('selects a unit, shows its actions and logs it', () => {
    setWindow(1366, 1024);
    renderConsole();
    fireEvent.press(screen.getByTestId('console-unit-1'));
    expect(screen.getByTestId('console-unit-actions')).toBeTruthy();
    fireEvent.press(screen.getByTestId('console-unit-set-status'));
    expect(screen.getByTestId('unit-status-sheet', hidden)).toBeTruthy();
    expect(useConsoleStore.getState().activityLog[0]).toMatchObject({ type: 'unit', action: 'dispatch.unit_selected', description: 'E1' });
  });

  it('builds a multi-unit selection for one status change', () => {
    setWindow(1366, 1024);
    renderConsole();
    fireEvent.press(screen.getByTestId('unit-multi-select-toggle'));
    fireEvent.press(screen.getByTestId('console-unit-1'));
    fireEvent.press(screen.getByTestId('console-unit-3'));
    expect(screen.getAllByText('dispatch.bulk_unit_actions.selected_count:2').length).toBeGreaterThan(0);
    expect(screen.getByTestId('console-bulk-actions')).toBeTruthy();
    fireEvent.press(screen.getByTestId('console-bulk-set-status'));
    expect(screen.getByTestId('console-unit-status-sheet', hidden)).toBeTruthy();
    fireEvent.press(screen.getByTestId('unit-select-done'));
    expect(useConsoleStore.getState().isSelectionMode).toBe(false);
  });
});

describe('DispatchConsoleScreen realtime, PTT and map', () => {
  it('refetches and logs on SignalR pings', () => {
    setWindow(1366, 1024);
    render(<DispatchConsoleScreen showClock={false} now={() => NOW} />);
    act(() => emitRealtimeEvent('unitStatusUpdated', '1'));
    expect(mocks.fetchUnitInfos).toHaveBeenCalledWith({ bypassCache: true });
    expect(useConsoleStore.getState().activityLog[0]).toMatchObject({ type: 'unit', description: 'dispatch.unit_status_updated' });
    act(() => emitRealtimeEvent('callAdded', '11'));
    expect(mocks.fetchCalls).toHaveBeenCalledWith({ bypassCache: true });
    expect(mocks.refreshQueuedCallLists).toHaveBeenCalled();
  });

  it('connects to the default channel, then toggles transmitting and logs it', async () => {
    setWindow(1366, 1024);
    const { rerender } = renderConsole();
    expect(screen.getByText('Main Dispatch')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('ptt-talk')));
    expect(mockPtt.connect).toHaveBeenCalledWith(expect.objectContaining({ Id: 'c1' }));
    Object.assign(mockPtt, { isConnected: true, currentChannel: { Id: 'c1', Name: 'Main Dispatch' } });
    rerender(<DispatchConsoleScreen realtime={false} showClock={false} now={() => NOW} />);
    await act(async () => fireEvent.press(screen.getByTestId('ptt-talk')));
    expect(mockPtt.toggleTransmitting).toHaveBeenCalled();
    expect(useConsoleStore.getState().activityLog[0]).toMatchObject({ action: 'dispatch.ptt_start' });
  });

  it('records radio transmissions from active speakers', () => {
    setWindow(1366, 1024);
    render(<DispatchConsoleScreen showClock={false} now={() => NOW} />);
    const { useLiveKitStore } = jest.requireMock('@resgrid/voice') as { useLiveKitStore: { setState: (state: object) => void } };
    act(() => useLiveKitStore.setState({ activeSpeakerIdentities: ['a'] }));
    act(() => useLiveKitStore.setState({ activeSpeakerIdentities: [] }));
    fireEvent.press(screen.getByTestId('activity-tab-radio'));
    expect(within(screen.getByTestId('console-radio-log')).getByText('Pat a')).toBeTruthy();
  });

  it('shows the department pins and expands to the full map', () => {
    setWindow(1366, 1024);
    renderConsole();
    expect(screen.getByTestId('map-pins-1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('map-expand'));
    expect(router.push).toHaveBeenCalledWith('/map');
  });
});
