// The Jest setup must load before @resgrid/ui (gluestack, NativeWind): keep this side-effect import first.
import './test-setup';

import { FeatureFlagKeys, featureFlagsStore, useSharedSessionStore } from '@resgrid/auth';
import { useBadgeCountsStore, useCallsStore, useCheckInTimersStore, useUnitRolesStore, useUnitsStore, useUnitStatusStore } from '@resgrid/data';
import { NavigationHandoffProvider } from '@resgrid/features/contacts';
import { useMapLockStore } from '@resgrid/features/map';
import { ActionBaseTypes, StatusProvider } from '@resgrid/features/status';
import type { ActiveUnitRoleResultData, CallResultData, StatusesResultData, UnitInfoResultData, UnitResultData, UnitRoleResultData, UnitTypeStatusResultData } from '@resgrid/models';
import { useAudioStreamStore, useLiveKitStore } from '@resgrid/voice';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

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

const renderSidebar = async (props: { activeUnitId?: string | null; activeCallId?: string | null; holdToConfirm?: boolean; onClear?: () => void; onCallChange?: (id: string) => void } = {}) => {
  const onNavigate = jest.fn();
  await render(
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
  useMapLockStore.setState({ isMapLocked: false });
  useLiveKitStore.setState({ isConnected: false, isTalking: false, currentRoomInfo: null });
  useAudioStreamStore.setState({ currentStream: null, isPlaying: false });
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
  it('asks for an active unit when none is set, with a way to settings', async () => {
    const { onNavigate } = await renderSidebar({ activeUnitId: null });
    expect(screen.getByText('common.noActiveUnit')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('unit-status-panel-settings'));
    expect(router.push).toHaveBeenCalledWith('/settings');
    expect(onNavigate).toHaveBeenCalled();
  });

  it('shows the unit, its current status (by id, in the department colour) and its status buttons', async () => {
    await renderSidebar();
    expect(screen.getByTestId('unit-summary-card-name')).toHaveTextContent('Engine 1');
    expect(screen.getByText('Station 1')).toBeTruthy();
    expect(screen.getByTestId('unit-status-tile-text')).toHaveTextContent('In Quarters');
    expect(screen.getByTestId('unit-status-buttons-current-30')).toBeTruthy();
    expect(screen.getByTestId('unit-status-buttons-31')).toBeTruthy();
  });

  it('lays out the top row like legacy Unit: the unit card beside the status in its colour over the crew seats', async () => {
    const seats: UnitRoleResultData[] = [
      { UnitRoleId: 'r1', UnitId: 'u1', Name: 'Driver' },
      { UnitRoleId: 'r2', UnitId: 'u1', Name: 'Officer' },
    ];

    const assigned: ActiveUnitRoleResultData[] = [{ UnitRoleId: 'r1', UnitId: 'u1', Name: 'Driver', UserId: 'user-1', FullName: 'Pat Doe', UpdatedOn: '' }];

    useUnitRolesStore.setState({ rolesByUnit: { u1: seats }, assignmentsByUnit: { u1: assigned } });
    await renderSidebar();
    const topRow = within(screen.getByTestId('unit-status-panel-top-row'));
    expect(topRow.getByTestId('unit-summary-card')).toBeTruthy();
    expect(topRow.getByTestId('unit-status-tile')).toHaveStyle({ backgroundColor: '#22c55e' });
    expect(topRow.getByTestId('unit-roles-button-status')).toHaveTextContent('roles.status:1,2');
    // The detailed status card and the roles row belong to the full console.
    expect(screen.queryByTestId('unit-current-status')).toBeNull();
    expect(screen.queryByText('roles.tap_to_manage')).toBeNull();
  });

  it('reads "Unknown" with no active unit, as legacy Unit did', async () => {
    await renderSidebar({ activeUnitId: null });
    expect(screen.getByTestId('unit-status-tile-text')).toHaveTextContent('common.unknown');
    expect(screen.queryByTestId('unit-roles-button')).toBeNull();
  });

  it('shows a queued status as pending sync', async () => {
    useUnitStatusStore.setState({ queuedStatuses: { q1: { localId: 'q1', unitId: 'u1', statusType: '31', respondingTo: '', respondingToType: null, note: '', createdAt: 1, state: 'queued' } } });
    await renderSidebar();
    expect(screen.getByTestId('unit-status-tile-pending')).toBeTruthy();
    expect(screen.getByTestId('unit-status-tile-text')).toHaveTextContent('Responding');
  });

  it('locks the map to the unit and unlocks it from the unit card', async () => {
    await renderSidebar();
    const lock = screen.getByTestId('unit-summary-card-map-lock');
    expect(lock).toHaveAccessibleName('map.lock_map');
    await fireEvent.press(lock);
    expect(useMapLockStore.getState().isMapLocked).toBe(true);
    expect(screen.getByTestId('unit-summary-card-map-lock')).toHaveAccessibleName('map.unlock_map');
    await fireEvent.press(screen.getByTestId('unit-summary-card-map-lock'));
    expect(useMapLockStore.getState().isMapLocked).toBe(false);
  });

  it('opens the audio streams and voice channel sheets, lit while a stream plays and a channel is joined', async () => {
    await renderSidebar();
    expect(screen.getByTestId('unit-summary-card-audio-streams')).not.toBeSelected();
    await fireEvent.press(screen.getByTestId('unit-summary-card-audio-streams'));
    expect(useAudioStreamStore.getState().setIsBottomSheetVisible).toHaveBeenCalledWith(true);

    await fireEvent.press(screen.getByTestId('unit-summary-card-voice'));
    await waitFor(() => expect(useLiveKitStore.getState().setIsBottomSheetVisible).toHaveBeenCalledWith(true));
    expect(useLiveKitStore.getState().ensureMicrophonePermission).toHaveBeenCalled();

    await act(() => {
      useAudioStreamStore.setState({ currentStream: { Id: 's1', Name: 'County Fire', Type: 'Scanner', Url: 'https://streams.example.test/s1' }, isPlaying: true });
      useLiveKitStore.setState({ isConnected: true, isTalking: true, currentRoomInfo: { Id: 'c1', Name: 'Command', ConferenceNumber: 1, IsDefault: true, Token: 'token-1' } });
    });
    expect(screen.getByTestId('unit-summary-card-audio-streams')).toBeSelected();
    expect(screen.getByTestId('unit-summary-card-voice')).toBeSelected();
    expect(screen.getByTestId('unit-summary-card-room')).toHaveTextContent('Command');
    expect(screen.getByTestId('unit-summary-card-talking')).toBeTruthy();
  });

  it('opens the unit status sheet on the tapped status', async () => {
    await renderSidebar();
    await fireEvent.press(screen.getByTestId('unit-status-buttons-31'));
    await waitFor(() => expect(screen.getByTestId('unit-status-sheet', hidden)).toBeTruthy());
    expect(useUnitStatusStore.getState().fetchDestinationData).toHaveBeenCalledWith('u1');
  });

  it('uses press-and-hold buttons when the department requires it', async () => {
    await renderSidebar({ holdToConfirm: true });
    expect(screen.getByTestId('unit-status-buttons-hold-31')).toBeTruthy();
    expect(screen.queryByTestId('unit-status-buttons-31')).toBeNull();
  });

  it('shows the active call with directions handed off to the navigation app, and deselects after confirming', async () => {
    const onClear = jest.fn();
    await renderSidebar({ activeCallId: '7', onClear });
    expect(screen.getByTestId('unit-active-call-card')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('unit-active-call-directions'));
    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith({ latitude: 39.5, longitude: -119.8, label: 'Call 7', callId: 7 }));
    expect(screen.queryByTestId('unit-active-call-destination')).toBeNull();

    await fireEvent.press(screen.getByTestId('unit-active-call-deselect'));
    await fireEvent.press(screen.getByTestId('unit-active-call-deselect-dialog-confirm', hidden));
    expect(onClear).toHaveBeenCalled();
  });

  it('hides deselect when the shell cannot clear the active call, and opens call details', async () => {
    const { onNavigate } = await renderSidebar({ activeCallId: '7' });
    expect(screen.queryByTestId('unit-active-call-deselect')).toBeNull();
    await fireEvent.press(screen.getByTestId('unit-active-call-details'));
    expect(router.push).toHaveBeenCalledWith('/call/7');
    expect(onNavigate).toHaveBeenCalled();
  });

  it('picks a new active call from the open calls', async () => {
    const onCallChange = jest.fn();
    useCallsStore.setState({ calls: [makeCall('7'), makeCall('8', { Name: 'Medical' })] });
    await renderSidebar({ onCallChange });
    expect(screen.getByTestId('unit-active-call-none')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('unit-active-call-trigger'));
    await waitFor(() => expect(screen.getByTestId('active-call-sheet-call-8', hidden)).toBeTruthy());
    expect(useCallsStore.getState().fetchCalls).toHaveBeenCalledWith({ bypassCache: true });
    await fireEvent.press(screen.getByTestId('active-call-sheet-call-8', hidden));
    expect(onCallChange).toHaveBeenCalledWith('8');
  });

  it('shows the active call’s most urgent check-in timer', async () => {
    useCallsStore.setState({ calls: [makeCall('7', { CheckInTimersEnabled: true })] });
    useCheckInTimersStore.setState({
      statusesByCall: {
        '7': [
          { TargetType: 1, TargetTypeName: 'Unit', TargetEntityId: '', TargetName: 'Engine 1', UnitId: 1, LastCheckIn: null, DurationMinutes: 20, WarningThresholdMinutes: 15, ElapsedMinutes: 5, Status: 'Ok' },
          { TargetType: 1, TargetTypeName: 'Unit', TargetEntityId: '', TargetName: 'Engine 1', UnitId: 1, LastCheckIn: null, DurationMinutes: 20, WarningThresholdMinutes: 15, ElapsedMinutes: 25, Status: 'Overdue' },
        ],
      },
    });
    await renderSidebar({ activeCallId: '7' });
    expect(screen.getByTestId('unit-check-in-summary-timer')).toBeTruthy();
    expect(useCheckInTimersStore.getState().fetchTimerStatuses).toHaveBeenCalledWith(7);
  });

  it('gates quick actions by department flags and the active unit, and leaves Settings to its tab', async () => {
    await renderSidebar();
    expect(screen.queryByTestId('unit-quick-actions-chat')).toBeNull();
    expect(screen.getByTestId('unit-quick-actions-inventory')).toBeTruthy();
    expect(screen.queryByTestId('unit-quick-actions-settings')).toBeNull();
  });

  const widthOf = (id: string) => StyleSheet.flatten(screen.getByTestId(`unit-quick-actions-${id}`).parent?.props.style).width;

  it('puts chat, checklists and deployments on one row, every other shortcut on a row of its own, and no assistant shortcut', async () => {
    featureFlagsStore.setState({ flags: { [FeatureFlagKeys.ChatSystem]: { enabled: true }, [FeatureFlagKeys.ChecklistsSystem]: { enabled: true }, [FeatureFlagKeys.Deployments]: { enabled: true } }, isLoaded: true });
    await renderSidebar();
    expect(widthOf('chat')).toBe(`${100 / 3}%`);
    expect(widthOf('checklists')).toBe(`${100 / 3}%`);
    expect(widthOf('operations')).toBe(`${100 / 3}%`);
    expect(widthOf('inventory')).toBe('100%');
    expect(screen.queryByTestId('unit-quick-actions-assistant')).toBeNull();
  });

  it('splits the row between the shortcuts the department has', async () => {
    featureFlagsStore.setState({ flags: { [FeatureFlagKeys.ChatSystem]: { enabled: true }, [FeatureFlagKeys.ChecklistsSystem]: { enabled: true } }, isLoaded: true });
    await renderSidebar();
    expect(widthOf('chat')).toBe('50%');
    expect(widthOf('checklists')).toBe('50%');
  });

  // The half-width card is too narrow for three 36 pt buttons and their margins (126 pt): they shrink, never wrap.
  it('keeps the unit card’s round buttons on one row in a narrow card', async () => {
    await renderSidebar();
    const row = screen.getByTestId('unit-summary-card-buttons');
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexDirection: 'row', justifyContent: 'flex-start' });
    expect(StyleSheet.flatten(row.props.style).flexWrap).toBeUndefined();
    await fireEvent(row, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 120, height: 40 } } });

    for (const id of ['map-lock', 'audio-streams', 'voice']) {
      expect(StyleSheet.flatten(screen.getByTestId(`unit-summary-card-${id}`).props.style).width).toBe(34);
    }
  });

  it('opens a flag-enabled quick action and closes the drawer', async () => {
    featureFlagsStore.setState({ flags: { [FeatureFlagKeys.ChatSystem]: { enabled: true } }, isLoaded: true });
    const { onNavigate } = await renderSidebar();
    await fireEvent.press(screen.getByTestId('unit-quick-actions-chat'));
    expect(router.push).toHaveBeenCalledWith('/chat');
    expect(onNavigate).toHaveBeenCalled();
  });

  // The chat shortcut is Unit's Chat menu entry: it carries the unread chat count as the other apps' menus do.
  it('shows unread chat messages on the chat shortcut', async () => {
    featureFlagsStore.setState({ flags: { [FeatureFlagKeys.ChatSystem]: { enabled: true } }, isLoaded: true });
    useBadgeCountsStore.setState({ counts: { chats: 5 } });
    await renderSidebar();
    expect(screen.getByTestId('unit-quick-actions-chat-badge')).toHaveTextContent('5');
    useBadgeCountsStore.setState({ counts: {} });
  });

  it('offers Lock and Switch operator on a shared vehicle session', async () => {
    useSharedSessionStore.setState({ shared: true, operator: 'Pat Doe', installationLabel: 'Engine 1 MDT' });
    await renderSidebar();
    expect(screen.getByText('shared_session.locked_operator:Pat Doe')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('unit-shared-session-lock'));
    expect(mockLock).toHaveBeenCalledWith('explicit');
    await fireEvent.press(screen.getByTestId('unit-shared-session-switch'));
    await fireEvent.press(screen.getByTestId('unit-shared-session-switch-dialog-confirm', hidden));
    await waitFor(() => expect(mockEndShift).toHaveBeenCalledWith(true));
  });

  it('hides the shared-session controls on a personal session', async () => {
    await renderSidebar();
    expect(screen.queryByTestId('unit-shared-session')).toBeNull();
  });
});

describe('StatusButtons', () => {
  const metrics = { buttonMinHeight: 48, labelClassName: 'text-base', statusColumns: 1 };

  it('narrows to the current status’s next statuses until the crew asks for all', async () => {
    const statuses = [option(1, 'Available', { NextIds: [2] }), option(2, 'Responding'), option(3, 'On Scene')];
    await render(<StatusButtons statuses={statuses} currentStatusId="1" holdToConfirm={false} onSelect={jest.fn()} metrics={metrics} />);
    expect(screen.getByTestId('unit-status-buttons-2')).toBeTruthy();
    expect(screen.queryByTestId('unit-status-buttons-3')).toBeNull();
    await fireEvent.press(screen.getByTestId('unit-status-buttons-show-all'));
    expect(screen.getByTestId('unit-status-buttons-3')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('unit-status-buttons-show-next'));
    expect(screen.queryByTestId('unit-status-buttons-3')).toBeNull();
  });

  it('reports the tapped status (not hold-confirmed)', async () => {
    const onSelect = jest.fn();
    await render(<StatusButtons statuses={[option(2, 'Responding')]} currentStatusId={null} holdToConfirm={false} onSelect={onSelect} metrics={metrics} />);
    await fireEvent.press(screen.getByTestId('unit-status-buttons-2'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ Id: 2 }), false);
  });
});

describe('UnitConsoleScreen', () => {
  it('renders the full-screen console with the set-status heading', async () => {
    await render(
      <StatusProvider activeUnitId="u1">
        <UnitConsoleScreen />
      </StatusProvider>
    );
    expect(screen.getByTestId('unit-console-screen')).toBeTruthy();
    expect(screen.getByText('status.set_status')).toBeTruthy();
    expect(screen.getByTestId('unit-status-buttons-31')).toBeTruthy();
  });
});
