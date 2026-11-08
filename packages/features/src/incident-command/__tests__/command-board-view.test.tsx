import './test-setup';

import { featureFlagsStore, securityStore } from '@resgrid/auth';
import { IC_EVENT, useCommandSupportStore } from '@resgrid/data';
import type { DepartmentRightsResultData } from '@resgrid/models';
import { IncidentCapabilities, IncidentCommandStatus, IncidentTimerStatus, ParStatus } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { activateVariant, hidden } from '../../calls/__tests__/test-utils';
import { CommandBoardView } from '../components/command-board-view';
import { SectionCard, SectionGrid } from '../components/section-card';
import { StructureBoard } from '../components/structure-board';
import { orderLanes } from '../lib/board';
import { BOARD_LOG_MAX_HEIGHT, LANE_MIN_HEIGHT } from '../lib/board-layout';
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
  it('shows the incident, lanes with resources, the pool and every section', async () => {
    await render(<CommandBoardView callId="7" tier="command" />);
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
    await render(<CommandBoardView callId="7" tier="command" />);
    await fireEvent.press(screen.getByTestId('structure-add-lane'));
    await fireEvent.changeText(screen.getByTestId('lane-sheet-name', hidden), 'Division C');
    await fireEvent.press(screen.getByTestId('lane-sheet-type-2', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('lane-sheet-submit', hidden)));
    expect(mockDispatch).toHaveBeenCalledWith(IC_EVENT.saveNode, expect.objectContaining({ callId: '7', resolveCommandId: true, body: expect.objectContaining({ Name: 'Division C', NodeType: 2, SortOrder: 2 }) }));
    expect(lastToast()).toMatchObject({ type: 'success', message: 'incident_command.saved' });
  });

  it('moves a resource with tap-to-select then tap-a-lane', async () => {
    await render(<CommandBoardView callId="7" tier="command" />);
    await fireEvent.press(screen.getByTestId('lane-resource-a1'));
    expect(screen.getByTestId('structure-move-banner')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('lane-target-n2')));
    expect(mockDispatch).toHaveBeenCalledWith(IC_EVENT.moveResource, { callId: '7', body: { ResourceAssignmentId: 'a1', TargetNodeId: 'n2' } });
    expect(screen.queryByTestId('structure-move-banner')).toBeNull();
  });

  it('assigns from the pool without asking, and asks before taking a resource from another lane', async () => {
    await render(<CommandBoardView callId="7" tier="command" />);
    await fireEvent.press(screen.getByTestId('lane-assign-n2'));
    await act(async () => fireEvent.press(screen.getByTestId('assign-resource-option-0-unit-2', hidden)));
    expect(mockDispatch).toHaveBeenLastCalledWith(IC_EVENT.moveResource, { callId: '7', body: { ResourceAssignmentId: 'a2', TargetNodeId: 'n2' } });

    await fireEvent.press(screen.getByTestId('lane-assign-n2'));
    await act(async () => fireEvent.press(screen.getByTestId('assign-resource-option-0-unit-1', hidden)));
    expect(screen.getByText('incident_command.move_conflict:Engine 1,Division A,Rehab')).toBeTruthy();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.press(screen.getByTestId('command-move-conflict-confirm')));
    expect(mockDispatch).toHaveBeenLastCalledWith(IC_EVENT.moveResource, { callId: '7', body: { ResourceAssignmentId: 'a1', TargetNodeId: 'n2' } });

    await fireEvent.press(screen.getByTestId('lane-assign-n2'));
    await fireEvent.press(screen.getByTestId('assign-resource-filter-personnel', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('assign-resource-option-1-u2', hidden)));
    expect(mockDispatch).toHaveBeenLastCalledWith(IC_EVENT.assignResource, expect.objectContaining({ body: expect.objectContaining({ CommandStructureNodeId: 'n2', ResourceKind: 1, ResourceId: 'u2' }) }));
  });

  it('says a write is queued when offline', async () => {
    mockDispatch.mockResolvedValueOnce({ outcome: 'queued', id: 'e2' });
    await render(<CommandBoardView callId="7" tier="command" />);
    await fireEvent.press(screen.getByTestId('lane-resource-view-a1'));
    await act(async () => fireEvent.press(screen.getByTestId('resource-sheet-release', hidden)));
    expect(mockDispatch).toHaveBeenCalledWith(IC_EVENT.releaseResource, { callId: '7', params: { resourceAssignmentId: 'a1' } });
    expect(lastToast()).toMatchObject({ type: 'info', message: 'incident_command.queued_offline' });
  });

  it('reports a write the app could not accept (e.g. no IC handler in this scope)', async () => {
    mockDispatch.mockRejectedValueOnce(new Error('unknown type'));
    await render(<CommandBoardView callId="7" tier="command" />);
    await fireEvent.press(screen.getByTestId('lane-resource-view-a1'));
    await act(async () => fireEvent.press(screen.getByTestId('resource-sheet-pool', hidden)));
    expect(lastToast()).toMatchObject({ type: 'error', message: 'incident_command.write_failed' });
  });

  it('ends command and closes the call in the same step', async () => {
    mockEndCommand.mockResolvedValueOnce({ command: { outcome: 'sent', id: 'c1' }, call: { outcome: 'queued', id: 'c2' } });
    const onEnded = jest.fn();
    await render(<CommandBoardView callId="7" tier="command" onEnded={onEnded} />);
    await fireEvent.press(screen.getByTestId('command-end'));
    await fireEvent(screen.getByTestId('end-command-close-call', hidden), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('end-command-close-type-3', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('end-command-dialog-submit', hidden)));
    expect(mockEndCommand).toHaveBeenCalledWith('7', { closeCall: { type: 3, notes: '', sendNotification: true } });
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual(['incident_command.end_command_success', 'incident_command.close_call_queued']);
    expect(onEnded).toHaveBeenCalled();
  });

  it('transfers command to another member (online) and explains a failure', async () => {
    const transferCommand = jest.fn(async () => undefined);
    useCommandSupportStore.setState({ transferCommand });
    await render(<CommandBoardView callId="7" tier="command" />);
    await fireEvent.press(screen.getByTestId('command-transfer'));
    expect(screen.queryByTestId('transfer-sheet-person-u1', hidden)).toBeNull();
    await fireEvent.press(screen.getByTestId('transfer-sheet-person-u2', hidden));
    await fireEvent.changeText(screen.getByTestId('transfer-sheet-notes', hidden), 'Shift change');
    await act(async () => fireEvent.press(screen.getByTestId('transfer-sheet-submit', hidden)));
    expect(transferCommand).toHaveBeenCalledWith('7', 'u2', 'Shift change');
    expect(lastToast()?.message).toBe('incident_command.transfer_success');

    transferCommand.mockRejectedValueOnce(new Error('refused'));
    await fireEvent.press(screen.getByTestId('command-transfer'));
    await fireEvent.press(screen.getByTestId('transfer-sheet-person-u2', hidden));
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
    await render(<CommandBoardView callId="7" tier="command" />);
    await act(async () => fireEvent.press(screen.getByTestId('command-timers-ack-t1')));
    expect(mockDispatch).toHaveBeenCalledWith(IC_EVENT.acknowledgeTimer, { callId: '7', params: { incidentTimerId: 't1' } });

    await fireEvent.press(screen.getByTestId('command-roles-add'));
    await fireEvent.press(screen.getByTestId('role-sheet-role-3', hidden));
    await fireEvent.press(screen.getByTestId('role-sheet-person-u2', hidden));
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
    await render(<CommandBoardView callId="7" tier="command" />);
    await fireEvent.press(screen.getByTestId('command-objectives-item-o1'));
    await fireEvent.press(screen.getByTestId('objective-details-outcome-2', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('objective-details-complete-button', hidden)));
    expect(mockDispatch).toHaveBeenCalledWith(IC_EVENT.completeObjective, { callId: '7', params: { tacticalObjectiveId: 'o1' }, body: { Outcome: 2, Note: null } });
  });

  it('shows PAR counts with one row per member', async () => {
    const par = (UserId: string, Status: string) => ({ UserId, FullName: UserId, Status, NeedsCheckIn: false, MinutesRemaining: 5, DurationMinutes: 20, WarningThresholdMinutes: 15 });
    seedBoard('7', makeBoard({ Accountability: [par('a', ParStatus.Critical), par('a', ParStatus.Critical), par('b', ParStatus.Green)] }));
    await render(<CommandBoardView callId="7" tier="command" />);
    expect(screen.getByText('incident_command.par_count_critical:1')).toBeTruthy();
    expect(screen.getAllByTestId(/^command-accountability-row-/)).toHaveLength(2);
  });

  it('offers the assistant only behind the Ai.Assistant flag', async () => {
    const { unmount } = await render(<CommandBoardView callId="7" tier="command" />);
    expect(screen.queryByTestId('command-assistant')).toBeNull();
    await unmount();
    featureFlagsStore.setState({ flags: { 'Ai.Assistant': { enabled: true } }, isLoaded: true });
    await render(<CommandBoardView callId="7" tier="command" />);
    expect(screen.getByTestId('command-assistant')).toBeTruthy();
  });

  it('is read-only once the command is closed', async () => {
    seedBoard('7', makeBoard({ Command: { ...makeBoard().Command, Status: IncidentCommandStatus.Closed } }));
    await render(<CommandBoardView callId="7" tier="command" />);
    expect(screen.getByTestId('command-header-closed')).toBeTruthy();
    expect(screen.queryByTestId('structure-add-lane')).toBeNull();
    expect(screen.queryByTestId('lane-assign-n1')).toBeNull();
    expect(screen.queryByTestId('command-end')).toBeNull();
  });
});

describe('CommandBoardView — assist tier (Dispatch)', () => {
  beforeEach(() => activateVariant('dispatch'));

  it('reads the member capabilities and stays read-only until they arrive', async () => {
    await render(<CommandBoardView callId="7" />);
    expect(mockFetchCapabilities).toHaveBeenCalledWith('7');
    expect(screen.getByTestId('command-board-view')).toBeTruthy();
    expect(screen.queryByTestId('structure-add-lane')).toBeNull();
    expect(screen.queryByTestId('lane-assign-n1')).toBeNull();
    expect(screen.queryByTestId('command-end')).toBeNull();
    expect(screen.queryByTestId('command-assistant')).toBeNull();
  });

  it('enables exactly the actions the server grants', async () => {
    useCommandSupportStore.setState({ capabilitiesByCall: { '7': IncidentCapabilities.ViewBoard | IncidentCapabilities.AssignResources } });
    await render(<CommandBoardView callId="7" />);
    expect(screen.getByTestId('lane-assign-n1')).toBeTruthy();
    expect(screen.queryByTestId('structure-add-lane')).toBeNull();
    expect(screen.queryByTestId('command-objectives-add')).toBeNull();
    expect(screen.queryByTestId('command-end')).toBeNull();
  });

  it('a commander-level member can end and transfer', async () => {
    useCommandSupportStore.setState({ capabilitiesByCall: { '7': IncidentCapabilities.All } });
    featureFlagsStore.setState({ flags: { 'Ai.Assistant': { enabled: true } }, isLoaded: true });
    await render(<CommandBoardView callId="7" />);
    expect(screen.getByTestId('command-end')).toBeTruthy();
    expect(screen.getByTestId('command-transfer')).toBeTruthy();
    expect(screen.queryByTestId('command-assistant')).toBeNull();
  });
});

const structureProps = {
  roster: { resourceName: () => 'Engine 1', resourceIcon: () => null, leadName: () => null },
  nowMs: Date.now(),
  canManageStructure: false,
  canAssignResources: false,
  onAddLane: jest.fn(),
  onEditLane: jest.fn(),
  onAssignToLane: jest.fn(),
  onMoveResource: jest.fn(),
  onViewResource: jest.fn(),
};

const styleOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

/** Lays the lane row out `width` wide, as the screen would. */
const measureLanes = async (width: number) => {
  await fireEvent(screen.getByTestId('structure-columns'), 'layout', { nativeEvent: { layout: { width, height: 400 } } });
};

describe('StructureBoard columns', () => {
  it('lays lanes out as columns with the pool first on wide layouts', async () => {
    const lanes = orderLanes([node('n1', { Name: 'Division A' })]);
    await render(<StructureBoard {...structureProps} lanes={lanes} assignments={[assignment('a1', 'n1', 'unit-1')]} columns />);
    expect(screen.getByTestId('structure-columns')).toBeTruthy();
    expect(screen.queryByTestId('structure-list')).toBeNull();
    expect(screen.queryByTestId('lane-edit-n1')).toBeNull();
  });

  it('shares the full width between lanes that fit, with no scroll strips, and tiles resources in a wide lane', async () => {
    const lanes = orderLanes([node('n1', { Name: 'Division A' })]);
    await render(<StructureBoard {...structureProps} lanes={lanes} assignments={[assignment('a1', 'n1', 'unit-1'), assignment('a2', 'n1', 'unit-2')]} columns />);
    await measureLanes(1208);

    // Pool + one lane in 1208: 600 each, the full width, and tall enough for a few resources when empty.
    expect(styleOf('lane-pool')).toMatchObject({ width: 600, minHeight: LANE_MIN_HEIGHT, marginLeft: 0 });
    expect(styleOf('lane-n1')).toMatchObject({ width: 600, minHeight: LANE_MIN_HEIGHT, marginLeft: 8 });
    expect(screen.queryByTestId('structure-scroll-left')).toBeNull();
    expect(screen.queryByTestId('structure-scroll-right')).toBeNull();
    // A 600-wide lane holds its resources two across instead of one long column.
    expect(StyleSheet.flatten(screen.getByTestId('lane-resource-a1').parent?.parent?.props.style)).toMatchObject({ width: '50%' });
  });

  it('shows a scroll strip on each side when lanes run past the edge, paging by whole lanes', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    const lanes = orderLanes(['n1', 'n2', 'n3', 'n4'].map((id, index) => node(id, { Name: `Division ${index}`, SortOrder: index })));
    await render(<StructureBoard {...structureProps} lanes={lanes} assignments={[]} columns />);
    await measureLanes(718);

    const scroller = screen.getByTestId('structure-columns-scroll');
    await fireEvent(scroller, 'layout', { nativeEvent: { layout: { width: 646, height: 400 } } });
    await fireEvent(scroller, 'contentSizeChange', 5 * 268 + 4 * 8, 400);

    const left = screen.getByTestId('structure-scroll-left');
    const right = screen.getByRole('button', { name: 'common.scroll_right' });
    expect(left.props.accessibilityState).toMatchObject({ disabled: true });
    expect(right.props.accessibilityState).toMatchObject({ disabled: false });
    expect(styleOf('lane-n1')).toMatchObject({ width: 268 });

    await fireEvent.press(right);
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 552, animated: true });

    await fireEvent.scroll(scroller, { nativeEvent: { contentOffset: { x: 552, y: 0 } } });
    expect(screen.getByTestId('structure-scroll-left').props.accessibilityState).toMatchObject({ disabled: false });
    scrollTo.mockRestore();
  });

  it('stacks lanes in a list on phones', async () => {
    const lanes = orderLanes([node('n1', { Name: 'Division A' })]);
    await render(<StructureBoard {...structureProps} lanes={lanes} assignments={[]} columns={false} />);
    expect(screen.getByTestId('structure-list')).toBeTruthy();
    expect(screen.queryByTestId('structure-columns')).toBeNull();
  });
});

describe('CommandBoardView layout', () => {
  const measureBoard = async (width: number) => {
    await fireEvent(screen.getByTestId('command-board-view'), 'layout', { nativeEvent: { layout: { width, height: 2000 } } });
  };

  const log = (id: string, minute: number) => ({
    CommandLogEntryId: id,
    IncidentCommandId: 'ic-7',
    DepartmentId: 1,
    CallId: 7,
    EntryType: 0,
    Description: `Entry ${id}`,
    OccurredOn: `2026-11-07T10:${String(minute).padStart(2, '0')}:00Z`,
  });

  it('puts the section cards two to a row and the incident log last, across the full width with its own scroll', async () => {
    seedBoard('7', makeBoard(), { timeline: Array.from({ length: 20 }, (_, index) => log(`l${index}`, index)) });
    await render(<CommandBoardView callId="7" tier="command" />);
    await measureBoard(1200);

    expect(screen.getByTestId('structure-columns')).toBeTruthy();

    for (const id of ['command-accountability', 'command-objectives', 'command-needs', 'command-timers', 'command-roles', 'command-notes']) {
      expect(styleOf(id)).toMatchObject({ flexBasis: '40%', flexGrow: 1 });
    }

    // The log is not a grid cell: full width, after every other card, scrolling inside a capped height.
    expect(styleOf('command-log-section')).not.toHaveProperty('flexBasis');
    expect(within(screen.getByTestId('command-sections')).queryByTestId('command-log-section')).toBeNull();
    const order = screen.getByTestId('command-board-view').children;
    const sectionsAt = order.indexOf(screen.getByTestId('command-sections'));

    expect(order.indexOf(screen.getByTestId('command-structure'))).toBeGreaterThan(-1);
    expect(order.indexOf(screen.getByTestId('command-structure'))).toBeLessThan(sectionsAt);
    expect(order.indexOf(screen.getByTestId('command-log-section'))).toBe(sectionsAt + 1);
    expect(styleOf('command-log-section-scroll')).toMatchObject({ maxHeight: BOARD_LOG_MAX_HEIGHT, flexGrow: 0 });
    expect(screen.getByTestId('command-log-section-scroll').props.nestedScrollEnabled).toBe(true);
    // More than the old eight: the list scrolls rather than cutting off at a handful.
    expect(within(screen.getByTestId('command-log-section-scroll')).getAllByTestId(/command-log-section-entry-/)).toHaveLength(20);
  });

  it('stacks everything in one column on a narrow board', async () => {
    await render(<CommandBoardView callId="7" tier="command" />);
    await measureBoard(500);

    expect(screen.getByTestId('structure-list')).toBeTruthy();
    expect(styleOf('command-objectives')).not.toHaveProperty('flexBasis');
  });
});

describe('SectionGrid', () => {
  const Nothing: React.FC = () => null;

  it('gives each card a cell, skips a section that renders nothing, and leaves a card alone on the last row to span it', async () => {
    await render(
      <SectionGrid columns={2} testID="grid">
        <SectionCard title="A" testID="card-a">
          <Text>a</Text>
        </SectionCard>
        <Nothing />
        <SectionCard title="B" testID="card-b">
          <Text>b</Text>
        </SectionCard>
        <SectionCard title="C" testID="card-c">
          <Text>c</Text>
        </SectionCard>
      </SectionGrid>
    );

    expect(styleOf('grid')).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });

    // Two 40% bases share a row; growing fills it, so C (alone on the second row) spans the row.
    for (const id of ['card-a', 'card-b', 'card-c']) expect(styleOf(id)).toMatchObject({ flexBasis: '40%', flexGrow: 1, flexShrink: 1, minWidth: 0 });
  });

  it('keeps cards nested in a grid card out of the grid', async () => {
    await render(
      <SectionGrid columns={2}>
        <SectionCard title="Outer" testID="outer">
          <SectionCard title="Inner" testID="inner">
            <Text>inner</Text>
          </SectionCard>
        </SectionCard>
      </SectionGrid>
    );

    expect(styleOf('inner')).not.toHaveProperty('flexBasis');
  });

  it('lays cards out one per row with one column', async () => {
    await render(
      <SectionGrid columns={1} testID="grid">
        <SectionCard title="A" testID="card-a">
          <Text>a</Text>
        </SectionCard>
      </SectionGrid>
    );

    expect(styleOf('card-a')).not.toHaveProperty('flexBasis');
  });
});
