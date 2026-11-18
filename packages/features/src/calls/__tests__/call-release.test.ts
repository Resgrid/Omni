import { ApiError, V4FailureError } from '@resgrid/api';
import type { DispatchedEventResultData } from '@resgrid/models';

import type { CallRights } from '../lib/call-permissions';
import {
  type CallResourceLists,
  classifyReleaseError,
  crewOnCall,
  getReleasedPersonnel,
  getReleasedUnits,
  isPersonOnCall,
  isPersonReleasableFromCall,
  isUnitDispatchedToCall,
  isUnitOnCall,
  newerDispatches,
  releaseKindOf,
  type ReleasePermissionInput,
  resolveReleasePermissions,
} from '../lib/call-release';

const NOW = Date.parse('2026-11-16T12:00:00Z');

// SAFETY: dispatch rows carry only the fields the matching reads.
const entry = (Type: string, Id: string, Name: string, extra: Partial<DispatchedEventResultData> = {}) => ({ Type, Id, Name, ...extra }) as DispatchedEventResultData;

const MUG = { UnitId: '45', Name: 'MUG 1' };
const AMBULANCE = { UnitId: '46', Name: 'Ambulance 2' };

describe('who is on a call once some were released', () => {
  const lists: CallResourceLists = {
    callId: '123',
    dispatches: [entry('Unit', '46', 'Ambulance 2'), entry('Group', '7', 'Station 7'), entry('Role', 'r1', 'Paramedic'), entry('User', 'u-direct', 'Pat Direct')],
    releasedUnits: [entry('Unit', '45', 'MUG 1', { ReleasedOn: '2026-11-16T10:32:00Z', ReleasedBy: 'Dana' })],
    releasedPersonnel: [entry('User', 'u-group', 'Sam Group'), entry('User', 'u-role', 'Ria Role'), entry('User', 'u-status', 'Stu Status')],
  };

  it('keeps a released unit off the call although its release status still points at the call', () => {
    expect(isUnitOnCall({ ...MUG, CurrentDestinationId: '123', CurrentDestinationType: 2, ActiveCallId: null }, lists)).toBe(false);
    expect(isUnitOnCall({ ...MUG, CurrentDestinationId: '123', CurrentDestinationType: null }, lists)).toBe(false);
    expect(isUnitOnCall(AMBULANCE, lists)).toBe(true);
    expect(isUnitDispatchedToCall(MUG, lists.dispatches)).toBe(false);
    expect(isUnitDispatchedToCall({ UnitId: '', Name: 'ambulance 2' }, lists.dispatches)).toBe(true);
  });

  it('counts a status pointing at the call, never a station or POI with the same id', () => {
    expect(isUnitOnCall({ UnitId: '9', Name: 'E9', CurrentDestinationId: '123', CurrentDestinationType: 2 }, lists)).toBe(true);
    expect(isUnitOnCall({ UnitId: '9', Name: 'E9', ActiveCallId: '123' }, lists)).toBe(true);
    expect(isUnitOnCall({ UnitId: '9', Name: 'E9', CurrentDestinationId: '123', CurrentDestinationType: 1 }, lists)).toBe(false);
    expect(isUnitOnCall({ UnitId: '9', Name: 'E9', CurrentDestinationId: '123', CurrentDestinationType: 3 }, lists)).toBe(false);
  });

  it('brings a unit dispatched again back onto the call (the new dispatch wins)', () => {
    expect(isUnitOnCall(MUG, { ...lists, dispatches: [...lists.dispatches, entry('Unit', '45', 'MUG 1')] })).toBe(true);
  });

  it('matches people by name, group, role or status and leaves out anyone released', () => {
    expect(isPersonOnCall({ UserId: 'u-direct' }, lists)).toBe(true);
    expect(isPersonOnCall({ UserId: 'u-other-group', GroupId: '7' }, lists)).toBe(true);
    expect(isPersonOnCall({ UserId: 'u-other-role', Roles: ['paramedic'] }, lists)).toBe(true);
    expect(isPersonOnCall({ UserId: 'u-other-status', StatusDestinationId: '123', StatusDestinationType: 2 }, lists)).toBe(true);
    expect(isPersonOnCall({ UserId: 'u-nobody', GroupId: '8', Roles: ['Driver'] }, lists)).toBe(false);

    // Reached through the group or role still on the call, or still pointing at it: released, so off the call.
    expect(isPersonOnCall({ UserId: 'u-group', GroupId: '7' }, lists)).toBe(false);
    expect(isPersonOnCall({ UserId: 'u-role', Roles: ['Paramedic'] }, lists)).toBe(false);
    expect(isPersonOnCall({ UserId: 'u-status', StatusDestinationId: '123', StatusDestinationType: 2 }, lists)).toBe(false);

    // Dispatched by name again: back on the call.
    expect(isPersonOnCall({ UserId: 'u-group', GroupId: '7' }, { ...lists, dispatches: [...lists.dispatches, entry('User', 'u-group', 'Sam Group')] })).toBe(true);
  });

  it('reads the released lists as none from a server that omits them', () => {
    expect(getReleasedUnits({})).toEqual([]);
    expect(getReleasedPersonnel(null)).toEqual([]);
    expect(isUnitOnCall({ ...MUG, CurrentDestinationId: '123' }, { callId: '123', dispatches: [] })).toBe(true);
  });

  it('matches a unit by id when both have one, by name only when one has none', () => {
    // Medic 1 was unit 7 when the dispatch was read; unit 8 has the name now.
    const dispatches = [entry('Unit', '7', 'Medic 1')];

    expect(isUnitDispatchedToCall({ UnitId: '8', Name: 'Medic 1' }, dispatches)).toBe(false);
    expect(isUnitDispatchedToCall({ UnitId: '7', Name: 'Medic 1 (old)' }, dispatches)).toBe(true);
    expect(isUnitDispatchedToCall({ UnitId: '8', Name: 'Medic 1' }, [entry('Unit', '', 'Medic 1')])).toBe(true);
  });

  it('puts the crew of a dispatched unit on the call and lets them be released, unless released already', () => {
    // SAFETY: the crew reads the unit id, name and role seats only.
    const units = [
      {
        UnitId: '46',
        Name: 'Ambulance 2',
        Roles: [
          { RoleId: '1', UserId: 'u-lee', RoleName: 'Driver', Name: 'Lee' },
          { RoleId: '2', UserId: '', RoleName: 'Medic', Name: '' },
        ],
      },
      { UnitId: '45', Name: 'MUG 1', Roles: [{ RoleId: '3', UserId: 'u-mug', RoleName: 'Driver', Name: 'Mo' }] },
    ];

    const withCrew = { ...lists, crewUserIds: crewOnCall(units, lists.dispatches) };

    expect(withCrew.crewUserIds).toEqual(['u-lee']);
    expect(isPersonOnCall({ UserId: 'u-lee' }, withCrew)).toBe(true);
    expect(isPersonReleasableFromCall({ UserId: 'u-lee' }, withCrew)).toBe(true);
    expect(isPersonOnCall({ UserId: 'u-mug' }, withCrew)).toBe(false);
    expect(isPersonReleasableFromCall({ UserId: 'u-lee' }, { ...withCrew, releasedPersonnel: [entry('User', 'u-lee', 'Lee')] })).toBe(false);
  });

  it('releases someone on the call through their status only when the status is typed to the call', () => {
    // An untyped legacy destination may be a station with the call's id: shown on the call, never offered for release.
    expect(isPersonOnCall({ UserId: 'u-legacy', StatusDestinationId: '123', StatusDestinationType: 0 }, lists)).toBe(true);
    expect(isPersonReleasableFromCall({ UserId: 'u-legacy', StatusDestinationId: '123', StatusDestinationType: 0 }, lists)).toBe(false);
    expect(isPersonReleasableFromCall({ UserId: 'u-typed', StatusDestinationId: '123', StatusDestinationType: 2 }, lists)).toBe(true);
    expect(isPersonReleasableFromCall({ UserId: 'u-direct' }, lists)).toBe(true);
  });

  it('reads the newer of two dispatch reads, an empty newer one included', () => {
    const older = { dispatches: [entry('Unit', '46', 'Ambulance 2')], fetchedAt: 100 };
    const newerEmpty = { dispatches: [], fetchedAt: 200 };

    expect(newerDispatches(older, newerEmpty)).toEqual([]);
    expect(newerDispatches({ ...newerEmpty, fetchedAt: 50 }, older)).toBe(older.dispatches);
    expect(newerDispatches({ dispatches: undefined, fetchedAt: 500 }, older)).toBe(older.dispatches);
    expect(newerDispatches({ dispatches: null, fetchedAt: 0 }, { dispatches: undefined, fetchedAt: 0 })).toBeNull();
  });

  it('releases units and people, never a group or role', () => {
    expect(['Unit', 'U', 'User', 'Personnel', 'P', 'Group', 'Role'].map(releaseKindOf)).toEqual(['unit', 'unit', 'personnel', 'personnel', 'personnel', null, null]);
  });
});

describe('who may release from a call', () => {
  const MEMBER: CallRights = { isAdmin: false, canCreateCalls: true, canCloseCalls: true, canDeleteCalls: true };
  const call = { State: 0, DispatchedOnUtc: '2026-11-16T11:00:00Z', ScheduledOnUtc: '', ReportingUserId: 'me' };

  const input = (overrides: Partial<ReleasePermissionInput> = {}): ReleasePermissionInput => ({
    calls: { releaseResources: true, releaseOwnUnit: false },
    statusSubject: 'personnel',
    activeUnitId: null,
    rights: MEMBER,
    userId: 'me',
    call,
    now: NOW,
    ...overrides,
  });

  it('lets a member who may edit the call release anyone where the app releases resources (Dispatch, IC)', () => {
    expect(resolveReleasePermissions(input())).toEqual({ canReleaseAny: true, ownUnitId: null });
    expect(resolveReleasePermissions(input({ userId: 'someone-else' })).canReleaseAny).toBe(false);
    expect(resolveReleasePermissions(input({ userId: 'someone-else', rights: { ...MEMBER, isAdmin: true } })).canReleaseAny).toBe(true);
    expect(resolveReleasePermissions(input({ rights: { ...MEMBER, canCreateCalls: false } })).canReleaseAny).toBe(false);
    expect(resolveReleasePermissions(input({ calls: { releaseResources: false, releaseOwnUnit: false } })).canReleaseAny).toBe(false);
  });

  it('offers a crew its own unit where the app releases it (Unit), without the call-edit right', () => {
    const unit = input({ calls: { releaseResources: false, releaseOwnUnit: true }, statusSubject: 'unit', activeUnitId: '45', rights: { ...MEMBER, canCreateCalls: false } });
    expect(resolveReleasePermissions(unit)).toEqual({ canReleaseAny: false, ownUnitId: '45' });
    expect(resolveReleasePermissions({ ...unit, activeUnitId: null }).ownUnitId).toBeNull();
    expect(resolveReleasePermissions({ ...unit, statusSubject: 'personnel' }).ownUnitId).toBeNull();
  });

  it('releases only from an open call that has gone out', () => {
    for (const state of [1, 2, 8]) expect(resolveReleasePermissions(input({ call: { ...call, State: state } }))).toEqual({ canReleaseAny: false, ownUnitId: null });
    expect(resolveReleasePermissions(input({ call: { ...call, ScheduledOnUtc: '2026-11-17T08:00:00Z', DispatchedOnUtc: '' } })).canReleaseAny).toBe(false);
    expect(resolveReleasePermissions(input({ call: null })).canReleaseAny).toBe(false);
  });
});

describe('a failed release', () => {
  it("shows Core's reason for a refusal, no permission for 401/403, and keeps the dialog for what can work again", () => {
    expect(classifyReleaseError(new ApiError({ kind: 'http', status: 400, data: 'That unit is not dispatched to this call.' }))).toEqual({ kind: 'refused', message: 'That unit is not dispatched to this call.' });
    expect(classifyReleaseError(new ApiError({ kind: 'http', status: 400, data: '<html>error</html>' }))).toEqual({ kind: 'refused', message: null });
    expect(classifyReleaseError(new ApiError({ kind: 'http', status: 401 }))).toEqual({ kind: 'forbidden' });
    expect(classifyReleaseError(new ApiError({ kind: 'http', status: 403 }))).toEqual({ kind: 'forbidden' });
    expect(classifyReleaseError(new ApiError({ kind: 'network' }))).toEqual({ kind: 'offline' });
    expect(classifyReleaseError(new ApiError({ kind: 'http', status: 503 }))).toEqual({ kind: 'retry' });
    expect(classifyReleaseError(new ApiError({ kind: 'http', status: 429 }))).toEqual({ kind: 'retry' });
    expect(classifyReleaseError(new ApiError({ kind: 'timeout' }))).toEqual({ kind: 'retry' });
    expect(classifyReleaseError(new V4FailureError({ Status: 'failure' }))).toEqual({ kind: 'refused', message: null });
  });
});
