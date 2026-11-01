import { type ActiveUnitRoleResultData, type SetUnitRolesInput, type UnitRoleResultData } from '@resgrid/models';

/**
 * Crew seat assignment rules (Unit roles sheet): picks are held as pending changes over the server's assignments until
 * Save; a person sits in one seat only, so assigning someone moves them out of the seat they held (on the server or
 * among the pending picks). An empty `userId` is an unassignment and is saved as such.
 */
export interface PendingAssignment {
  roleId: string;
  userId?: string;
}

export interface EffectiveAssignment {
  roleId: string;
  userId: string;
  roleName?: string;
}

const hasUser = (userId: string | null | undefined): userId is string => !!userId && userId.trim() !== '';

/** The pending list after putting `userId` in `roleId` (or clearing it). */
export const applyAssignment = (pending: readonly PendingAssignment[], server: readonly ActiveUnitRoleResultData[], roleId: string, userId?: string): PendingAssignment[] => {
  let updated = pending.filter((assignment) => assignment.roleId !== roleId);
  if (hasUser(userId)) {
    const serverSeat = server.find((assignment) => assignment.UserId === userId && assignment.UnitRoleId !== roleId && hasUser(assignment.UserId));
    if (serverSeat && !updated.some((assignment) => assignment.roleId === serverSeat.UnitRoleId)) {
      updated = [...updated, { roleId: serverSeat.UnitRoleId, userId: undefined }];
    }
    const pendingSeat = updated.find((assignment) => assignment.userId === userId && assignment.roleId !== roleId);
    if (pendingSeat) {
      updated = updated.filter((assignment) => assignment.roleId !== pendingSeat.roleId);
      if (server.some((assignment) => assignment.UnitRoleId === pendingSeat.roleId && hasUser(assignment.UserId))) {
        updated = [...updated, { roleId: pendingSeat.roleId, userId: undefined }];
      }
    }
  }
  return [...updated, { roleId, userId }];
};

/** Who sits in a seat once the pending picks are applied (undefined = empty). */
export const effectiveUserIdFor = (roleId: string, pending: readonly PendingAssignment[], server: readonly ActiveUnitRoleResultData[]): string | undefined => {
  const pick = pending.find((assignment) => assignment.roleId === roleId);
  if (pick) return hasUser(pick.userId) ? pick.userId : undefined;
  const seat = server.find((assignment) => assignment.UnitRoleId === roleId);
  return hasUser(seat?.UserId) ? seat.UserId : undefined;
};

/** Every occupied seat with pending picks applied (for "already in another seat" hints). */
export const getEffectiveAssignments = (seats: readonly UnitRoleResultData[], pending: readonly PendingAssignment[], server: readonly ActiveUnitRoleResultData[]): EffectiveAssignment[] =>
  seats.flatMap((seat) => {
    const userId = effectiveUserIdFor(seat.UnitRoleId, pending, server);
    return userId ? [{ roleId: seat.UnitRoleId, userId, roleName: seat.Name }] : [];
  });

/** The full seat list for `SetRoleAssignmentsForUnit`: every seat of the unit, empty UserId = unassigned. */
export const buildSetUnitRolesInput = (unitId: string, seats: readonly UnitRoleResultData[], pending: readonly PendingAssignment[], server: readonly ActiveUnitRoleResultData[]): SetUnitRolesInput => ({
  UnitId: unitId,
  Roles: seats.filter((seat) => hasUser(seat.UnitRoleId)).map((seat) => ({ RoleId: seat.UnitRoleId, UserId: effectiveUserIdFor(seat.UnitRoleId, pending, server) ?? '', Name: '' })),
});

/** True when the seat requires a personnel role the person does not hold (Core sends the requirement; older servers do not). */
export const isUnqualifiedForSeat = (seat: Pick<UnitRoleResultData, 'PersonnelRoleRequired' | 'PersonnelRoleName'>, personRoles: readonly string[] | null | undefined): boolean =>
  seat.PersonnelRoleRequired === true && !!seat.PersonnelRoleName && !(personRoles ?? []).some((role) => role.trim().toLowerCase() === seat.PersonnelRoleName?.trim().toLowerCase());
