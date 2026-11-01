import { IC_EVENT } from '@resgrid/data';
import { CommandNodeType, IncidentCapabilities, IncidentCommandStatus, IncidentTimerStatus, ParStatus, ResourceAssignmentKind, TacticalObjectiveOutcome } from '@resgrid/models';

import {
  accountabilityCounts,
  decideAssignment,
  formatCountdown,
  isCommandClosed,
  laneStaffing,
  nextSortOrder,
  orderLanes,
  parseCoordinates,
  poolAssignments,
  sceneElapsed,
  sortAccountability,
  timerDueInSeconds,
  workTimeLevel,
  workTimeMinutes,
} from '../lib/board';
import { addLaneEvent, addNoteEvent, assignResourceEvent, completeObjectiveEvent, moveResourceEvent, objectiveProgressEvent, startTimerEvent, updateLaneEvent } from '../lib/events';
import { ALL_INCIDENT_ROLES, incidentRoleName, nodeTypeName, parStatusAction, safeColor } from '../lib/labels';
import { annotationShapes, incidentSites, initialMapCenter, resourceMarkers } from '../lib/map-features';
import { resolveCommandPermissions } from '../lib/permissions';
import { incidentCommandNav } from '../nav';
import { INCIDENT_COMMAND_ROUTE_PATTERNS, incidentCommandRoutes } from '../routes';
import { assignment, makeBoard, node } from './fixtures';

const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${Object.values(options).join(',')}` : key);
const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);

describe('labels', () => {
  it('names every ICS position and falls back for unknown ones', () => {
    expect(ALL_INCIDENT_ROLES).toHaveLength(31);
    expect(incidentRoleName(t, 7)).toBe('incident_command.role_type_7');
    expect(incidentRoleName(t, 99)).toBe('incident_command.role_generic:99');
    expect(nodeTypeName(t, CommandNodeType.Staging)).toBe('incident_command.node_type_6');
    expect(nodeTypeName(t, 42)).toBe('incident_command.node_type_unknown');
  });

  it('maps PAR status and rejects unsafe colours', () => {
    expect(parStatusAction(ParStatus.Critical)).toBe('error');
    expect(parStatusAction('Something')).toBe('muted');
    expect(safeColor('#12ab34')).toBe('#12ab34');
    expect(safeColor('red; background:url(x)')).toBe('#3b82f6');
    expect(safeColor(undefined, '#000')).toBe('#000');
  });
});

describe('board rules', () => {
  it('orders lanes by hierarchy and sort order, skipping deleted ones', () => {
    const lanes = orderLanes([node('b', { SortOrder: 2 }), node('a', { SortOrder: 1 }), node('child', { ParentNodeId: 'a', SortOrder: 0 }), node('gone', { DeletedOn: '2026-11-01T10:00:00Z' })]);
    expect(lanes.map((lane) => [lane.node.CommandStructureNodeId, lane.depth])).toEqual([
      ['a', 0],
      ['child', 1],
      ['b', 0],
    ]);
    expect(nextSortOrder([node('a', { SortOrder: 4 })])).toBe(5);
  });

  it('computes staffing, the pool and closed state', () => {
    const rows = [assignment('a1', 'n1', 'u1'), assignment('a2', 'n1', 'p1', { ResourceKind: ResourceAssignmentKind.RealPersonnel })];
    expect(laneStaffing(node('n1', { MinUnits: 2, MaxUnits: 1 }), rows)).toEqual({ units: 1, isUnderstaffed: true, isFull: true });
    expect(poolAssignments([assignment('a1', '', 'u1'), assignment('a2', 'n1', 'u2')]).map((row) => row.ResourceAssignmentId)).toEqual(['a1']);
    expect(isCommandClosed(makeBoard({ Command: { ...makeBoard().Command, Status: IncidentCommandStatus.Closed } }))).toBe(true);
  });

  it('dedupes PAR rows per member and sorts the most urgent first', () => {
    const rows = [
      { UserId: 'a', FullName: 'Ann', Status: ParStatus.Green },
      { UserId: 'b', FullName: 'Bob', Status: ParStatus.Critical },
      { UserId: 'b', FullName: 'Bob', Status: ParStatus.Critical },
      { UserId: 'c', FullName: 'Cy', Status: ParStatus.Warning },
    ].map((row) => ({ NeedsCheckIn: false, MinutesRemaining: 0, DurationMinutes: 0, WarningThresholdMinutes: 0, ...row }));
    expect(accountabilityCounts(rows)).toEqual({ green: 1, warning: 1, critical: 1, total: 3 });
    expect(sortAccountability(rows).map((row) => row.UserId)).toEqual(['b', 'c', 'a']);
  });

  it('colours work time by lane thresholds (0 disables, rotation wins)', () => {
    expect(workTimeMinutes('2026-11-01T11:35:00', NOW)).toBe(25);
    expect(workTimeMinutes('garbage', NOW)).toBeNull();
    expect(workTimeLevel(25)).toBe('amber');
    expect(workTimeLevel(45)).toBe('red');
    expect(workTimeLevel(45, { WorkTimeRedMinutes: 0, WorkTimeAmberMinutes: 0 })).toBe('green');
    expect(workTimeLevel(30, { MaxTimeInRole: 30 })).toBe('rotation');
  });

  it('decides between assign, move without asking, confirm-move and nothing', () => {
    const rows = [assignment('a1', 'n1', 'u1'), assignment('a2', '', 'u2'), assignment('a3', 'n2', 'u3', { ReleasedOn: '2026-11-01T11:00:00Z' })];
    expect(decideAssignment(rows, ResourceAssignmentKind.RealUnit, 'u1', 'n1')).toEqual({ action: 'none' });
    expect(decideAssignment(rows, ResourceAssignmentKind.RealUnit, 'u2', 'n1')).toEqual({ action: 'move', assignmentId: 'a2' });
    expect(decideAssignment(rows, ResourceAssignmentKind.RealUnit, 'u1', 'n2')).toEqual({ action: 'confirm-move', assignmentId: 'a1', fromNodeId: 'n1' });
    expect(decideAssignment(rows, ResourceAssignmentKind.RealUnit, 'u3', 'n1')).toEqual({ action: 'assign' });
  });

  it('counts timers down and formats scene time and coordinates', () => {
    expect(timerDueInSeconds({ Status: IncidentTimerStatus.Running, NextDueOn: '2026-11-01T12:01:30Z' }, NOW)).toBe(90);
    expect(timerDueInSeconds({ Status: IncidentTimerStatus.Acknowledged, NextDueOn: '2026-11-01T12:01:30Z' }, NOW)).toBeNull();
    expect(formatCountdown(90)).toBe('1:30');
    expect(formatCountdown(-65)).toBe('-1:05');
    expect(formatCountdown(3725)).toBe('1:02:05');
    expect(sceneElapsed('2026-11-01T10:55:00Z', NOW)).toBe('1:05');
    expect(parseCoordinates('39.5', '-104.9')).toEqual({ latitude: 39.5, longitude: -104.9 });
    expect(parseCoordinates('0', '0')).toBeNull();
    expect(parseCoordinates('91', '0')).toBeNull();
  });
});

describe('permissions by tier', () => {
  it('view and none never write or show the board', () => {
    for (const tier of ['none', 'view'] as const) {
      expect(resolveCommandPermissions({ tier, capabilities: IncidentCapabilities.All, isClosed: false, canCreateCalls: true })).toMatchObject({
        canViewBoard: false,
        canEstablish: false,
        canManageCommand: false,
        canAssignResources: false,
      });
    }
  });

  it('command can do everything until the command is closed', () => {
    expect(resolveCommandPermissions({ tier: 'command', isClosed: false, canCreateCalls: false })).toMatchObject({
      canViewBoard: true,
      canEstablish: true,
      canManageCommand: true,
      canManageStructure: true,
      canManageTimers: true,
    });
    expect(resolveCommandPermissions({ tier: 'command', isClosed: true, canCreateCalls: false })).toMatchObject({ canViewBoard: true, canManageCommand: false, canAssignResources: false });
  });

  it('assist follows the server capabilities and is read-only until they load', () => {
    expect(resolveCommandPermissions({ tier: 'assist', isClosed: false, canCreateCalls: true })).toMatchObject({ canViewBoard: true, canEstablish: true, canManageCommand: false, canAssignResources: false });
    const ops = resolveCommandPermissions({
      tier: 'assist',
      capabilities: IncidentCapabilities.ViewBoard | IncidentCapabilities.AssignResources | IncidentCapabilities.ManageObjectives,
      isClosed: false,
      canCreateCalls: false,
    });
    expect(ops).toMatchObject({ canEstablish: false, canAssignResources: true, canManageObjectives: true, canManageStructure: false, canManageCommand: false, canAddNotes: true });
  });
});

describe('event builders', () => {
  const now = new Date(NOW);

  it('creates carry resolveCommandId and an optimistic row', () => {
    expect(addLaneEvent('7', { name: ' Division B ', nodeType: CommandNodeType.Division, color: '#ef4444', minUnits: 2, sortOrder: 3 })).toEqual({
      type: IC_EVENT.saveNode,
      payload: expect.objectContaining({
        callId: '7',
        resolveCommandId: true,
        local: { collection: 'Nodes', idField: 'CommandStructureNodeId' },
        body: expect.objectContaining({ CallId: 7, Name: 'Division B', NodeType: 0, Color: '#ef4444', MinUnits: 2, SortOrder: 3 }),
      }),
    });
    expect(assignResourceEvent('7', '', ResourceAssignmentKind.RealUnit, 'u1', now).payload.body).toMatchObject({ CommandStructureNodeId: '', ResourceId: 'u1', AssignedOn: '2026-11-01T12:00:00.000Z' });
    expect(startTimerEvent('7', 'timer-1', 'Air check', 30, now).payload.body).toMatchObject({ IncidentTimerId: 'timer-1', IntervalSeconds: 60, Name: 'Air check' });
    expect(addNoteEvent('7', ' Fire knocked down ', 1, '', now).payload).toMatchObject({ local: { collection: 'Notes' }, body: { Body: 'Fire knocked down', Visibility: 1, Title: null } });
  });

  it('edits and actions keep ids in params/body', () => {
    expect(updateLaneEvent('7', node('n1', { Name: 'Old' }), { Name: 'New' }).payload.body).toMatchObject({ CommandStructureNodeId: 'n1', Name: 'New' });
    expect(moveResourceEvent('7', 'a1', 'n2')).toEqual({ type: IC_EVENT.moveResource, payload: { callId: '7', body: { ResourceAssignmentId: 'a1', TargetNodeId: 'n2' } } });
    expect(completeObjectiveEvent('7', 'o1', TacticalObjectiveOutcome.Partial, ' ')).toEqual({
      type: IC_EVENT.completeObjective,
      payload: { callId: '7', params: { tacticalObjectiveId: 'o1' }, body: { Outcome: 2, Note: null } },
    });
    expect(objectiveProgressEvent('7', 'o1', 140).payload.body).toEqual({ TacticalObjectiveId: 'o1', ProgressPercent: 100 });
  });
});

describe('map features', () => {
  it('parses annotations defensively into shapes and labelled points', () => {
    const base = { IncidentCommandId: 'ic-7', DepartmentId: 1, CallId: 7, AnnotationType: 0, CreatedByUserId: 'u1', CreatedOn: '' };
    const result = annotationShapes([
      {
        ...base,
        IncidentMapAnnotationId: 'line',
        GeoJson: JSON.stringify({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 1],
              [1, 2],
            ],
          },
        }),
      },
      { ...base, IncidentMapAnnotationId: 'pt', GeoJson: JSON.stringify({ type: 'Point', coordinates: [-104.9, 39.5] }), Label: 'Hydrant' },
      { ...base, IncidentMapAnnotationId: 'bad', GeoJson: '{not json' },
      { ...base, IncidentMapAnnotationId: 'deleted', GeoJson: JSON.stringify({ type: 'Point', coordinates: [1, 1] }), DeletedOn: '2026-11-01T10:00:00Z' },
    ]);
    expect(result.shapes.features).toHaveLength(1);
    expect(result.shapes.features[0].properties).toMatchObject({ id: 'line', kind: 'line' });
    expect(result.points).toEqual([{ id: 'pt-0', coordinate: [-104.9, 39.5], label: 'Hydrant' }]);
  });

  it('collects sites, coloured resources and the starting view', () => {
    const board = makeBoard({ Command: { ...makeBoard().Command, CommandPostLatitude: '39.6', CommandPostLongitude: '-104.8', CommandPostLocationText: 'ICP' }, Nodes: [node('n1', { Color: '#ef4444' })] });
    const sites = incidentSites(board, { Latitude: '39.5', Longitude: '-104.9', Address: '1 Main St' });
    expect(sites.map((site) => site.kind)).toEqual(['call', 'command-post']);
    const markers = resourceMarkers(board, (row) => (row.ResourceId === 'unit-1' ? { latitude: 39.55, longitude: -104.85 } : null));
    expect(markers).toEqual([expect.objectContaining({ coordinate: [-104.85, 39.55], color: '#ef4444' })]);
    expect(initialMapCenter(board, sites, markers)).toEqual({ center: [-104.9, 39.5], zoom: 16 });
    expect(initialMapCenter(null, [], [])).toBeNull();
  });
});

describe('routes and nav', () => {
  it('builds safe hrefs and refuses unsafe ids', () => {
    expect(incidentCommandRoutes.callBoard('7')).toBe('/call/7/command');
    expect(incidentCommandRoutes.log('7')).toBe('/command-log/7');
    expect(incidentCommandRoutes.resourceMap({ latitude: 39.5, longitude: -104.9, title: 'Engine 1', color: '#ef4444' })).toBe('/resource-map?latitude=39.5&longitude=-104.9&title=Engine%201&color=%23ef4444');
    expect(() => incidentCommandRoutes.map('../etc')).toThrow();
    expect(INCIDENT_COMMAND_ROUTE_PATTERNS.callBoard).toBe('/call/[id]/command');
  });

  it('offers the board and incidents only to the command tier', () => {
    const caps = (incidentCommand: 'none' | 'view' | 'assist' | 'command') => ({ incidentCommand }) as never;
    expect(incidentCommandNav.map((entry) => entry.requiresCapability?.(caps('command')))).toEqual([true, true]);
    expect(incidentCommandNav.some((entry) => entry.requiresCapability?.(caps('assist')))).toBe(false);
  });
});
