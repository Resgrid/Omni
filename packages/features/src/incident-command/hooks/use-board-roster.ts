import { type CommandBoardState, personnelFullName, usePersonnelStore, useUnitsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type ResourceAssignment, ResourceAssignmentKind } from '@resgrid/models';
import { useCallback, useEffect, useMemo } from 'react';

import { activeAssignments, isDepartmentPersonnelKind, isDepartmentUnitKind } from '../lib/board';

/** A resource the commander can place on the board (IC `AssignableResourceOption`). */
export interface AssignableResource {
  kind: ResourceAssignmentKind;
  id: string;
  name: string;
  detail: string;
  /** Unit's current status text (department units). */
  statusLabel?: string;
  typeIconUrl?: string | null;
  typeMapIcon?: string | null;
  /** Where it is placed now: a lane id, '' for the pool, undefined when not on the incident. */
  assignedNodeId?: string;
}

export interface BoardRoster {
  resourceName: (kind: number, resourceId: string) => string;
  resourceIcon: (kind: number, resourceId: string) => { iconUrl?: string | null; mapIcon?: string | null } | null;
  personName: (userId: string | null | undefined) => string;
  /** Lane lead: a Resgrid user resolves to their name; external leads use the entered name. */
  leadName: (userId?: string | null, externalName?: string | null) => string | null;
  options: AssignableResource[];
  /** Department members (role assignment, transfer, chat). */
  people: { userId: string; name: string; detail: string }[];
}

/**
 * Unit and personnel rosters for a board: names for assignments, lane leads and roles, and the assignable resource list
 * (department units and members plus the incident's ad-hoc resources). Loads the rosters once when empty — both stores
 * are persisted, so this works offline from the last sync.
 */
export function useBoardRoster(entry: CommandBoardState | null | undefined): BoardRoster {
  const { t } = useTranslation();
  const units = useUnitsStore((state) => state.units);
  const unitStatuses = useUnitsStore((state) => state.unitCurrentStatuses);
  const personnel = usePersonnelStore((state) => state.personnel);
  const hasBoard = !!entry;

  useEffect(() => {
    if (hasBoard && units.length === 0) void useUnitsStore.getState().fetchUnits();
  }, [hasBoard, units.length]);

  useEffect(() => {
    if (hasBoard && personnel.length === 0) void usePersonnelStore.getState().fetchPersonnel();
  }, [hasBoard, personnel.length]);

  const unitById = useMemo(() => new Map(units.map((unit) => [unit.UnitId, unit])), [units]);
  const personById = useMemo(() => new Map(personnel.map((person) => [person.UserId, person])), [personnel]);

  const personName = useCallback(
    (userId: string | null | undefined) => {
      if (!userId) return t('incident_command.unknown_person');
      const person = personById.get(userId);
      return person ? personnelFullName(person) || t('incident_command.unknown_person') : t('incident_command.unknown_person');
    },
    [personById, t]
  );

  const resourceName = useCallback(
    (kind: number, resourceId: string) => {
      if (isDepartmentUnitKind(kind)) return unitById.get(resourceId)?.Name ?? t('incident_command.unknown_resource');
      if (isDepartmentPersonnelKind(kind)) return personById.has(resourceId) ? personName(resourceId) : t('incident_command.unknown_resource');
      if (kind === ResourceAssignmentKind.AdHocPersonnel) return entry?.adHocPersonnel.find((person) => person.IncidentAdHocPersonnelId === resourceId)?.Name ?? t('incident_command.unknown_resource');
      return entry?.adHocUnits.find((unit) => unit.IncidentAdHocUnitId === resourceId)?.Name ?? t('incident_command.unknown_resource');
    },
    [entry?.adHocPersonnel, entry?.adHocUnits, personById, personName, t, unitById]
  );

  const resourceIcon = useCallback(
    (kind: number, resourceId: string) => {
      if (!isDepartmentUnitKind(kind)) return null;
      const unit = unitById.get(resourceId);
      return unit ? { iconUrl: unit.TypeIconUrl ?? null, mapIcon: unit.TypeMapIcon ?? null } : null;
    },
    [unitById]
  );

  const leadName = useCallback((userId?: string | null, externalName?: string | null) => (userId ? personName(userId) : externalName?.trim() ? externalName.trim() : null), [personName]);

  const options = useMemo<AssignableResource[]>(() => {
    const assignments: ResourceAssignment[] = activeAssignments(entry?.board?.Assignments);
    const placed = (kind: ResourceAssignmentKind, id: string) => {
      const match = assignments.find((assignment) => assignment.ResourceKind === kind && assignment.ResourceId === id);
      return match ? match.CommandStructureNodeId || '' : undefined;
    };
    const unitOptions = units.map<AssignableResource>((unit) => {
      const status = unitStatuses.find((candidate) => candidate.UnitId === unit.UnitId);
      return {
        kind: ResourceAssignmentKind.RealUnit,
        id: unit.UnitId,
        name: unit.Name,
        detail: [unit.Type, unit.GroupName].filter(Boolean).join(' • '),
        statusLabel: status?.State || undefined,
        typeIconUrl: unit.TypeIconUrl ?? null,
        typeMapIcon: unit.TypeMapIcon ?? null,
        assignedNodeId: placed(ResourceAssignmentKind.RealUnit, unit.UnitId),
      };
    });
    const personnelOptions = personnel.map<AssignableResource>((person) => ({
      kind: ResourceAssignmentKind.RealPersonnel,
      id: person.UserId,
      name: personnelFullName(person),
      detail: [person.GroupName, person.Status].filter(Boolean).join(' • '),
      assignedNodeId: placed(ResourceAssignmentKind.RealPersonnel, person.UserId),
    }));
    const adHocUnits = (entry?.adHocUnits ?? []).map<AssignableResource>((unit) => ({
      kind: ResourceAssignmentKind.AdHocUnit,
      id: unit.IncidentAdHocUnitId,
      name: unit.Name,
      detail: [unit.Type, unit.ExternalAgencyName].filter(Boolean).join(' • '),
      assignedNodeId: placed(ResourceAssignmentKind.AdHocUnit, unit.IncidentAdHocUnitId),
    }));
    const adHocPeople = (entry?.adHocPersonnel ?? []).map<AssignableResource>((person) => ({
      kind: ResourceAssignmentKind.AdHocPersonnel,
      id: person.IncidentAdHocPersonnelId,
      name: person.Name,
      detail: [person.Role, person.ExternalAgencyName].filter(Boolean).join(' • '),
      assignedNodeId: placed(ResourceAssignmentKind.AdHocPersonnel, person.IncidentAdHocPersonnelId),
    }));
    return [...unitOptions, ...personnelOptions, ...adHocUnits, ...adHocPeople];
  }, [entry?.adHocPersonnel, entry?.adHocUnits, entry?.board?.Assignments, personnel, unitStatuses, units]);

  const people = useMemo(
    () =>
      personnel.map((person) => ({ userId: person.UserId, name: personnelFullName(person), detail: [person.GroupName, ...(person.Roles ?? [])].filter(Boolean).join(' • ') })).sort((a, b) => a.name.localeCompare(b.name)),
    [personnel]
  );

  return { resourceName, resourceIcon, personName, leadName, options, people };
}
