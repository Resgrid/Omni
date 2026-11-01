import './test-setup';

import { featureFlagsStore, securityStore } from '@resgrid/auth';
import { IC_EVENT, useCommandSupportStore } from '@resgrid/data';
import type { DepartmentRightsResultData } from '@resgrid/models';
import { IncidentCapabilities, IncidentCommandStatus, IncidentTimerStatus, ParStatus } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';

import { activateVariant, hidden } from '../../calls/__tests__/test-utils';
import { CommandBoardView } from '../components/command-board-view';
import { StructureBoard } from '../components/structure-board';
import { orderLanes } from '../lib/board';
import { assignment, makeBoard, mockDispatch, mockEndCommand, mockFetchCapabilities, node, seedBoard } from './fixtures';

const lastToast = () => useToastStore.getState().toasts.at(-1);

beforeEach(() => {
  activateVariant('ic');
  useToastStore.getState().clearToasts();
  securityStore.setState({ rights: { CanCreateCalls: true } as DepartmentRightsResultData, isLoaded: true });
  featureFlagsStore.setState({ flags: {}, isLoaded: true });
  seedBoard();
});

describe('CommandBoardView — command tier (IC)', () => {
  it('shows the incident, lanes with resources, the pool and every section', () => {
    render(<CommandBoardView callId="7" tier="command" />);
    expect(screen.getByText('incident_command.call_number:7')).toBeTruthy();
    expect(screen.getByText('Warehouse fire')).toBeTruthy();
    expect(screen.getByText('incident_command.commander_name:Pat Chief')).toBeTruthy();
    expect(screen.getByTestId('lane-n1')).toBeTruthy();
    expect(within(screen.getByTestId('lane-n1')).getByText('Engine 1')).toBeTruthy();
    expect(within(screen.getByTestId('lane-pool')).getByText('Ladder 2')).toBeTruthy();
    expect(screen.getByTestId('lane-understaffed-n1')).toBeTruthy();
    for (const id of ['command-accountability', 'command-objectives', 'command-needs', 'command-timers', 'command-roles', 'command-notes', 'command-log-section']) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.getByTestId('command-end')).toBeTruthy();
    expect(screen.getByTestId('structure-add-lane')).toBeTruthy();
  });

  it('adds a lane through the outbox and confirms when the server accepts it', async () => {
    render(<CommandBoardView callId="7" tier="command" />);
    fireEvent.press(screen.getByTestId('structure-add-lane'));
    fireEvent.changeText(screen.getByTestId('lane-sheet-name', hidden), 'Division C');
    fireEvent.press(screen.getByTestId('lane-sheet-type-2', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('lane-sheet-submit', hidden)));
    expect(mockDispatch).toHaveBeenCalledWith(IC_EVENT.saveNode, expect.objectContaining({ callId: '7', resolveCommandId: true, body: expect.objectContaining({ Name: 'Division C', NodeType: 2, SortOrder: 2 }) }));
    expect(lastToast()).toMatchObject({ type: 'success', message: 'incident_command.saved' });
  });

  it('moves a resource with tap-to-select then tap-a-lane', async () => {
    render(<CommandBoardView callId="7" tier="command" />);
    fireEvent.press(screen.getByTestId('lane-resource-a1'));
    expect(screen.getByTestId('structure-move-banner')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('lane-n2')));
    expect(mockDispatch).toHaveBeenCalledWith(IC_EVENT.moveResource, { callId: '7', body: { ResourceAssignmentId: 'a1', TargetNodeId: 'n2' } });
    expect(screen.queryByTestId('structure-move-banner')).toBeNull();
  });

  it('assigns from the pool without asking, and asks before taking a resource from another lane', async () => {
    render(<CommandBoardView callId="7" tier="command" />);
    fireEvent.press(screen.getByTestId('lane-assign-n2'));
    await act(async () => fireEvent.press(screen.getByTestId('assign-resource-option-0-unit-2', hidden)));
    expect(mockDispatch).toHaveBeenLastCalledWith(IC_EVENT.moveResource, { callId: '7', body: { ResourceAssignmentId: 'a2', TargetNodeId: 'n2' } });

    fireEvent.press(screen.getByTestId('lane-assign-n2'));
    await act(async () => fireEvent.press(screen.getByTestId('assign-resource-option-0-unit-1', hidden)));
    expect(screen.getByText('incident_command.move_conflict:Engine 1,Division A,Rehab')).toBeTruthy();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.press(screen.getByTestId('command-move-conflict-confirm')));
    expect(mockDispatch).toHaveBeenLastCalledWith(IC_EVENT.moveResource, { callId: '7', body: { ResourceAssignmentId: 'a1', TargetNodeId: 'n2' } });

    fireEvent.press(screen.getByTestId('lane-assign-n2'));
    fireEvent.press(screen.getByTestId('assign-resource-filter-personnel', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('assign-resource-option-1-u2', hidden)));
    expect(mockDispatch).toHaveBeenLastCalledWith(IC_EVENT.assignResource, expect.objectContaining({ body: expect.objectContaining({ CommandStructureNodeId: 'n2', ResourceKind: 1, ResourceId: 'u2' }) }));
  });

  it('says a write is queued when offline', async () => {
    mockDispatch.mockResolvedValueOnce({ outcome: 'queued', id: 'e2' });
    render(<CommandBoardView callId="7" tier="command" />);
    fireEvent.press(screen.getByTestId('lane-resource-view-a1'));
    await act(async () => fireEvent.press(screen.getByTestId('resource-sheet-release', hidden)));
    expect(mockDispatch).toHaveBeenCalledWith(IC_EVENT.releaseResource, { callId: '7', params: { resourceAssignmentId: 'a1' } });
    expect(lastToast()).toMatchObject({ type: 'info', message: 'incident_command.queued_offline' });
  });

  it('reports a write the app could not accept (e.g. no IC handler in this scope)', async () => {
    mockDispatch.mockRejectedValueOnce(new Error('unknown type'));
    render(<CommandBoardView callId="7" tier="command" />);
    fireEvent.press(screen.getByTestId('lane-resource-view-a1'));
    await act(async () => fireEvent.press(screen.getByTestId('resource-sheet-pool', hidden)));
    expect(lastToast()).toMatchObject({ type: 'error', message: 'incident_command.write_failed' });
  });

  it('ends command and closes the call in the same step', async () => {
    mockEndCommand.mockResolvedValueOnce({ command: { outcome: 'sent', id: 'c1' }, call: { outcome: 'queued', id: 'c2' } });
    const onEnded = jest.fn();
    render(<CommandBoardView callId="7" tier="command" onEnded={onEnded} />);
    fireEvent.press(screen.getByTestId('command-end'));
    fireEvent(screen.getByTestId('end-command-close-call', hidden), 'valueChange', true);
    fireEvent.press(screen.getByTestId('end-command-close-type-3', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('end-command-dialog-submit', hidden)));
    expect(mockEndCommand).toHaveBeenCalledWith('7', { closeCall: { type: 3, notes: '', sendNotification: true } });
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual(['incident_command.end_command_success', 'incident_command.close_call_queued']);
    expect(onEnded).toHaveBeenCalled();
  });

  it('transfers command to another member (online) and explains a failure', async () => {
    const transferCommand = jest.fn(async () => undefined);
    useCommandSupportStore.setState({ transferCommand });
    render(<CommandBoardView callId="7" tier="command" />);
    fireEvent.press(screen.getByTestId('command-transfer'));
    expect(screen.queryByTestId('transfer-sheet-person-u1', hidden)).toBeNull();
    fireEvent.press(screen.getByTestId('transfer-sheet-person-u2', hidden));
    fireEvent.changeText(screen.getByTestId('transfer-sheet-notes', hidden), 'Shift change');
    await act(async () => fireEvent.press(screen.getByTestId('transfer-sheet-submit', hidden)));
    expect(transferCommand).toHaveBeenCalledWith('7', 'u2', 'Shift change');
    expect(lastToast()?.message).toBe('incident_command.transfer_success');

    transferCommand.mockRejectedValueOnce(new Error('refused'));
    fireEvent.press(screen.getByTestId('command-transfer'));
    fireEvent.press(screen.getByTestId('transfer-sheet-person-u2', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('transfer-sheet-submit', hidden)));
    expect(lastToast()).toMatchObject({ type: 'error', message: 'incident_command.transfer_failed' });
  });

  it('acknowledges a due timer and assigns an ICS position', async () => {
    seedBoard(
      '7',
      makeBoard({
        Timers: [
          {
            IncidentTimerId: 't1',
            IncidentCommandId: 'ic-7',
            DepartmentId: 1,
            CallId: 7,
            TimerType: 3,
            ScopeType: 0,
            Name: 'Air check',
            IntervalSeconds: 600,
            StartedOn: '',
            NextDueOn: '2020-01-01T00:00:00Z',
            Status: IncidentTimerStatus.Due,
          },
        ],
      })
    );
    render(<CommandBoardView callId="7" tier="command" />);
    await act(async () => fireEvent.press(screen.getByTestId('command-timers-ack-t1')));
    expect(mockDispatch).toHaveBeenCalledWith(IC_EVENT.acknowledgeTimer, { callId: '7', params: { incidentTimerId: 't1' } });

    fireEvent.press(screen.getByTestId('command-roles-add'));
    fireEvent.press(screen.getByTestId('role-sheet-role-3', hidden));
    fireEvent.press(screen.getByTestId('role-sheet-person-u2', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('role-sheet-submit', hidden)));
    expect(mockDispatch).toHaveBeenLastCalledWith(IC_EVENT.assignRole, expect.objectContaining({ body: expect.objectContaining({ UserId: 'u2', RoleType: 3 }) }));
  });

  it('completes an objective with an outcome', async () => {
    seedBoard(
      '7',
      makeBoard({
        Objectives: [
          { TacticalObjectiveId: 'o1', IncidentCommandId: 'ic-7', DepartmentId: 1, CallId: 7, Name: 'Primary search', ObjectiveType: 1, Status: 0, AutoPopulated: false, ProgressPercent: 50, Priority: 0, SortOrder: 0 },
        ],
      })
    );
    render(<CommandBoardView callId="7" tier="command" />);
    fireEvent.press(screen.getByTestId('command-objectives-item-o1'));
    fireEvent.press(screen.getByTestId('objective-details-outcome-2', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('objective-details-complete-button', hidden)));
    expect(mockDispatch).toHaveBeenCalledWith(IC_EVENT.completeObjective, { callId: '7', params: { tacticalObjectiveId: 'o1' }, body: { Outcome: 2, Note: null } });
  });

  it('shows PAR counts with one row per member', () => {
    const par = (UserId: string, Status: string) => ({ UserId, FullName: UserId, Status, NeedsCheckIn: false, MinutesRemaining: 5, DurationMinutes: 20, WarningThresholdMinutes: 15 });
    seedBoard('7', makeBoard({ Accountability: [par('a', ParStatus.Critical), par('a', ParStatus.Critical), par('b', ParStatus.Green)] }));
    render(<CommandBoardView callId="7" tier="command" />);
    expect(screen.getByText('incident_command.par_count_critical:1')).toBeTruthy();
    expect(screen.getAllByTestId(/^command-accountability-row-/)).toHaveLength(2);
  });

  it('offers the assistant only behind the Ai.Assistant flag', () => {
    const { unmount } = render(<CommandBoardView callId="7" tier="command" />);
    expect(screen.queryByTestId('command-assistant')).toBeNull();
    unmount();
    featureFlagsStore.setState({ flags: { 'Ai.Assistant': { enabled: true } }, isLoaded: true });
    render(<CommandBoardView callId="7" tier="command" />);
    expect(screen.getByTestId('command-assistant')).toBeTruthy();
  });

  it('is read-only once the command is closed', () => {
    seedBoard('7', makeBoard({ Command: { ...makeBoard().Command, Status: IncidentCommandStatus.Closed } }));
    render(<CommandBoardView callId="7" tier="command" />);
    expect(screen.getByTestId('command-header-closed')).toBeTruthy();
    expect(screen.queryByTestId('structure-add-lane')).toBeNull();
    expect(screen.queryByTestId('lane-assign-n1')).toBeNull();
    expect(screen.queryByTestId('command-end')).toBeNull();
  });
});

describe('CommandBoardView — assist tier (Dispatch)', () => {
  beforeEach(() => activateVariant('dispatch'));

  it('reads the member capabilities and stays read-only until they arrive', () => {
    render(<CommandBoardView callId="7" />);
    expect(mockFetchCapabilities).toHaveBeenCalledWith('7');
    expect(screen.getByTestId('command-board-view')).toBeTruthy();
    expect(screen.queryByTestId('structure-add-lane')).toBeNull();
    expect(screen.queryByTestId('lane-assign-n1')).toBeNull();
    expect(screen.queryByTestId('command-end')).toBeNull();
    expect(screen.queryByTestId('command-assistant')).toBeNull();
  });

  it('enables exactly the actions the server grants', () => {
    useCommandSupportStore.setState({ capabilitiesByCall: { '7': IncidentCapabilities.ViewBoard | IncidentCapabilities.AssignResources } });
    render(<CommandBoardView callId="7" />);
    expect(screen.getByTestId('lane-assign-n1')).toBeTruthy();
    expect(screen.queryByTestId('structure-add-lane')).toBeNull();
    expect(screen.queryByTestId('command-objectives-add')).toBeNull();
    expect(screen.queryByTestId('command-end')).toBeNull();
  });

  it('a commander-level member can end and transfer', () => {
    useCommandSupportStore.setState({ capabilitiesByCall: { '7': IncidentCapabilities.All } });
    featureFlagsStore.setState({ flags: { 'Ai.Assistant': { enabled: true } }, isLoaded: true });
    render(<CommandBoardView callId="7" />);
    expect(screen.getByTestId('command-end')).toBeTruthy();
    expect(screen.getByTestId('command-transfer')).toBeTruthy();
    expect(screen.queryByTestId('command-assistant')).toBeNull();
  });
});

describe('StructureBoard columns', () => {
  it('lays lanes out as columns with the pool first on wide layouts', () => {
    const lanes = orderLanes([node('n1', { Name: 'Division A' })]);
    const roster = { resourceName: () => 'Engine 1', resourceIcon: () => null, leadName: () => null };
    render(
      <StructureBoard
        lanes={lanes}
        assignments={[assignment('a1', 'n1', 'unit-1')]}
        roster={roster}
        nowMs={Date.now()}
        columns
        canManageStructure={false}
        canAssignResources={false}
        onAddLane={jest.fn()}
        onEditLane={jest.fn()}
        onAssignToLane={jest.fn()}
        onMoveResource={jest.fn()}
        onViewResource={jest.fn()}
      />
    );
    expect(screen.getByTestId('structure-columns')).toBeTruthy();
    expect(screen.queryByTestId('structure-list')).toBeNull();
    expect(screen.queryByTestId('lane-edit-n1')).toBeNull();
  });
});
