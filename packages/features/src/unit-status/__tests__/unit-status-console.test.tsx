// The Jest setup must load before @resgrid/ui (gluestack, NativeWind): keep this side-effect import first.
import './test-setup';

import { FeatureFlagKeys, featureFlagsStore, useSharedSessionStore } from '@resgrid/auth';
import { useCallsStore, useCheckInTimersStore, useUnitRolesStore, useUnitsStore, useUnitStatusStore } from '@resgrid/data';
import { NavigationHandoffProvider } from '@resgrid/features/contacts';
import { ActionBaseTypes, StatusProvider } from '@resgrid/features/status';
import type { CallResultData, StatusesResultData, UnitInfoResultData, UnitResultData, UnitTypeStatusResultData } from '@resgrid/models';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import { StatusButtons } from '../components/status-buttons';
import { UnitStatusSidebar } from '../components/unit-status-sidebar';
import UnitConsoleScreen from '../screens/unit-console';
import { activateUnitVariant, hidden } from './test-helpers';

const mockLock = jest.fn(async () => undefined);
const mockEndShift = jest.fn(async () => undefined);
jest.mock('@resgrid/auth', () => ({
  ...jest.requireActual('@resgrid/auth'),
  lockSharedSession: (...args: unknown[]) => mockLock(...(args as [])),
  endSharedShift: (...args: unknown[]) => mockEndShift(...(args as [])),
}));

const option = (Id: number, Text: string, extra: Partial<StatusesResultData & { NextIds: number[] }> = {}): StatusesResultData =>
  ({ Id, Type: 0, StateId: 0, Text, BColor: '#22c55e', Color: '#ffffff', Gps: false, Note: 0, Detail: 0, ...extra }) as StatusesResultData;

const makeCall = (CallId: string, overrides: Partial<CallResultData> = {}): CallResultData =>
  ({
    CallId,
    Priority: 1,
    Name: `Call ${CallId}`,
    Nature: '',
    Address: `${CallId} Main St`,
    Number: `C-${CallId}`,
    State: 0,
    Type: 'Fire',
    LoggedOnUtc: '2026-11-01T10:00:00Z',
    Latitude: '39.5',
    Longitude: '-119.8',
    Geolocation: '',
    DestinationLatitude: null,
    DestinationLongitude: null,
    DestinationAddress: '',
    DestinationName: '',
    CheckInTimersEnabled: false,
    ...overrides,
  }) as CallResultData;

const navigateTo = jest.fn(async () => true);

const renderSidebar = (props: { activeUnitId?: string | null; activeCallId?: string | null; holdToConfirm?: boolean; onClear?: () => void; onCallChange?: (id: string) => void } = {}) => {
  const onNavigate = jest.fn();
  render(
    <NavigationHandoffProvider value={{ navigateTo }}>
      <StatusProvider
        activeUnitId={props.activeUnitId === undefined ? 'u1' : props.activeUnitId}
        activeCallId={props.activeCallId ?? null}
        holdToConfirm={props.holdToConfirm ?? false}
        onActiveCallChange={props.onCallChange}
      >
        <UnitStatusSidebar onNavigate={onNavigate} onClearActiveCall={props.onClear} />
      </StatusProvider>
    </NavigationHandoffProvider>
  );
  return { onNavigate };
};

beforeEach(() => {
  activateUnitVariant();
  navigateTo.mockClear();
  mockLock.mockClear();
  mockEndShift.mockClear();
  featureFlagsStore.setState({ flags: {}, isLoaded: true });
  useSharedSessionStore.setState({ shared: false, operator: null, installationLabel: null, shiftEndsAt: null });
  useUnitsStore.setState({
    units: [{ UnitId: 'u1', Name: 'Engine 1', Type: 'Engine', GroupName: 'Station 1', CustomStatusSetId: '5' } as UnitResultData],
    unitInfos: [{ UnitId: 'u1', Name: 'Engine 1', CurrentStatusId: '30', CurrentStatus: 'In Quarters', CurrentStatusColor: '#22c55e', CurrentStatusBaseType: ActionBaseTypes.InQuarters } as UnitInfoResultData],
    unitTypeStatuses: [
      { UnitType: '0', StatusId: '0', Statuses: [option(0, 'Available')] },
      { UnitType: 'Engine', StatusId: '5', Statuses: [option(30, 'In Quarters', { BaseType: ActionBaseTypes.InQuarters }), option(31, 'Responding', { BaseType: ActionBaseTypes.Responding, BColor: '#dc2626' })] },
    ] as UnitTypeStatusResultData[],
    fetchUnits: jest.fn(async () => undefined),
    fetchUnitInfos: jest.fn(async () => undefined),
  });
  useUnitStatusStore.setState({
    currentStatusByUnit: {},
    queuedStatuses: {},
    destinationsByUnit: { u1: { calls: [], stations: [], pois: [], poiTypes: [], statuses: [], fetchedAt: Date.now() } },
    fetchCurrentStatus: jest.fn(async () => undefined),
    fetchDestinationData: jest.fn(async () => undefined),
  });
  useUnitRolesStore.setState({ roles: [], rolesByUnit: { u1: [] }, assignmentsByUnit: { u1: [] }, fetchAllForUnit: jest.fn(async () => undefined) });
  useCallsStore.setState({ calls: [makeCall('7')], callPriorities: [], loading: {}, errors: {}, fetchCalls: jest.fn(async () => undefined) });
  useCheckInTimersStore.setState({ statusesByCall: {}, fetchTimerStatuses: jest.fn(async () => undefined) });
});

describe('UnitStatusSidebar', () => {
  it('asks for an active unit when none is set, with a way to settings', () => {
    const { onNavigate } = renderSidebar({ activeUnitId: null });
    expect(screen.getByText('common.noActiveUnit')).toBeTruthy();
    fireEvent.press(screen.getByTestId('unit-status-panel-settings'));
    expect(router.push).toHaveBeenCalledWith('/settings');
    expect(onNavigate).toHaveBeenCalled();
  });

  it('shows the unit, its current status (by id, in the department colour) and its status buttons', () => {
    renderSidebar();
    expect(screen.getByTestId('unit-summary-card-name')).toHaveTextContent('Engine 1');
    expect(screen.getByText('Station 1')).toBeTruthy();
    expect(within(screen.getByTestId('unit-current-status')).getByText('In Quarters')).toBeTruthy();
    expect(screen.getByTestId('unit-status-buttons-current-30')).toBeTruthy();
    expect(screen.getByTestId('unit-status-buttons-31')).toBeTruthy();
    expect(screen.getByTestId('unit-roles-button')).toBeTruthy();
  });

  it('shows a queued status as pending sync', () => {
    useUnitStatusStore.setState({ queuedStatuses: { q1: { localId: 'q1', unitId: 'u1', statusType: '31', respondingTo: '', respondingToType: null, note: '', createdAt: 1, state: 'queued' } } });
    renderSidebar();
    expect(screen.getByTestId('unit-current-status-badge-pending')).toBeTruthy();
    expect(within(screen.getByTestId('unit-current-status')).getByText('Responding')).toBeTruthy();
  });

  it('opens the unit status sheet on the tapped status', async () => {
    renderSidebar();
    fireEvent.press(screen.getByTestId('unit-status-buttons-31'));
    await waitFor(() => expect(screen.getByTestId('unit-status-sheet', hidden)).toBeTruthy());
    expect(useUnitStatusStore.getState().fetchDestinationData).toHaveBeenCalledWith('u1');
  });

  it('uses press-and-hold buttons when the department requires it', () => {
    renderSidebar({ holdToConfirm: true });
    expect(screen.getByTestId('unit-status-buttons-hold-31')).toBeTruthy();
    expect(screen.queryByTestId('unit-status-buttons-31')).toBeNull();
  });

  it('shows the active call with directions handed off to the navigation app, and deselects after confirming', async () => {
    const onClear = jest.fn();
    renderSidebar({ activeCallId: '7', onClear });
    expect(screen.getByTestId('unit-active-call-card')).toBeTruthy();
    fireEvent.press(screen.getByTestId('unit-active-call-directions'));
    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith({ latitude: 39.5, longitude: -119.8, label: 'Call 7' }));
    expect(screen.queryByTestId('unit-active-call-destination')).toBeNull();

    fireEvent.press(screen.getByTestId('unit-active-call-deselect'));
    fireEvent.press(screen.getByTestId('unit-active-call-deselect-dialog-confirm', hidden));
    expect(onClear).toHaveBeenCalled();
  });

  it('hides deselect when the shell cannot clear the active call, and opens call details', () => {
    const { onNavigate } = renderSidebar({ activeCallId: '7' });
    expect(screen.queryByTestId('unit-active-call-deselect')).toBeNull();
    fireEvent.press(screen.getByTestId('unit-active-call-details'));
    expect(router.push).toHaveBeenCalledWith('/call/7');
    expect(onNavigate).toHaveBeenCalled();
  });

  it('picks a new active call from the open calls', async () => {
    const onCallChange = jest.fn();
    useCallsStore.setState({ calls: [makeCall('7'), makeCall('8', { Name: 'Medical' })] });
    renderSidebar({ onCallChange });
    expect(screen.getByTestId('unit-active-call-none')).toBeTruthy();
    fireEvent.press(screen.getByTestId('unit-active-call-trigger'));
    await waitFor(() => expect(screen.getByTestId('active-call-sheet-call-8', hidden)).toBeTruthy());
    expect(useCallsStore.getState().fetchCalls).toHaveBeenCalledWith({ bypassCache: true });
    fireEvent.press(screen.getByTestId('active-call-sheet-call-8', hidden));
    expect(onCallChange).toHaveBeenCalledWith('8');
  });

  it('shows the active call’s most urgent check-in timer', () => {
    useCallsStore.setState({ calls: [makeCall('7', { CheckInTimersEnabled: true })] });
    useCheckInTimersStore.setState({
      statusesByCall: {
        '7': [
          { TargetType: 1, TargetTypeName: 'Unit', TargetEntityId: '', TargetName: 'Engine 1', UnitId: 1, LastCheckIn: null, DurationMinutes: 20, WarningThresholdMinutes: 15, ElapsedMinutes: 5, Status: 'Ok' },
          { TargetType: 1, TargetTypeName: 'Unit', TargetEntityId: '', TargetName: 'Engine 1', UnitId: 1, LastCheckIn: null, DurationMinutes: 20, WarningThresholdMinutes: 15, ElapsedMinutes: 25, Status: 'Overdue' },
        ],
      },
    });
    renderSidebar({ activeCallId: '7' });
    expect(screen.getByTestId('unit-check-in-summary-timer')).toBeTruthy();
    expect(useCheckInTimersStore.getState().fetchTimerStatuses).toHaveBeenCalledWith(7);
  });

  it('gates quick actions by department flags and the active unit', () => {
    renderSidebar();
    expect(screen.queryByTestId('unit-quick-actions-chat')).toBeNull();
    expect(screen.getByTestId('unit-quick-actions-inventory')).toBeTruthy();
    expect(screen.getByTestId('unit-quick-actions-settings')).toBeTruthy();
  });

  it('opens a flag-enabled quick action and closes the drawer', () => {
    featureFlagsStore.setState({ flags: { [FeatureFlagKeys.ChatSystem]: { enabled: true } }, isLoaded: true });
    const { onNavigate } = renderSidebar();
    fireEvent.press(screen.getByTestId('unit-quick-actions-chat'));
    expect(router.push).toHaveBeenCalledWith('/chat');
    expect(onNavigate).toHaveBeenCalled();
  });

  it('offers Lock and Switch operator on a shared vehicle session', async () => {
    useSharedSessionStore.setState({ shared: true, operator: 'Pat Doe', installationLabel: 'Engine 1 MDT' });
    renderSidebar();
    expect(screen.getByText('shared_session.locked_operator:Pat Doe')).toBeTruthy();
    fireEvent.press(screen.getByTestId('unit-shared-session-lock'));
    expect(mockLock).toHaveBeenCalledWith('explicit');
    fireEvent.press(screen.getByTestId('unit-shared-session-switch'));
    fireEvent.press(screen.getByTestId('unit-shared-session-switch-dialog-confirm', hidden));
    await waitFor(() => expect(mockEndShift).toHaveBeenCalledWith(true));
  });

  it('hides the shared-session controls on a personal session', () => {
    renderSidebar();
    expect(screen.queryByTestId('unit-shared-session')).toBeNull();
  });
});

describe('StatusButtons', () => {
  const metrics = { buttonMinHeight: 48, labelClassName: 'text-base', statusColumns: 1 };

  it('narrows to the current status’s next statuses until the crew asks for all', () => {
    const statuses = [option(1, 'Available', { NextIds: [2] }), option(2, 'Responding'), option(3, 'On Scene')];
    render(<StatusButtons statuses={statuses} currentStatusId="1" holdToConfirm={false} onSelect={jest.fn()} metrics={metrics} />);
    expect(screen.getByTestId('unit-status-buttons-2')).toBeTruthy();
    expect(screen.queryByTestId('unit-status-buttons-3')).toBeNull();
    fireEvent.press(screen.getByTestId('unit-status-buttons-show-all'));
    expect(screen.getByTestId('unit-status-buttons-3')).toBeTruthy();
    fireEvent.press(screen.getByTestId('unit-status-buttons-show-next'));
    expect(screen.queryByTestId('unit-status-buttons-3')).toBeNull();
  });

  it('reports the tapped status (not hold-confirmed)', () => {
    const onSelect = jest.fn();
    render(<StatusButtons statuses={[option(2, 'Responding')]} currentStatusId={null} holdToConfirm={false} onSelect={onSelect} metrics={metrics} />);
    fireEvent.press(screen.getByTestId('unit-status-buttons-2'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ Id: 2 }), false);
  });
});

describe('UnitConsoleScreen', () => {
  it('renders the full-screen console with the set-status heading', () => {
    render(
      <StatusProvider activeUnitId="u1">
        <UnitConsoleScreen />
      </StatusProvider>
    );
    expect(screen.getByTestId('unit-console-screen')).toBeTruthy();
    expect(screen.getByText('status.set_status')).toBeTruthy();
    expect(screen.getByTestId('unit-status-buttons-31')).toBeTruthy();
  });
});
