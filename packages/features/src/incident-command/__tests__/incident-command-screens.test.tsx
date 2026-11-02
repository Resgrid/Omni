import './test-setup';

import { securityStore } from '@resgrid/auth';
import { useCommandStore, useUnitsStore } from '@resgrid/data';
import type { DepartmentRightsResultData, IncidentCommandSummary } from '@resgrid/models';
import { IncidentCommandStatus } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { activateVariant } from '../../calls/__tests__/test-utils';
import CallCommandScreen from '../screens/call-command';
import CommandBoardScreen from '../screens/command-board';
import CommandLogScreen from '../screens/command-log';
import CommandMapScreen from '../screens/command-map';
import IncidentsListScreen, { matchesIncidentSearch } from '../screens/incidents-list';
import ResourceMapScreen from '../screens/resource-map';
import { boardState, makeBoard, mockFetchTimeline, mockRefreshBoard, node, seedBoard, unit } from './fixtures';

const summary = (callId: number, overrides: Partial<IncidentCommandSummary> = {}): IncidentCommandSummary => ({
  IncidentCommandId: `ic-${callId}`,
  DepartmentId: 1,
  CallId: callId,
  Name: `Incident ${callId}`,
  CallNumber: `26-${callId}`,
  CallAddress: `${callId} Main St`,
  Status: IncidentCommandStatus.Active,
  EstablishedOn: '2026-11-01T11:00:00Z',
  CommanderName: 'Pat Chief',
  AssignedPersonnelCount: 4,
  AssignedUnitCount: 2,
  ...overrides,
});

beforeEach(() => {
  activateVariant('ic');
  useToastStore.getState().clearToasts();
  securityStore.setState({ rights: { CanCreateCalls: true } as DepartmentRightsResultData, isLoaded: true });
  jest.mocked(useFocusEffect).mockImplementation((effect: () => void) => React.useEffect(effect, [effect]));
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  seedBoard();
});

describe('CommandBoardScreen', () => {
  it('shows the active board and refreshes it on focus', async () => {
    await render(<CommandBoardScreen />);
    expect(screen.getByTestId('command-board-view')).toBeTruthy();
    expect(mockRefreshBoard).toHaveBeenCalledWith('7');
    expect(mockFetchTimeline).toHaveBeenCalledWith('7');
    await fireEvent.press(screen.getByTestId('command-open-log'));
    expect(router.push).toHaveBeenCalledWith('/command-log/7');
  });

  it('switches between incidents and ignores empty board entries', async () => {
    useCommandStore.setState({ boards: { '7': boardState('7', makeBoard()), '8': boardState('8', makeBoard()), '9': boardState('9', null) } });
    await render(<CommandBoardScreen />);
    expect(screen.getByTestId('command-board-tab-7')).toBeTruthy();
    expect(screen.queryByTestId('command-board-tab-9')).toBeNull();
    await fireEvent.press(screen.getByTestId('command-board-tab-8'));
    expect(useCommandStore.getState().activeCallId).toBe('8');
  });

  it('shows the empty state without a board and is unavailable outside the command tier', async () => {
    useCommandStore.setState({ boards: {}, activeCallId: null });
    const { unmount } = await render(<CommandBoardScreen />);
    await fireEvent.press(screen.getByTestId('command-go-to-incidents'));
    expect(router.push).toHaveBeenCalledWith('/incidents');
    await unmount();
    await render(<CommandBoardScreen tier="assist" />);
    expect(screen.getByText('incident_command.not_available')).toBeTruthy();
  });
});

describe('IncidentsListScreen', () => {
  it('searches the visible fields', () => {
    expect(matchesIncidentSearch(summary(7), 'main')).toBe(true);
    expect(matchesIncidentSearch(summary(7), 'pat')).toBe(true);
    expect(matchesIncidentSearch(summary(7), 'zzz')).toBe(false);
  });

  it('lists active incidents, filters by search and includes ended ones on request', async () => {
    const fetchIncidents = jest.fn(async () => undefined);
    useCommandStore.setState({ summaries: [summary(7), summary(8, { Status: IncidentCommandStatus.Closed, Name: 'Ended one' })], fetchIncidents });
    await render(<IncidentsListScreen />);
    expect(fetchIncidents).toHaveBeenCalledWith(false);
    expect(screen.getByText('Incident 7')).toBeTruthy();
    expect(screen.queryByText('Ended one')).toBeNull();
    await fireEvent.press(screen.getByTestId('incidents-filter-all'));
    expect(fetchIncidents).toHaveBeenLastCalledWith(true);
    expect(screen.getByText('Ended one')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('incidents-search'), 'nothing');
    expect(screen.getByTestId('incidents-no-results')).toBeTruthy();
  });

  it('opens an active incident on the command board and an ended one at its call', async () => {
    useCommandStore.setState({ summaries: [summary(7), summary(8, { Status: IncidentCommandStatus.Closed })], fetchIncidents: jest.fn(async () => undefined) });
    await render(<IncidentsListScreen />);
    await act(async () => fireEvent.press(screen.getByTestId('incident-card-ic-7')));
    expect(useCommandStore.getState().activeCallId).toBe('7');
    expect(router.push).toHaveBeenCalledWith('/command');
    await fireEvent.press(screen.getByTestId('incidents-filter-all'));
    await act(async () => fireEvent.press(screen.getByTestId('incident-card-ic-8')));
    expect(router.push).toHaveBeenLastCalledWith('/call/8');
  });
});

describe('CommandLogScreen', () => {
  it('lists entries newest first and filters them', async () => {
    useCommandStore.setState({
      boards: {
        '7': boardState('7', makeBoard(), {
          timeline: [
            { CommandLogEntryId: 'l1', IncidentCommandId: 'ic-7', DepartmentId: 1, CallId: 7, EntryType: 0, Description: 'Command established', OccurredOn: '2026-11-01T11:00:00Z' },
            { CommandLogEntryId: 'l2', IncidentCommandId: 'ic-7', DepartmentId: 1, CallId: 7, EntryType: 5, Description: 'Engine 1 assigned to Division A', OccurredOn: '2026-11-01T11:05:00Z' },
          ],
        }),
      },
    });
    await render(<CommandLogScreen callId="7" />);
    expect(mockFetchTimeline).toHaveBeenCalledWith('7');
    expect(screen.getAllByTestId(/^command-log-entry-/).map((row) => row.props.testID)).toEqual(['command-log-entry-l2', 'command-log-entry-l1']);
    await fireEvent.changeText(screen.getByTestId('command-log-search'), 'engine');
    expect(screen.getByText('incident_command.log_results:1,2')).toBeTruthy();
  });

  it('rejects an unsafe route id', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ callId: '../x' });
    await render(<CommandLogScreen />);
    expect(screen.getByTestId('command-log-invalid')).toBeTruthy();
  });
});

describe('CommandMapScreen', () => {
  it('draws the sites and units on the incident', async () => {
    seedBoard('7', makeBoard({ Command: { ...makeBoard().Command, CommandPostLatitude: '39.6', CommandPostLongitude: '-104.8' }, Nodes: [node('n1', { Color: '#ef4444' })] }));
    useUnitsStore.setState({ units: [unit('unit-1', 'Engine 1', { Latitude: '39.61', Longitude: '-104.81' }), unit('unit-2', 'Ladder 2')] });
    await render(<CommandMapScreen callId="7" />);
    expect(screen.getByTestId('command-map-site-command-post')).toBeTruthy();
    expect(screen.getByTestId('command-map-resource-a1')).toBeTruthy();
    expect(screen.queryByTestId('command-map-resource-a2')).toBeNull();
  });

  it('says when there is nothing to place on the map', async () => {
    await render(<CommandMapScreen callId="7" />);
    expect(screen.getByTestId('command-map-no-positions')).toBeTruthy();
  });
});

describe('ResourceMapScreen', () => {
  it('shows a valid position and refuses a bad one', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ latitude: '39.5', longitude: '-104.9', title: 'Engine 1', color: 'javascript:alert(1)' });
    const { unmount } = await render(<ResourceMapScreen />);
    expect(screen.getByTestId('resource-map-marker')).toBeTruthy();
    expect(screen.getByText('Engine 1')).toBeTruthy();
    await unmount();
    jest.mocked(useLocalSearchParams).mockReturnValue({ latitude: 'abc', longitude: '1' });
    await render(<ResourceMapScreen />);
    expect(screen.getByTestId('resource-map-unknown')).toBeTruthy();
  });
});

describe('CallCommandScreen', () => {
  it('hosts the call board full screen without an "open full board" action', async () => {
    activateVariant('dispatch');
    await render(<CallCommandScreen callId="7" />);
    expect(screen.getByTestId('command-board-view')).toBeTruthy();
    expect(screen.queryByTestId('incident-command-tab-open-full')).toBeNull();
  });

  it('rejects an unsafe id', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '../../etc' });
    await render(<CallCommandScreen />);
    expect(screen.getByTestId('call-command-invalid')).toBeTruthy();
  });
});
