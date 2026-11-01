import {
  CommandNodeType,
  IncidentNeedCategory,
  IncidentNeedStatus,
  IncidentRoleType,
  IncidentTimerStatus,
  IncidentTimerType,
  ParStatus,
  ResourceAssignmentKind,
  TacticalObjectiveStatus,
  TacticalObjectiveType,
} from '@resgrid/models';

/** The subset of i18next's `t` these helpers use (keeps them pure and testable). */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Translated labels for the incident-command enums (IC `lib/incident-command-utils` + Responder/Unit role names +
 * Dispatch `ic-labels`). Every value is a key in this feature's `i18n.en.json`; the NIMS/ICS position titles are the
 * English defaults (a subject-matter translator localizes them, not a literal one).
 */

export type BadgeAction = 'success' | 'warning' | 'error' | 'info' | 'muted';

/** Every ICS position, in Core `IncidentRoleType` order (0–30). */
export const ALL_INCIDENT_ROLES: readonly IncidentRoleType[] = Object.values(IncidentRoleType).filter((value): value is IncidentRoleType => typeof value === 'number');

/** Positions offered first when assigning a role (core command + common field positions, IC presets). */
export const ICS_ROLE_PRESETS: readonly IncidentRoleType[] = [
  IncidentRoleType.IncidentCommander,
  IncidentRoleType.DeputyIncidentCommander,
  IncidentRoleType.SafetyOfficer,
  IncidentRoleType.OperationsSectionChief,
  IncidentRoleType.PlanningSectionChief,
  IncidentRoleType.LogisticsSectionChief,
  IncidentRoleType.FinanceAdminSectionChief,
  IncidentRoleType.PublicInformationOfficer,
  IncidentRoleType.LiaisonOfficer,
  IncidentRoleType.StagingAreaManager,
  IncidentRoleType.TriageOfficer,
  IncidentRoleType.TransportOfficer,
  IncidentRoleType.RehabOfficer,
];

/** Display name for an ICS position; a value newer than this build falls back to a generic label. */
export const incidentRoleName = (t: Translate, roleType: number): string =>
  ALL_INCIDENT_ROLES.includes(roleType as IncidentRoleType) ? t(`incident_command.role_type_${roleType}`) : t('incident_command.role_generic', { role: roleType });

export const COMMAND_NODE_TYPES: readonly CommandNodeType[] = [
  CommandNodeType.Division,
  CommandNodeType.Group,
  CommandNodeType.Branch,
  CommandNodeType.Sector,
  CommandNodeType.StrikeTeam,
  CommandNodeType.TaskForce,
  CommandNodeType.Staging,
  CommandNodeType.UnifiedCommand,
];

export const nodeTypeName = (t: Translate, nodeType: number): string => (COMMAND_NODE_TYPES.includes(nodeType as CommandNodeType) ? t(`incident_command.node_type_${nodeType}`) : t('incident_command.node_type_unknown'));

export const OBJECTIVE_TYPES: readonly TacticalObjectiveType[] = [TacticalObjectiveType.General, TacticalObjectiveType.Benchmark, TacticalObjectiveType.Safety];

const OBJECTIVE_TYPE_KEYS: Record<number, string> = {
  [TacticalObjectiveType.General]: 'incident_command.objective_type_general',
  [TacticalObjectiveType.Benchmark]: 'incident_command.objective_type_benchmark',
  [TacticalObjectiveType.Safety]: 'incident_command.objective_type_safety',
};

export const objectiveTypeName = (t: Translate, type: number): string => t(OBJECTIVE_TYPE_KEYS[type] ?? OBJECTIVE_TYPE_KEYS[TacticalObjectiveType.General]);

const OBJECTIVE_STATUS_KEYS: Record<number, string> = {
  [TacticalObjectiveStatus.Pending]: 'incident_command.objective_status_pending',
  [TacticalObjectiveStatus.Complete]: 'incident_command.objective_status_complete',
  [TacticalObjectiveStatus.InProgress]: 'incident_command.objective_status_in_progress',
};

export const objectiveStatusName = (t: Translate, status: number): string => t(OBJECTIVE_STATUS_KEYS[status] ?? OBJECTIVE_STATUS_KEYS[TacticalObjectiveStatus.Pending]);

export const objectiveStatusAction = (status: number): BadgeAction => (status === TacticalObjectiveStatus.Complete ? 'success' : status === TacticalObjectiveStatus.InProgress ? 'info' : 'muted');

export const NEED_CATEGORIES: readonly IncidentNeedCategory[] = [
  IncidentNeedCategory.Resource,
  IncidentNeedCategory.Logistics,
  IncidentNeedCategory.Medical,
  IncidentNeedCategory.Equipment,
  IncidentNeedCategory.Staffing,
  IncidentNeedCategory.Other,
];

const NEED_CATEGORY_KEYS: Record<number, string> = {
  [IncidentNeedCategory.Resource]: 'incident_command.need_category_resource',
  [IncidentNeedCategory.Logistics]: 'incident_command.need_category_logistics',
  [IncidentNeedCategory.Medical]: 'incident_command.need_category_medical',
  [IncidentNeedCategory.Equipment]: 'incident_command.need_category_equipment',
  [IncidentNeedCategory.Staffing]: 'incident_command.need_category_staffing',
  [IncidentNeedCategory.Other]: 'incident_command.need_category_other',
  [IncidentNeedCategory.Entity]: 'incident_command.need_category_entity',
};

export const needCategoryName = (t: Translate, category: number): string => t(NEED_CATEGORY_KEYS[category] ?? NEED_CATEGORY_KEYS[IncidentNeedCategory.Other]);

export const NEED_STATUSES: readonly IncidentNeedStatus[] = [IncidentNeedStatus.Open, IncidentNeedStatus.PartiallyMet, IncidentNeedStatus.Met, IncidentNeedStatus.Cancelled];

const NEED_STATUS_KEYS: Record<number, string> = {
  [IncidentNeedStatus.Open]: 'incident_command.need_status_open',
  [IncidentNeedStatus.PartiallyMet]: 'incident_command.need_status_partially_met',
  [IncidentNeedStatus.Met]: 'incident_command.need_status_met',
  [IncidentNeedStatus.Cancelled]: 'incident_command.need_status_cancelled',
};

export const needStatusName = (t: Translate, status: number): string => t(NEED_STATUS_KEYS[status] ?? NEED_STATUS_KEYS[IncidentNeedStatus.Open]);

export const needStatusAction = (status: number): BadgeAction =>
  status === IncidentNeedStatus.Met ? 'success' : status === IncidentNeedStatus.PartiallyMet ? 'warning' : status === IncidentNeedStatus.Cancelled ? 'muted' : 'info';

const TIMER_TYPE_KEYS: Record<number, string> = {
  [IncidentTimerType.Scene]: 'incident_command.timer_type_scene',
  [IncidentTimerType.Benchmark]: 'incident_command.timer_type_benchmark',
  [IncidentTimerType.Role]: 'incident_command.timer_type_role',
  [IncidentTimerType.Custom]: 'incident_command.timer_type_custom',
};

export const timerTypeName = (t: Translate, type: number): string => t(TIMER_TYPE_KEYS[type] ?? TIMER_TYPE_KEYS[IncidentTimerType.Custom]);

const TIMER_STATUS_KEYS: Record<number, string> = {
  [IncidentTimerStatus.Running]: 'incident_command.timer_status_running',
  [IncidentTimerStatus.Due]: 'incident_command.timer_status_due',
  [IncidentTimerStatus.Acknowledged]: 'incident_command.timer_status_acknowledged',
  [IncidentTimerStatus.Stopped]: 'incident_command.timer_status_stopped',
};

export const timerStatusName = (t: Translate, status: number): string => t(TIMER_STATUS_KEYS[status] ?? TIMER_STATUS_KEYS[IncidentTimerStatus.Running]);

export const timerStatusAction = (status: number): BadgeAction =>
  status === IncidentTimerStatus.Due ? 'error' : status === IncidentTimerStatus.Acknowledged ? 'success' : status === IncidentTimerStatus.Stopped ? 'muted' : 'info';

const RESOURCE_KIND_KEYS: Record<number, string> = {
  [ResourceAssignmentKind.RealUnit]: 'incident_command.resource_kind_unit',
  [ResourceAssignmentKind.RealPersonnel]: 'incident_command.resource_kind_personnel',
  [ResourceAssignmentKind.LinkedDeptUnit]: 'incident_command.resource_kind_linked_unit',
  [ResourceAssignmentKind.LinkedDeptPersonnel]: 'incident_command.resource_kind_linked_personnel',
  [ResourceAssignmentKind.AdHocUnit]: 'incident_command.resource_kind_adhoc_unit',
  [ResourceAssignmentKind.AdHocPersonnel]: 'incident_command.resource_kind_adhoc_personnel',
};

export const resourceKindName = (t: Translate, kind: number): string => t(RESOURCE_KIND_KEYS[kind] ?? RESOURCE_KIND_KEYS[ResourceAssignmentKind.RealUnit]);

/** PAR status (server string, `ParStatus`) → badge colour; anything newer is muted. */
export const parStatusAction = (status: string): BadgeAction => (status === ParStatus.Green ? 'success' : status === ParStatus.Warning ? 'warning' : status === ParStatus.Critical ? 'error' : 'muted');

export const parStatusName = (t: Translate, status: string): string =>
  status === ParStatus.Green ? t('incident_command.par_green') : status === ParStatus.Warning ? t('incident_command.par_warning') : status === ParStatus.Critical ? t('incident_command.par_critical') : status;

/** Lane colour presets offered when adding a lane (IC add-lane sheet). */
export const LANE_COLORS: readonly string[] = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'];

/** Default lane colour when a lane sets none (Responder/Unit view tier). */
export const DEFAULT_LANE_COLOR = '#3b82f6';

/** Accepts only `#rgb`, `#rrggbb` or `#rrggbbaa` colours from the server or a route param. */
export const safeColor = (value: string | null | undefined, fallback: string = DEFAULT_LANE_COLOR): string => (value && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ? value : fallback);
