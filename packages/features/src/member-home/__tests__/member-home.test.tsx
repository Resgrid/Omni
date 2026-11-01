/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run before imports, so they require their stand-ins. */
import '../../status/__tests__/test-setup';

import { useAuthStore } from '@resgrid/auth';
import { setDataSessionScopeProvider, useCallsStore, useCheckInTimersStore, usePersonnelStatusStore, usePersonnelStore, useUnitRolesStore, useWeatherAlertsStore } from '@resgrid/data';
import { ActionBaseTypes, StaffingBaseTypes, StatusProvider } from '@resgrid/features/status';
import type { CallResultData, CheckInTimerStatusResultData, PersonnelInfoResultData, StatusesResultData, WeatherAlertResultData } from '@resgrid/models';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { activateTestVariant } from '../../settings/__tests__/variant';
import { HomeStatusButtons } from '../components/home-status-buttons';
import { MEMBER_HOME_TABS, MemberHomeTabsLayout } from '../components/member-home-tabs-layout';
import { registerMemberHomeHookPoints } from '../hook-points';
import { homeStatusOptions, isSystemManagedBuiltInStatus } from '../lib/home-statuses';
import { memberHomeNav } from '../nav';
import { memberHomeRoutes } from '../routes';
import MemberHomeScreen from '../screens/member-home';

jest.mock('@resgrid/location', () => ({
  acquireLocationFix: jest.fn(async () => ({ outcome: 'ok', location: null })),
  getLocationFixErrorMessage: (outcome: string) => `location.${outcome}`,
}));

const q = { includeHiddenElements: true } as const;

const option = (Id: number, Text: string, extra: Partial<StatusesResultData> = {}): StatusesResultData => ({
  Id,
  Type: 0,
  StateId: 0,
  Text,
  BColor: '#16a34a',
  Color: '#ffffff',
  Gps: false,
  Note: 0,
  Detail: 0,
  ...extra,
});
const call = (CallId: string, extra: Partial<CallResultData> = {}): CallResultData =>
  ({ CallId, Name: `Call ${CallId}`, Number: CallId, Address: '1 Main St', State: 0, CheckInTimersEnabled: false, ...extra }) as CallResultData;

const fetchers = {
  fetchPersonnel: jest.fn(async () => undefined),
  fetchStatusOptions: jest.fn(async () => undefined),
  fetchGroups: jest.fn(async () => undefined),
  fetchCurrentStatus: jest.fn(async () => undefined),
  fetchCurrentStaffing: jest.fn(async () => undefined),
  fetchCalls: jest.fn(async () => undefined),
  fetchCallDispatches: jest.fn(async () => undefined),
  fetchActiveAlerts: jest.fn(async () => undefined),
  fetchRoles: jest.fn(async () => undefined),
  fetchGlobalOverdueCount: jest.fn(async () => undefined),
  fetchTimerStatuses: jest.fn(async () => undefined),
  fetchCheckInHistory: jest.fn(async () => undefined),
};

beforeEach(() => {
  Object.values(fetchers).forEach((fn) => fn.mockClear());
  (router.push as jest.Mock).mockClear();
  activateTestVariant('responder');
  useAuthStore.setState({ userId: 'me' });
  setDataSessionScopeProvider(() => ({ server: 'https://api.example.org', departmentId: 1, userId: 'me' }));
  usePersonnelStore.setState({
    statusOptions: [option(1, 'Not Responding', { BaseType: ActionBaseTypes.NotResponding }), option(2, 'Responding', { BaseType: ActionBaseTypes.Responding }), option(5, 'Responding to Station')],
    staffingOptions: [option(0, 'Available', { BaseType: StaffingBaseTypes.Available }), option(5, 'Off Duty', { BaseType: StaffingBaseTypes.OffDuty })],
    groups: [],
    personnel: [{ UserId: 'me', FirstName: 'Pat', LastName: 'Lee', StatusId: '1', Status: 'Not Responding', StaffingId: '0', Staffing: 'Available', Roles: [] } as unknown as PersonnelInfoResultData],
    loading: {},
    fetchPersonnel: fetchers.fetchPersonnel,
    fetchStatusOptions: fetchers.fetchStatusOptions,
    fetchGroups: fetchers.fetchGroups,
  });
  usePersonnelStatusStore.setState({ currentStatus: null, currentStaffing: null, queuedWrites: {}, loading: {}, fetchCurrentStatus: fetchers.fetchCurrentStatus, fetchCurrentStaffing: fetchers.fetchCurrentStaffing });
  useCallsStore.setState({ calls: [], callExtrasById: {}, callDispatches: {}, fetchCalls: fetchers.fetchCalls, fetchCallDispatches: fetchers.fetchCallDispatches });
  useWeatherAlertsStore.setState({ alerts: [], fetchActiveAlerts: fetchers.fetchActiveAlerts });
  useUnitRolesStore.setState({ roles: [], fetchRoles: fetchers.fetchRoles });
  useCheckInTimersStore.setState({
    statusesByCall: {},
    globalOverdueCount: 0,
    fetchGlobalOverdueCount: fetchers.fetchGlobalOverdueCount,
    fetchTimerStatuses: fetchers.fetchTimerStatuses,
    fetchCheckInHistory: fetchers.fetchCheckInHistory,
  });
});

afterAll(() => setDataSessionScopeProvider(null));

describe('home statuses', () => {
  it('hides only the built-in system-managed statuses 4–7', () => {
    expect(isSystemManagedBuiltInStatus(option(5, 'Responding to Station'))).toBe(true);
    expect(isSystemManagedBuiltInStatus(option(5, 'Custom five', { StateId: 12 }))).toBe(false);
    expect(homeStatusOptions([option(1, 'A'), option(4, 'B'), option(8, 'C')]).map((status) => status.Id)).toEqual([1, 8]);
  });
});

describe('MemberHomeScreen', () => {
  it('loads the working set and shows the member status, staffing and status buttons', async () => {
    render(<MemberHomeScreen />);
    await waitFor(() => expect(fetchers.fetchPersonnel).toHaveBeenCalledWith({ bypassCache: false }));
    expect(fetchers.fetchCurrentStatus).toHaveBeenCalled();
    expect(fetchers.fetchCurrentStaffing).toHaveBeenCalled();
    expect(fetchers.fetchCalls).toHaveBeenCalled();
    expect(fetchers.fetchActiveAlerts).toHaveBeenCalled();
    expect(fetchers.fetchRoles).toHaveBeenCalled();
    // Options are loaded already, so they are not refetched on mount.
    expect(fetchers.fetchStatusOptions).not.toHaveBeenCalled();

    expect(screen.getByTestId('user-status-card-text')).toHaveTextContent('Not Responding');
    expect(screen.getByTestId('user-staffing-card-text')).toHaveTextContent('Available');
    expect(screen.getByTestId('status-button-2')).toBeTruthy();
    expect(screen.queryByTestId('status-button-5')).toBeNull();
    expect(screen.getByTestId('status-current-ring-1')).toBeTruthy();
    expect(screen.getByTestId('shared-tab-staffing')).toBeTruthy();
    expect(screen.queryByTestId('shared-tab-call')).toBeNull();
    // The checklists card stays hidden without the Checklists.System flag (unknown flags are disabled).
    expect(screen.queryByTestId('home-due-checks')).toBeNull();
  });

  it('opens the status sheet on the pressed status', () => {
    render(<MemberHomeScreen />);
    fireEvent.press(screen.getByTestId('status-button-2'));
    expect(screen.getByTestId('status-option-2', q)).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
  });

  it('opens the sheet on the staffing tab from the staffing card', () => {
    render(<MemberHomeScreen />);
    fireEvent.press(screen.getByTestId('user-staffing-card-press'));
    expect(screen.getByTestId('personnel-status-sheet-tab-staffing', q)).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
  });

  it('uses hold buttons when the department holds to set status', () => {
    render(
      <StatusProvider holdToConfirm>
        <MemberHomeScreen />
      </StatusProvider>
    );
    expect(screen.getByTestId('status-hold-button-2')).toBeTruthy();
    expect(screen.queryByTestId('status-button-2')).toBeNull();
  });

  it('hides staffing without the staffing capability', () => {
    activateTestVariant('responder', { status: { staffing: false } });
    render(<MemberHomeScreen />);
    expect(screen.queryByTestId('shared-tab-staffing')).toBeNull();
    expect(screen.queryByTestId('user-staffing-card')).toBeNull();
  });

  it('adds the Call tab for the active call with an overdue badge and opens the call', () => {
    useCallsStore.setState({ calls: [call('100', { CheckInTimersEnabled: true })] });
    useCheckInTimersStore.setState({ statusesByCall: { '100': [{ Status: 'Overdue', TargetType: 0, TargetEntityId: 'me' } as unknown as CheckInTimerStatusResultData] } });
    const onClear = jest.fn();
    render(
      <StatusProvider activeCallId="100">
        <MemberHomeScreen onClearActiveCall={onClear} />
      </StatusProvider>
    );
    expect(screen.getByTestId('shared-tab-call-badge')).toBeTruthy();
    fireEvent.press(screen.getByTestId('shared-tab-call'));
    expect(screen.getByText('Call 100 (#100)')).toBeTruthy();
    fireEvent.press(screen.getByTestId('active-call-tab-view-details'));
    expect(router.push).toHaveBeenCalledWith('/call/100');
    fireEvent.press(screen.getByTestId('active-call-tab-clear'));
    expect(onClear).toHaveBeenCalled();
  });

  it('counts open calls, calls the member is on and severe alerts, and links them', async () => {
    useCallsStore.setState({
      calls: [call('100'), call('101'), call('102', { State: 1 })],
      callDispatches: { '100': [{ Id: 'me', Type: 'Personnel', Name: 'Pat Lee' }] } as never,
    });
    useWeatherAlertsStore.setState({ alerts: [{ WeatherAlertId: 'w1', Severity: 0, Status: 0, Event: 'Tornado Warning' } as unknown as WeatherAlertResultData] });
    render(<MemberHomeScreen />);

    expect(screen.getByTestId('summary-active-calls-value')).toHaveTextContent('2');
    expect(screen.getByTestId('summary-calls-im-on-value')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-weather-alerts-value')).toHaveTextContent('1');
    expect(screen.getByTestId('weather-alert-banner')).toBeTruthy();
    await waitFor(() => expect(fetchers.fetchGlobalOverdueCount).toHaveBeenCalled());
    expect(fetchers.fetchCallDispatches).toHaveBeenCalledWith(['100', '101']);

    fireEvent.press(screen.getByTestId('summary-active-calls-press'));
    expect(router.push).toHaveBeenLastCalledWith('/home/calls');
    fireEvent.press(screen.getByTestId('summary-calls-im-on-press'));
    expect(router.push).toHaveBeenLastCalledWith('/home/calls?filter=mine');
    fireEvent.press(screen.getByTestId('summary-weather-alerts-press'));
    expect(router.push).toHaveBeenLastCalledWith('/weather-alerts');
  });

  it('shows the registered due-checks card, and a prop replaces it', () => {
    const unregister = registerMemberHomeHookPoints({ DueChecksCard: () => <Text>due checks card</Text> });
    const { unmount } = render(<MemberHomeScreen />);
    expect(screen.getByText('due checks card')).toBeTruthy();
    unmount();

    const second = render(<MemberHomeScreen dueChecks={<Text>prop card</Text>} />);
    expect(screen.getByText('prop card')).toBeTruthy();
    expect(screen.queryByText('due checks card')).toBeNull();
    second.unmount();
    unregister();
  });

  it('fetches the status options when they are missing', async () => {
    usePersonnelStore.setState({ statusOptions: [] });
    render(<MemberHomeScreen />);
    await waitFor(() => expect(fetchers.fetchStatusOptions).toHaveBeenCalledWith({ bypassCache: false }));
    expect(screen.getByTestId('home-status-buttons-empty')).toBeTruthy();
  });
});

describe('HomeStatusButtons', () => {
  it("offers the current status's next statuses with a way to show all", () => {
    usePersonnelStore.setState({ statusOptions: [option(1, 'Not Responding', { NextIds: [2] } as Partial<StatusesResultData>), option(2, 'Responding'), option(3, 'On Scene')] });
    const onSelect = jest.fn();
    render(<HomeStatusButtons onSelectStatus={onSelect} />);
    expect(screen.queryByTestId('status-button-3')).toBeNull();
    fireEvent.press(screen.getByTestId('home-status-buttons-show-all'));
    expect(screen.getByTestId('status-button-3')).toBeTruthy();
    fireEvent.press(screen.getByTestId('home-status-buttons-show-next'));
    expect(screen.queryByTestId('status-button-3')).toBeNull();
    fireEvent.press(screen.getByTestId('status-button-2'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ Id: 2 }), false);
  });
});

describe('MemberHomeTabsLayout', () => {
  it('declares the four nested tabs with department terms', () => {
    const expoRouter = jest.requireMock('expo-router') as Record<string, unknown>;
    const { View: RNView, Text: RNText } = require('react-native');
    const MockTabs = ({ children }: { children: React.ReactNode }) => <RNView testID="tabs">{children}</RNView>;
    MockTabs.Screen = function MockTabScreen({ name, options }: { name: string; options: { title: string; tabBarButtonTestID: string } }) {
      return <RNText testID={options.tabBarButtonTestID}>{`${name}:${options.title}`}</RNText>;
    };
    expoRouter.Tabs = MockTabs;

    render(<MemberHomeTabsLayout />);
    expect(screen.getByTestId('home-status-tab')).toHaveTextContent('index:tabs.home');
    expect(screen.getByTestId('home-people-tab')).toHaveTextContent('personnel:tabs.personnel');
    expect(screen.getByTestId('home-units-tab')).toHaveTextContent('units:units.title');
    expect(screen.getByTestId('home-calls-tab')).toHaveTextContent('calls:tabs.calls');
    expect(MEMBER_HOME_TABS.map((tab) => tab.name)).toEqual(['index', 'personnel', 'units', 'calls']);
  });
});

describe('member-home routes and nav', () => {
  it('builds the /home routes and registers the home entry for the module', () => {
    expect(memberHomeRoutes.home()).toBe('/home');
    expect(memberHomeRoutes.personnel()).toBe('/home/personnel');
    expect(memberHomeRoutes.calls('mine')).toBe('/home/calls?filter=mine');
    expect(memberHomeNav).toEqual([expect.objectContaining({ id: 'home', href: '/home', requiresModule: 'member-home' })]);
  });
});
