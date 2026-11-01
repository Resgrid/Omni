import { useUnitsStore } from '@resgrid/data';
import type { ResourceAssignment } from '@resgrid/models';

import { isDepartmentUnitKind, parseCoordinates } from '../lib/board';

/**
 * A department unit's last known position for "show on map", read at tap time from the persisted units store (live
 * status position first, then the roster's). Null for personnel, ad-hoc resources and unknown positions.
 */
export function resolveResourcePosition(assignment: Pick<ResourceAssignment, 'ResourceKind' | 'ResourceId'>): { latitude: number; longitude: number } | null {
  if (!isDepartmentUnitKind(assignment.ResourceKind)) return null;
  const { units, unitCurrentStatuses } = useUnitsStore.getState();
  const status = unitCurrentStatuses.find((candidate) => candidate.UnitId === assignment.ResourceId);
  const unit = units.find((candidate) => candidate.UnitId === assignment.ResourceId);
  return parseCoordinates(status?.Latitude ?? unit?.Latitude, status?.Longitude ?? unit?.Longitude) ?? parseCoordinates(unit?.Latitude, unit?.Longitude);
}
