// IC's Field Records context (apps/omni/records-context.ts): the command board's call and this member's active role.
import { IncidentRoleType } from '@resgrid/models';

import { commandRecordsContext } from '../records-context';

jest.mock('@resgrid/auth', () => ({ useAuthStore: jest.fn() }));
jest.mock('@resgrid/data', () => ({ useCommandStore: jest.fn() }));

const role = (userId: string, roleType: IncidentRoleType, removed = false) => ({
  IncidentRoleAssignmentId: `${userId}-${roleType}`,
  IncidentCommandId: 'ic-1',
  DepartmentId: 1,
  CallId: 42,
  UserId: userId,
  RoleType: roleType,
  AssignedByUserId: 'boss',
  AssignedOn: '2026-11-01T00:00:00Z',
  RemovedOn: removed ? '2026-11-01T01:00:00Z' : null,
});

describe('commandRecordsContext', () => {
  it("is the board's call and the member's active command role", () => {
    const roles = [role('other', IncidentRoleType.IncidentCommander), role('me', IncidentRoleType.SafetyOfficer, true), role('me', IncidentRoleType.OperationsSectionChief)];
    expect(commandRecordsContext('42', roles, 'me')).toEqual({ CallId: 42, CommandRole: 'OperationsSectionChief' });
  });

  it('omits the role when the member holds none (or is unknown), and is empty without a valid board call', () => {
    expect(commandRecordsContext('42', [role('other', IncidentRoleType.IncidentCommander)], 'me')).toEqual({ CallId: 42 });
    expect(commandRecordsContext('42', undefined, null)).toEqual({ CallId: 42 });
    expect(commandRecordsContext(null, [], 'me')).toEqual({});
    expect(commandRecordsContext('not-a-call', [], 'me')).toEqual({});
  });
});
