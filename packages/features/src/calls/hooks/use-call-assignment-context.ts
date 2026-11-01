import { getDataSessionScope, usePersonnelStore, useUnitRolesStore } from '@resgrid/data';
import { useMemo } from 'react';

import type { CallAssignmentContext } from '../lib/call-dispatch';

const unique = (values: readonly (string | null | undefined)[]): string[] => [...new Set(values.map((value) => String(value ?? '').trim()).filter((value) => value.length > 0))];

/**
 * The signed-in user's dispatch identity for the "assigned to me" outline (Responder `buildCallAssignmentContext`):
 * user id, group, personnel roles, and the units they currently ride on (active unit-role seats — a unit dispatch
 * does not list its crew).
 */
export function useCallAssignmentContext(): CallAssignmentContext | null {
  const personnel = usePersonnelStore((state) => state.personnel);
  const seats = useUnitRolesStore((state) => state.roles);
  const userId = getDataSessionScope()?.userId ?? null;

  return useMemo(() => {
    if (!userId) return null;
    const me = personnel.find((person) => person.UserId === userId) ?? null;
    return {
      userId,
      groupId: me?.GroupId || null,
      roleIds: [],
      roleNames: unique(me?.Roles ?? []),
      unitIds: unique(seats.filter((seat) => seat.UserId === userId).map((seat) => seat.UnitId)),
    };
  }, [personnel, seats, userId]);
}
