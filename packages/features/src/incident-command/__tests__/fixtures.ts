// Board fixtures for the incident-command tests (not a test file).
import { type CommandBoardState, useCommandStore, useCommandSupportStore, usePersonnelStore, useUnitsStore } from '@resgrid/data';
import {
  CommandNodeType,
  type CommandStructureNode,
  type IncidentCommandBoard,
  IncidentCommandStatus,
  type PersonnelInfoResultData,
  type ResourceAssignment,
  ResourceAssignmentKind,
  type UnitResultData,
} from '@resgrid/models';

export const node = (id: string, overrides: Partial<CommandStructureNode> = {}): CommandStructureNode =>
  ({
    CommandStructureNodeId: id,
    IncidentCommandId: 'ic-7',
    DepartmentId: 1,
    CallId: 7,
    NodeType: CommandNodeType.Division,
    Name: `Lane ${id}`,
    SortOrder: 0,
    ...overrides,
  }) as CommandStructureNode;

export const assignment = (id: string, nodeId: string, resourceId: string, overrides: Partial<ResourceAssignment> = {}): ResourceAssignment => ({
  ResourceAssignmentId: id,
  IncidentCommandId: 'ic-7',
  DepartmentId: 1,
  CallId: 7,
  CommandStructureNodeId: nodeId,
  ResourceKind: ResourceAssignmentKind.RealUnit,
  ResourceId: resourceId,
  AssignedByUserId: 'u1',
  AssignedOn: '2026-11-01T11:30:00Z',
  RequirementsWarning: false,
  ...overrides,
});

export const makeBoard = (overrides: Partial<IncidentCommandBoard> = {}): IncidentCommandBoard =>
  ({
    Command: {
      IncidentCommandId: 'ic-7',
      DepartmentId: 1,
      CallId: 7,
      EstablishedByUserId: 'u1',
      EstablishedOn: '2026-11-01T11:00:00Z',
      CurrentCommanderUserId: 'u1',
      IcsLevel: 1,
      Status: IncidentCommandStatus.Active,
      Name: 'Warehouse fire',
    },
    Nodes: [node('n1', { Name: 'Division A', MinUnits: 2 }), node('n2', { Name: 'Rehab', NodeType: CommandNodeType.Group, SortOrder: 1 })],
    Assignments: [assignment('a1', 'n1', 'unit-1'), assignment('a2', '', 'unit-2')],
    Objectives: [],
    Needs: [],
    Timers: [],
    Annotations: [],
    Accountability: [],
    Roles: [],
    Notes: [],
    ...overrides,
  }) as IncidentCommandBoard;

export const boardState = (callId: string, board: IncidentCommandBoard | null, overrides: Partial<CommandBoardState> = {}): CommandBoardState => ({
  callId,
  board,
  adHocUnits: [],
  adHocPersonnel: [],
  isProvisional: false,
  lastRefreshed: 1,
  timeline: [],
  ...overrides,
});

export const unit = (UnitId: string, Name: string, extra: Partial<UnitResultData> = {}): UnitResultData =>
  ({ UnitId, Name, Type: 'Engine', GroupName: 'Station 1', Latitude: '', Longitude: '', ...extra }) as UnitResultData;

export const person = (UserId: string, FirstName: string, LastName: string): PersonnelInfoResultData =>
  ({ UserId, FirstName, LastName, GroupName: 'Station 1', Status: 'Available', Roles: [] }) as unknown as PersonnelInfoResultData;

export const mockDispatch = jest.fn();
export const mockRefreshBoard = jest.fn();
export const mockFetchTimeline = jest.fn();
export const mockEndCommand = jest.fn();
export const mockStartCommand = jest.fn();
export const mockFetchCapabilities = jest.fn();

/** Puts one board in the command store with every network action stubbed. */
export function seedBoard(callId = '7', board: IncidentCommandBoard | null = makeBoard(), overrides: Partial<CommandBoardState> = {}): void {
  mockDispatch.mockResolvedValue({ outcome: 'sent', id: 'e1' });
  mockRefreshBoard.mockResolvedValue(undefined);
  mockFetchTimeline.mockResolvedValue(undefined);
  mockEndCommand.mockResolvedValue({ command: { outcome: 'sent', id: 'c1' }, call: null });
  mockStartCommand.mockResolvedValue({ outcome: 'sent', id: 's1' });
  mockFetchCapabilities.mockResolvedValue(undefined);
  useCommandStore.setState({
    boards: { [callId]: boardState(callId, board, overrides) },
    activeCallId: callId,
    summaries: [],
    loading: {},
    errors: {},
    dispatchCommandEvent: mockDispatch,
    refreshBoard: mockRefreshBoard,
    fetchTimeline: mockFetchTimeline,
    endCommand: mockEndCommand,
    startCommand: mockStartCommand,
    fetchIncidents: jest.fn(async () => undefined),
    syncFromServer: jest.fn(async () => undefined),
  });
  useCommandSupportStore.setState({
    capabilitiesByCall: {},
    definitions: [],
    voiceChannelsByCall: {},
    loading: {},
    errors: {},
    fetchCapabilities: mockFetchCapabilities,
    fetchCommandDefinitions: jest.fn(async () => undefined),
    fetchVoiceChannels: jest.fn(async () => undefined),
  });
  useUnitsStore.setState({ units: [unit('unit-1', 'Engine 1'), unit('unit-2', 'Ladder 2')], unitCurrentStatuses: [], fetchUnits: jest.fn(async () => undefined) });
  usePersonnelStore.setState({ personnel: [person('u1', 'Pat', 'Chief'), person('u2', 'Sam', 'Lee')], fetchPersonnel: jest.fn(async () => undefined) });
}
