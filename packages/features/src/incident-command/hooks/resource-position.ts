import { type UnitsState, useUnitsStore } from '@resgrid/data';
import type { ResourceAssignment } from '@resgrid/models';

import { isDepartmentUnitKind, parseCoordinates } from '../lib/board';

/** The units store fields a resource's position comes from. */
export type UnitPositions = Pick<UnitsState, 'units' | 'unitCurrentStatuses'>;

/**
 * A department unit's last known position (live status position first, then the roster's). Null for personnel, ad-hoc
 * resources and unknown positions. "Show on map" reads it at tap time from the persisted units store; a map that draws
 * the markers passes the store fields it subscribes to, so the markers move when the positions change.
 */
export function resolveResourcePosition(assignment: Pick<ResourceAssignment, 'ResourceKind' | 'ResourceId'>, positions: UnitPositions = useUnitsStore.getState()): { latitude: number; longitude: number } | null {
  if (!isDepartmentUnitKind(assignment.ResourceKind)) return null;
  const { units, unitCurrentStatuses } = positions;
  const status = unitCurrentStatuses.find((candidate) => candidate.UnitId === assignment.ResourceId);
  const unit = units.find((candidate) => candidate.UnitId === assignment.ResourceId);
  return parseCoordinates(status?.Latitude ?? unit?.Latitude, status?.Longitude ?? unit?.Longitude) ?? parseCoordinates(unit?.Latitude, unit?.Longitude);
}
