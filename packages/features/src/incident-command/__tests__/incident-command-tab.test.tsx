import './test-setup';

import { securityStore } from '@resgrid/auth';
import { useCommandStore, useResourceViewStore } from '@resgrid/data';
import type { DepartmentRightsResultData, ResourceIncidentView } from '@resgrid/models';
import { IncidentCommandStatus } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import type { CallDetailTabDefinition } from '../../calls';
import { activateVariant, hidden } from '../../calls/__tests__/test-utils';
import { createIncidentCommandCallTab, INCIDENT_COMMAND_CALL_TAB_ORDER, IncidentCommandTab } from '../components/incident-command-tab';
import { ResourceIncidentPanel } from '../components/resource-incident-panel';
import { makeBoard, mockRefreshBoard, mockStartCommand, seedBoard } from './fixtures';

const view = (overrides: Partial<ResourceIncidentView> = {}): ResourceIncidentView => ({
  IncidentCommandId: 'ic-7',
  CallId: 7,
  Status: 0,
  EstablishedOn: '2026-11-01T11:00:00Z',
  ImportantInformation: 'Collapse zone on side C',
  IncidentActionPlan: 'Defensive operations',
  Commander: { UserId: 'u1', Name: 'Pat Chief', Phone: '555-0100' },
  Objectives: [
    { TacticalObjectiveId: 'o1', IncidentCommandId: 'ic-7', DepartmentId: 1, CallId: 7, Name: 'Primary search', ObjectiveType: 1, Status: 2, AutoPopulated: false, ProgressPercent: 40, Priority: 0, SortOrder: 0 },
  ],
  Needs: [],
  Notes: [
    { IncidentNoteId: 'n1', IncidentCommandId: 'ic-7', DepartmentId: 1, CallId: 7, NoteType: 0, Visibility: 0, Body: 'Knockdown', CreatedByUserId: 'u1', CreatedOn: '2026-11-01T11:30:00Z' },
    {
      IncidentNoteId: 'n2',
      IncidentCommandId: 'ic-7',
      DepartmentId: 1,
      CallId: 7,
      NoteType: 0,
      Visibility: 0,
      Body: 'Removed',
      CreatedByUserId: 'u1',
      CreatedOn: '2026-11-01T11:31:00Z',
      DeletedOn: '2026-11-01T11:32:00Z',
    },
  ],
  Attachments: [],
  MyAssignment: {
    ResourceAssignmentId: 'a1',
    CommandStructureNodeId: 'n1',
    LaneName: 'Division A',
    NodeType: 0,
    Color: '#ef4444',
    AssignedOn: '2026-11-01T11:10:00Z',
    PrimaryLead: { Name: 'External Lead', Phone: '555-0101' },
  },
  ...overrides,
});

const mockFetchIncidentView = jest.fn();

beforeEach(() => {
  useToastStore.getState().clearToasts();
  mockFetchIncidentView.mockReset().mockResolvedValue(undefined);
  securityStore.setState({ rights: { CanCreateCalls: true, CanLoginToCommandApp: true } as DepartmentRightsResultData, isLoaded: true });
  useResourceViewStore.setState({ viewsByCall: {}, loading: {}, errors: {}, fetchIncidentView: mockFetchIncidentView });
});

describe('call detail tab registration', () => {
  it('is visible to every tier but none and slots in after check-in', () => {
    // Structurally a calls-registry definition (typed locally to avoid a feature cycle).
    const tab: CallDetailTabDefinition = createIncidentCommandCallTab();
    expect(tab.order).toBe(INCIDENT_COMMAND_CALL_TAB_ORDER);
    expect(tab.visible?.({ capabilities: { incidentCommand: 'none' } } as never)).toBe(false);
    expect(tab.visible?.({ capabilities: { incidentCommand: 'view' } } as never)).toBe(true);
  });

  it('renders nothing in BigBoard', () => {
    activateVariant('bigboard');
    render(<IncidentCommandTab callId="7" />);
    expect(screen.toJSON()).toBeNull();
  });
});

describe('view tier (Responder/Unit)', () => {
  it('shows the resource slice: assignment, leads, commander, objectives and live notes', () => {
    activateVariant('responder');
    useResourceViewStore.setState({ viewsByCall: { '7': view() } });
    render(<IncidentCommandTab callId="7" />);
    expect(mockFetchIncidentView).toHaveBeenCalledWith('7', null, { bypassCache: false });
    expect(screen.getByTestId('incident-view-panel')).toBeTruthy();
    expect(screen.getByText('Division A')).toBeTruthy();
    expect(screen.getByTestId('incident-view-primary-lead-phone')).toBeTruthy();
    // External leads have no Resgrid account: no message button.
    expect(screen.queryByTestId('incident-view-primary-lead-message')).toBeNull();
    expect(screen.getByTestId('incident-view-commander-message')).toBeTruthy();
    expect(screen.getByText('Collapse zone on side C')).toBeTruthy();
    expect(screen.getByText('Primary search')).toBeTruthy();
    expect(screen.getByText('Knockdown')).toBeTruthy();
    expect(screen.queryByText('Removed')).toBeNull();
    // No board writes in the view tier.
    expect(screen.queryByTestId('command-board-view')).toBeNull();
  });

  it('passes the active unit in the Unit app', () => {
    activateVariant('unit');
    render(<ResourceIncidentPanel callId="7" unitId={12} />);
    expect(mockFetchIncidentView).toHaveBeenCalledWith('7', 12, { bypassCache: false });
  });

  it('treats no command as an empty state and offers a retry after an error', () => {
    activateVariant('responder');
    useResourceViewStore.setState({ viewsByCall: { '7': null } });
    const { unmount } = render(<IncidentCommandTab callId="7" />);
    expect(screen.getByTestId('incident-view-empty')).toBeTruthy();
    unmount();

    useResourceViewStore.setState({ viewsByCall: {}, errors: { view: { code: 'network', message: 'offline' } as never } });
    render(<IncidentCommandTab callId="7" />);
    fireEvent.press(screen.getByTestId('incident-view-retry'));
    expect(mockFetchIncidentView).toHaveBeenLastCalledWith('7', null, { bypassCache: true });
  });
});

describe('assist tier (Dispatch)', () => {
  beforeEach(() => activateVariant('dispatch'));

  it('explains when the member may not work command', () => {
    seedBoard('7', null);
    securityStore.setState({ rights: { CanCreateCalls: true, CanLoginToCommandApp: false } as DepartmentRightsResultData });
    render(<IncidentCommandTab callId="7" />);
    expect(screen.getByTestId('incident-command-tab-not-authorized')).toBeTruthy();
    expect(mockRefreshBoard).not.toHaveBeenCalled();
  });

  it('loads the board and lets a call-taker establish command from a template', async () => {
    seedBoard('7', null);
    render(<IncidentCommandTab callId="7" />);
    expect(mockRefreshBoard).toHaveBeenCalledWith('7', { bypassCache: true });
    fireEvent.press(screen.getByTestId('incident-command-tab-establish'));
    await act(async () => fireEvent.press(screen.getByTestId('start-command-blank', hidden)));
    expect(mockStartCommand).toHaveBeenCalledWith('7', null);
  });

  it('hides establish without CanCreateCalls', () => {
    seedBoard('7', null);
    securityStore.setState({ rights: { CanCreateCalls: false } as DepartmentRightsResultData });
    render(<IncidentCommandTab callId="7" />);
    expect(screen.getByTestId('incident-command-tab-empty')).toBeTruthy();
    expect(screen.queryByTestId('incident-command-tab-establish')).toBeNull();
  });

  it('shows the board with an "open full board" action', () => {
    seedBoard();
    render(<IncidentCommandTab callId="7" />);
    expect(screen.getByTestId('command-board-view')).toBeTruthy();
    fireEvent.press(screen.getByTestId('incident-command-tab-open-full'));
    expect(router.push).toHaveBeenCalledWith('/call/7/command');
  });
});

describe('command tier (IC)', () => {
  beforeEach(() => activateVariant('ic'));

  it('shows a tracked board and opens it on the command tab', () => {
    seedBoard();
    render(<IncidentCommandTab callId="7" />);
    expect(screen.getByTestId('command-board-view')).toBeTruthy();
    fireEvent.press(screen.getByTestId('incident-command-tab-open-board'));
    expect(useCommandStore.getState().activeCallId).toBe('7');
    expect(router.push).toHaveBeenCalledWith('/command');
  });

  it('offers to open an active command this device does not track yet', async () => {
    seedBoard('8', makeBoard());
    useCommandStore.setState({
      summaries: [{ IncidentCommandId: 'ic-7', DepartmentId: 1, CallId: 7, Status: IncidentCommandStatus.Active, EstablishedOn: '', AssignedPersonnelCount: 0, AssignedUnitCount: 0 }],
    });
    mockRefreshBoard.mockImplementation(async (callId: string) => {
      useCommandStore.setState((state) => ({ boards: { ...state.boards, [callId]: { callId, board: makeBoard(), adHocUnits: [], adHocPersonnel: [], isProvisional: false, lastRefreshed: 1 } } }));
    });
    render(<IncidentCommandTab callId="7" />);
    expect(screen.queryByTestId('incident-command-tab-establish')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('incident-command-tab-track')));
    expect(mockRefreshBoard).toHaveBeenCalledWith('7', { bypassCache: true });
    expect(router.push).toHaveBeenCalledWith('/command');
  });

  it('establishes command and goes to the board', async () => {
    seedBoard('8', makeBoard());
    render(<IncidentCommandTab callId="7" />);
    fireEvent.press(screen.getByTestId('incident-command-tab-establish'));
    await act(async () => fireEvent.press(screen.getByTestId('start-command-blank', hidden)));
    expect(mockStartCommand).toHaveBeenCalledWith('7', null);
    expect(router.push).toHaveBeenCalledWith('/command');
  });
});
