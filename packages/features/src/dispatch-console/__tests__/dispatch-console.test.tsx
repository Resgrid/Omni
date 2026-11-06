/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run lazily, so they require modules inside. */
import '../../calls/__tests__/test-setup';

import { featureFlagsStore } from '@resgrid/auth';
import {
  useCallDetailStore,
  useCallsStore,
  useCheckInTimersStore,
  useMapMarkersStore,
  useNavigationEtaStore,
  useNotesStore,
  usePersonnelStore,
  usePoisStore,
  useUnitsStore,
  useUnitStatusAlertsStore,
  useWeatherAlertsStore,
} from '@resgrid/data';
import { useDepartmentConfigStore } from '@resgrid/features/department-config';
import { emitRealtimeEvent } from '@resgrid/realtime';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { Dimensions } from 'react-native';

import { activateVariant, hidden, makeCall, setRights } from '../../calls/__tests__/test-utils';
import { ActivityPanel } from '../components/activity-panel';
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
    TrafficLayer: ({ visible }: { visible?: boolean }) => mockReact.createElement(View, { testID: `console-traffic-${visible === false ? 'hidden' : 'visible'}` }),
    MapTrafficButton: ({ onPress, testID }: { onPress: () => void; testID?: string }) => mockReact.createElement(require('react-native').Pressable, { onPress, testID }),
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

const setWindow = async (width: number, height: number) => {
  const metrics = { width, height, scale: 2, fontScale: 1 };
  await act(() => Dimensions.set({ window: metrics, screen: metrics }));
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

const renderConsole = async () => render(<DispatchConsoleScreen realtime={false} showClock={false} now={() => NOW} />);

describe('DispatchConsoleScreen layout', () => {
  it('uses three columns on a landscape tablet, two in portrait and one on a phone', async () => {
    await setWindow(1366, 1024);
    const { unmount } = await renderConsole();
    expect(screen.getByTestId('console-layout-three-column')).toBeTruthy();
    await unmount();
    await setWindow(1024, 1366);
    const second = await renderConsole();
    expect(screen.getByTestId('console-layout-two-column')).toBeTruthy();
    await second.unmount();
    await setWindow(390, 844);
    await renderConsole();
    expect(screen.getByTestId('console-layout-single-column')).toBeTruthy();
  });

  it('shows the stats by BaseType and opens the queues from their tiles', async () => {
    await setWindow(1366, 1024);
    await renderConsole();
    expect(screen.getByTestId('stat-active-calls-value')).toHaveTextContent('1');
    expect(screen.getByTestId('stat-scheduled-calls-value')).toHaveTextContent('1');
    expect(screen.getByTestId('stat-pending-calls-value')).toHaveTextContent('2');
    expect(screen.getByTestId('stat-units-available-value')).toHaveTextContent('2');
    // Extreme / severe, as on Dispatch's stats bar.
    expect(screen.getByTestId('stat-weather-alerts-value')).toHaveTextContent('1 / 0');
    await fireEvent.press(screen.getByTestId('stat-pending-calls'));
    expect(router.push).toHaveBeenCalledWith('/pending-calls');
    await fireEvent.press(screen.getByTestId('stat-scheduled-calls'));
    expect(router.push).toHaveBeenCalledWith('/scheduled-calls');
  });

  it('lets each stat tile keep its content height (grow) rather than flex-1, which a relayout can squash to its padding', async () => {
    await setWindow(1366, 1024);
    await renderConsole();

    for (const id of ['stat-active-calls', 'stat-pending-calls', 'stat-scheduled-calls', 'stat-units-available']) {
      const className = String(screen.getByTestId(`${id}-body`).props.className ?? '');
      expect(className).toMatch(/\bgrow\b/);
      expect(className).not.toMatch(/\bflex-1\b/);
    }
  });

  it('merges units and personnel into one panel with "Single list" and hides unavailable ones with "Available only"', async () => {
    await setWindow(1366, 1024);
    await renderConsole();
    await fireEvent.press(screen.getByTestId('toggle-single-list'));
    expect(screen.getByTestId('resources-panel')).toBeTruthy();
    expect(screen.queryByTestId('units-panel')).toBeNull();
    await fireEvent.press(screen.getByTestId('toggle-available-only'));
    expect(screen.queryByTestId('console-unit-2')).toBeNull();
    expect(screen.getByTestId('console-unit-1')).toBeTruthy();
  });

  it('opens a department note as its own page', async () => {
    await setWindow(1366, 1024);
    await renderConsole();
    await fireEvent.press(screen.getByTestId('note-card-n1'));
    expect(router.push).toHaveBeenCalledWith('/notes/n1');
  });

  it('collapses a card and remembers it', async () => {
    await setWindow(1366, 1024);
    await renderConsole();
    await fireEvent.press(screen.getByTestId('notes-panel-header'));
    expect(screen.queryByTestId('notes-list')).toBeNull();
    expect(useDashboardViewStore.getState().collapsedCards.notes).toBe(true);
  });

  // On the web the header toggle is a <button>; its actions inside it would be a button inside a button.
  it('keeps the header actions beside the collapse toggle, not inside it', async () => {
    await setWindow(1366, 1024);
    await renderConsole();
    expect(within(screen.getByTestId('notes-panel-header')).queryByTestId('notes-refresh')).toBeNull();
    await fireEvent.press(screen.getByTestId('notes-refresh'));
    expect(useDashboardViewStore.getState().collapsedCards.notes).toBeUndefined();
    // The chevron repeats the toggle for pointer users only; assistive tech gets the one header button.
    expect(screen.queryByTestId('notes-panel-chevron')).toBeNull();
    await fireEvent.press(screen.getByTestId('notes-panel-chevron', hidden));
    expect(useDashboardViewStore.getState().collapsedCards.notes).toBe(true);
  });
});

describe('ActivityPanel', () => {
  it("counts the entries the activity tab shows: the filtered call's timeline when it has one", async () => {
    const handlers = { onViewCall: jest.fn(), onAddCallNote: jest.fn(), onCloseCall: jest.fn(), onAddResources: jest.fn(), onViewUnit: jest.fn(), onViewPersonnel: jest.fn() };

    // SAFETY: the timeline rows read only the event's type, id, status and timestamp.
    const timeline = [
      { Type: 'Unit', Id: '1', StatusText: 'En route', Timestamp: '' },
      { Type: 'Unit', Id: '2', StatusText: 'On scene', Timestamp: '' },
      { Type: 'User', Id: 'b', StatusText: 'Responding', Timestamp: '' },
    ] as never;

    useConsoleStore.setState({ activeTab: 'activity', activityLog: [{ id: 'l1', timestamp: 1, type: 'call', action: 'filtered', description: '#9', metadata: { callId: '9' } }] });
    const view = await render(<ActivityPanel selectedCall={makeCall('9')} callActivity={timeline} {...handlers} />);

    expect(within(screen.getByTestId('activity-tab-activity-badge')).getByText('3')).toBeTruthy();
    await view.rerender(<ActivityPanel selectedCall={makeCall('9')} callActivity={[]} {...handlers} />);
    expect(within(screen.getByTestId('activity-tab-activity-badge')).getByText('1')).toBeTruthy();
  });
});

describe('DispatchConsoleScreen call filter and actions', () => {
  it('filters every panel to a pressed call and surfaces its actions', async () => {
    await setWindow(1366, 1024);
    await renderConsole();
    expect(screen.queryByTestId('console-call-10')).toBeNull();
    await fireEvent.press(screen.getByTestId('console-call-9'));
    expect(screen.getByTestId('active-call-filter-banner')).toBeTruthy();
    expect(mocks.fetchCallDetail).toHaveBeenCalledWith('9', { bypassCache: true });
    expect(screen.getByText('dispatch.units_on_call')).toBeTruthy();
    expect(screen.getByTestId('console-unit-2')).toBeTruthy();
    expect(screen.queryByTestId('console-unit-1')).toBeNull();
    expect(screen.getByTestId('console-person-b')).toBeTruthy();
    expect(screen.getByTestId('console-actions')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('console-action-view-call'));
    expect(router.push).toHaveBeenCalledWith('/call/9');
    await fireEvent.press(screen.getByTestId('activity-tab-activity'));
    expect(within(screen.getByTestId('console-activity-log')).getByText('dispatch.call_filter_active')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('active-call-filter-clear'));
    expect(screen.queryByTestId('active-call-filter-banner')).toBeNull();
  });

  it('opens the close call sheet and the add-resources sheet for the filtered call', async () => {
    await setWindow(1366, 1024);
    await renderConsole();
    await fireEvent.press(screen.getByTestId('console-call-9'));
    await fireEvent.press(screen.getByTestId('console-action-close-call'));
    expect(screen.getByTestId('close-call-sheet', hidden)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('console-call-9-add-resources'));
    expect(screen.getByTestId('add-resources-sheet', hidden)).toBeTruthy();
    expect(screen.getByTestId('add-resources-dispatch', hidden)).toBeDisabled();
  });

  it("keeps close to the Close Call permission and add resources to an admin or the call's reporter", async () => {
    await setWindow(1366, 1024);
    useCallsStore.setState({ calls: [makeCall('9', { Name: 'Kitchen fire', Number: '26-9', Priority: 1, ReportingUserId: 'someone-else' })] });
    setRights({ CanViewPII: true, CanCloseCalls: false });
    const { unmount } = await renderConsole();
    await fireEvent.press(screen.getByTestId('console-call-9'));
    expect(screen.queryByTestId('console-action-close-call')).toBeNull();
    expect(screen.getByTestId('console-action-add-resources')).toBeDisabled();
    expect(screen.queryByTestId('console-call-9-add-resources')).toBeNull();
    await unmount();

    // The call stays selected in the console store.
    setRights({ CanViewPII: true, IsAdmin: true });
    await renderConsole();
    expect(screen.getByTestId('console-action-close-call')).not.toBeDisabled();
    expect(screen.getByTestId('console-action-add-resources')).not.toBeDisabled();
    expect(screen.getByTestId('console-call-9-add-resources')).toBeTruthy();
  });

  it('sets a unit’s status on behalf with the filtered call as the default destination', async () => {
    await setWindow(1366, 1024);
    await renderConsole();
    await fireEvent.press(screen.getByTestId('console-call-9'));
    await fireEvent.press(screen.getByTestId('console-unit-2-status-for-call'));
    expect(screen.getByTestId('console-unit-status-sheet', hidden)).toBeTruthy();
  });

  it('selects a unit, shows its actions and logs it', async () => {
    await setWindow(1366, 1024);
    await renderConsole();
    await fireEvent.press(screen.getByTestId('console-unit-1'));
    expect(screen.getByTestId('console-unit-actions')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('console-unit-set-status'));
    expect(screen.getByTestId('unit-status-sheet', hidden)).toBeTruthy();
    expect(useConsoleStore.getState().activityLog[0]).toMatchObject({ type: 'unit', action: 'dispatch.unit_selected', description: 'E1' });
  });

  it('builds a multi-unit selection for one status change', async () => {
    await setWindow(1366, 1024);
    await renderConsole();
    await fireEvent.press(screen.getByTestId('unit-multi-select-toggle'));
    await fireEvent.press(screen.getByTestId('console-unit-1'));
    await fireEvent.press(screen.getByTestId('console-unit-3'));
    expect(screen.getAllByText('dispatch.bulk_unit_actions.selected_count:2').length).toBeGreaterThan(0);
    expect(screen.getByTestId('console-bulk-actions')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('console-bulk-set-status'));
    expect(screen.getByTestId('console-unit-status-sheet', hidden)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('unit-select-done'));
    expect(useConsoleStore.getState().isSelectionMode).toBe(false);
  });
});

describe('DispatchConsoleScreen realtime, PTT and map', () => {
  it('refetches and logs on SignalR pings', async () => {
    await setWindow(1366, 1024);
    await render(<DispatchConsoleScreen showClock={false} now={() => NOW} />);
    await act(() => emitRealtimeEvent('unitStatusUpdated', '1'));
    expect(mocks.fetchUnitInfos).toHaveBeenCalledWith({ bypassCache: true });
    expect(useConsoleStore.getState().activityLog[0]).toMatchObject({ type: 'unit', description: 'dispatch.unit_status_updated' });
    await act(() => emitRealtimeEvent('callAdded', '11'));
    expect(mocks.fetchCalls).toHaveBeenCalledWith({ bypassCache: true });
    expect(mocks.refreshQueuedCallLists).toHaveBeenCalled();
  });

  it('connects to the default channel, then toggles transmitting and logs it', async () => {
    await setWindow(1366, 1024);
    const { rerender } = await renderConsole();
    expect(screen.getByText('Main Dispatch')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('ptt-talk')));
    expect(mockPtt.connect).toHaveBeenCalledWith(expect.objectContaining({ Id: 'c1' }));
    Object.assign(mockPtt, { isConnected: true, currentChannel: { Id: 'c1', Name: 'Main Dispatch' } });
    await rerender(<DispatchConsoleScreen realtime={false} showClock={false} now={() => NOW} />);
    await act(async () => fireEvent.press(screen.getByTestId('ptt-talk')));
    expect(mockPtt.toggleTransmitting).toHaveBeenCalled();
    expect(useConsoleStore.getState().activityLog[0]).toMatchObject({ action: 'dispatch.ptt_start' });
  });

  it('records radio transmissions from active speakers', async () => {
    await setWindow(1366, 1024);
    await render(<DispatchConsoleScreen showClock={false} now={() => NOW} />);
    const { useLiveKitStore } = jest.requireMock('@resgrid/voice') as { useLiveKitStore: { setState: (state: object) => void } };
    await act(() => useLiveKitStore.setState({ activeSpeakerIdentities: ['a'] }));
    await act(() => useLiveKitStore.setState({ activeSpeakerIdentities: [] }));
    await fireEvent.press(screen.getByTestId('activity-tab-radio'));
    expect(within(screen.getByTestId('console-radio-log')).getByText('Pat a')).toBeTruthy();
  });

  it('shows the department pins and expands to the full map', async () => {
    await setWindow(1366, 1024);
    await renderConsole();
    expect(screen.getByTestId('map-pins-1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('map-expand'));
    expect(router.push).toHaveBeenCalledWith('/map');
  });
});

describe('DispatchConsoleScreen live ETAs', () => {
  const navigation = (UnitId: number, CallId: number) => ({
    UnitId,
    CallId,
    RouteInstanceId: null,
    RouteInstanceStopId: null,
    State: 1,
    EtaUtc: new Date(Date.now() + 4 * 60_000).toISOString(),
    RemainingSeconds: 240,
    RemainingMeters: 3000,
    IsTrafficAware: true,
    Provider: 'valhalla',
    ReportedOn: new Date().toISOString(),
    IsStale: false,
  });

  // Still mounted here (RNTL unmounts after): reset inside act.
  afterEach(async () => {
    await act(() => {
      featureFlagsStore.setState({ flags: {} });
      useNavigationEtaStore.setState(useNavigationEtaStore.getInitialState());
    });
  });

  it('loads the ETAs with Navigation.InApp and shows them on the unit row and the call card', async () => {
    const fetchActiveNavigations = jest.fn(async () => undefined);
    featureFlagsStore.setState({ flags: { 'Navigation.InApp': { enabled: true } } as never, isLoaded: true });
    useNavigationEtaStore.setState({ navigations: { '2': navigation(2, 9) }, serverClockOffsetMs: 0, fetchActiveNavigations });
    await setWindow(1366, 1024);
    await renderConsole();
    expect(fetchActiveNavigations).toHaveBeenCalledWith({ bypassCache: true });
    expect(screen.getByTestId('console-unit-2-eta')).toHaveTextContent('navigation_eta.minutes:4 · navigation_eta.traffic');
    expect(screen.queryByTestId('console-unit-1-eta')).toBeNull();
    expect(within(screen.getByTestId('console-call-9-etas')).getByTestId('navigation-eta-2')).toHaveTextContent('E2 · navigation_eta.minutes:4 · navigation_eta.traffic');
  });

  it('asks for nothing without the department flag', async () => {
    const fetchActiveNavigations = jest.fn(async () => undefined);
    useNavigationEtaStore.setState({ fetchActiveNavigations });
    await setWindow(1366, 1024);
    await renderConsole();
    expect(fetchActiveNavigations).not.toHaveBeenCalled();
    expect(screen.queryByTestId('console-call-9-etas')).toBeNull();
  });
});

describe('DispatchConsoleScreen unit status timers', () => {
  const RESPONDING = 2;
  /** A UTC wire value `seconds` ago (the timers read the real clock). */
  const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
  const fetchAcknowledgements = jest.fn(async () => undefined);
  const timed = (UnitId: string, seconds: number) => unit(UnitId, { CurrentStatus: 'Responding', CurrentStatusBaseType: RESPONDING, CurrentStatusTimestampUtc: ago(seconds), CurrentUnitStateId: 700 + Number(UnitId) });

  // SAFETY: a test fixture; only the acknowledgement fields the timers read are set.
  const seen = (UnitId: string, Level = 2) =>
    ({ UnitStatusAlertAcknowledgementId: `k${UnitId}`, UnitId, UnitStateId: 700 + Number(UnitId), Level, Mode: 0, MutedUntilUtc: null, Note: 'On the radio', AcknowledgedByName: 'Sam', ClearedOnUtc: null }) as never;

  beforeEach(() => {
    fetchAcknowledgements.mockClear();
    useUnitStatusAlertsStore.setState({ acknowledgements: {}, loading: {}, errors: {}, fetchAcknowledgements });
    // SAFETY: a test fixture; only the config fields the timers read are set.
    useDepartmentConfigStore.setState({
      config: { UnitStatusThresholds: [{ BaseType: RESPONDING, WarnSeconds: 120, AlertSeconds: 300 }], UnitStatusAlertNoteRequirement: 0 } as never,
      load: jest.fn(async () => undefined),
    });
    useUnitsStore.setState({ unitInfos: [unit('1'), timed('2', 600), timed('3', 150)] });
  });

  // Still mounted here (RNTL unmounts after): reset inside act.
  afterEach(async () => {
    await act(() => {
      useDepartmentConfigStore.setState({ config: null });
      useUnitStatusAlertsStore.setState({ acknowledgements: {} });
    });
  });

  it('flags units over their timer in the stats bar, their rows and the Unit timers tab, which the tile opens', async () => {
    await setWindow(1366, 1024);
    await renderConsole();
    expect(fetchAcknowledgements).toHaveBeenCalled();
    expect(screen.getByTestId('stat-unit-timers-alert-value')).toHaveTextContent('2');
    expect(screen.getByTestId('console-unit-2-timer-alert')).toHaveTextContent('10m');
    expect(screen.getByTestId('console-unit-3-timer-warn')).toHaveTextContent('2m');
    expect(screen.queryByTestId('console-unit-1-timer-warn')).toBeNull();
    expect(screen.getByTestId('activity-tab-unit-timers-badge')).toHaveTextContent('2');

    await fireEvent.press(screen.getByTestId('stat-unit-timers-alert'));
    expect(useConsoleStore.getState().activeTab).toBe('unit-timers');
    const tab = within(screen.getByTestId('console-unit-timers'));
    expect(tab.getByTestId('unit-alert-row-2')).toBeTruthy();
    expect(tab.getByTestId('unit-alert-row-3')).toBeTruthy();
    // Contacting the unit: its screen is one press away.
    await fireEvent.press(tab.getByTestId('unit-alert-open-2'));
    expect(router.push).toHaveBeenCalledWith('/units/2');
    // A dispatcher acknowledges once contacted.
    await fireEvent.press(tab.getByTestId('unit-alert-row-2'));
    expect(screen.getByTestId('unit-alert-acknowledge-sheet', hidden)).toBeTruthy();
  });

  it('counts only the units nobody has acknowledged and refetches acknowledgements on pushes', async () => {
    useUnitStatusAlertsStore.setState({ acknowledgements: { '2': seen('2') } });
    await setWindow(1366, 1024);
    await renderConsole();
    expect(screen.getByTestId('stat-unit-timers-warn-value')).toHaveTextContent('1');
    expect(screen.getByTestId('console-unit-2-timer-alert-acknowledged')).toBeTruthy();
    fetchAcknowledgements.mockClear();
    await act(() => emitRealtimeEvent('unitStatusAlertUpdated', '3'));
    expect(fetchAcknowledgements).toHaveBeenCalledWith({ bypassCache: true });

    await act(() => useUnitStatusAlertsStore.setState({ acknowledgements: { '2': seen('2'), '3': seen('3', 1) } }));
    expect(screen.queryByTestId('stat-unit-timers-warn')).toBeNull();
    expect(screen.queryByTestId('activity-tab-unit-timers-badge')).toBeNull();
  });

  it('logs a unit crossing its timer, not the ones already over when the console opened', async () => {
    await setWindow(1366, 1024);
    await renderConsole();
    const timerLines = () => useConsoleStore.getState().activityLog.filter((entry) => entry.action.startsWith('dispatch_console.unit_timer'));
    expect(timerLines()).toHaveLength(0);

    await act(() => useUnitsStore.setState({ unitInfos: [timed('1', 400), timed('2', 600), timed('3', 150)] }));
    expect(timerLines()).toEqual([expect.objectContaining({ type: 'unit', action: 'dispatch_console.unit_timer_alert', description: 'E1 · unitAlerts.inStatusFor:Responding,6m', metadata: { unitId: '1' } })]);
  });
});
