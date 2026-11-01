// Enums mirroring Core/Resgrid.Model/IncidentCommand/IncidentCommandEnums.cs and IncidentRole.cs.
// Numeric values MUST stay in sync with the backend (they are persisted + sent over the wire).

/** Lifecycle status of a live incident command instance. */
export enum IncidentCommandStatus {
  Active = 0,
  Closed = 1,
}

/**
 * Personnel Accountability Report (PAR) status values reported by personnel check-ins.
 * Single source of truth for these literals, which stores, labels and UI compare against.
 */
export const ParStatus = {
  Green: 'Green',
  Warning: 'Warning',
  Critical: 'Critical',
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare -- enum-like const + literal union type pair
export type ParStatus = (typeof ParStatus)[keyof typeof ParStatus];

/** ICS structural node types (the "lanes" / span-of-control units on the command board). */
export enum CommandNodeType {
  Division = 0,
  Group = 1,
  Branch = 2,
  Sector = 3,
  StrikeTeam = 4,
  TaskForce = 5,
  Staging = 6,
  UnifiedCommand = 7,
}

/** What kind of resource a ResourceAssignment points at (polymorphic). */
export enum ResourceAssignmentKind {
  RealUnit = 0,
  RealPersonnel = 1,
  LinkedDeptUnit = 2,
  LinkedDeptPersonnel = 3,
  AdHocUnit = 4,
  AdHocPersonnel = 5,
}

/** Classification of a tactical objective / benchmark. */
export enum TacticalObjectiveType {
  General = 0,
  Benchmark = 1,
  Safety = 2,
}

/** Completion state of a tactical objective. */
export enum TacticalObjectiveStatus {
  Pending = 0,
  Complete = 1,
  InProgress = 2,
}

/** Category of a command-level incident need. */
export enum IncidentNeedCategory {
  Resource = 0,
  Logistics = 1,
  Medical = 2,
  Equipment = 3,
  Staffing = 4,
  Other = 5,
  /** Request for specific Resgrid entities (units/users/roles/groups), dispatched individually by command. */
  Entity = 6,
}

/** Fulfillment state of an incident need. */
export enum IncidentNeedStatus {
  Open = 0,
  PartiallyMet = 1,
  Met = 2,
  Cancelled = 3,
}

/** Type of incident timer (personnel PAR is handled by the Checkin feature, not these). */
export enum IncidentTimerType {
  Scene = 0,
  Benchmark = 1,
  Role = 2,
  Custom = 3,
}

/** What an incident timer is scoped to. */
export enum IncidentTimerScopeType {
  Incident = 0,
  Node = 1,
  Unit = 2,
}

/** Runtime status of an incident timer. */
export enum IncidentTimerStatus {
  Running = 0,
  Due = 1,
  Acknowledged = 2,
  Stopped = 3,
}

/** Type of a real-time map annotation drawn on the tactical map. */
export enum IncidentMapAnnotationType {
  Line = 0,
  Polygon = 1,
  Symbol = 2,
  Text = 3,
  Marker = 4,
}

/** Type of an entry in the append-only command (ICS-201) timeline. */
export enum CommandLogEntryType {
  CommandEstablished = 0,
  CommandTransferred = 1,
  NodeAdded = 2,
  NodeUpdated = 3,
  NodeRemoved = 4,
  ResourceAssigned = 5,
  ResourceMoved = 6,
  ResourceReleased = 7,
  ObjectiveAdded = 8,
  ObjectiveCompleted = 9,
  TimerStarted = 10,
  TimerAcknowledged = 11,
  AnnotationAdded = 12,
  AnnotationRemoved = 13,
  CheckIn = 14,
  ChannelOpened = 15,
  ChannelClosed = 16,
  RoleAssigned = 17,
  RoleRemoved = 18,
  AdHocResourceCreated = 19,
  Note = 20,
  CommandClosed = 21,
  ParCritical = 22,
  IncidentNoteAdded = 23,
  IncidentNoteRemoved = 24,
  IncidentAttachmentAdded = 25,
  IncidentAttachmentRemoved = 26,
  ActionPlanUpdated = 27,
  CommandPostUpdated = 28,
  PublicSharingEnabled = 29,
  PublicSharingDisabled = 30,
  NeedAdded = 31,
  NeedUpdated = 32,
  NeedMet = 33,
  ObjectiveProgressUpdated = 34,
  LaneLeadChanged = 35,
  CommandDetailsUpdated = 36,
}

/**
 * Functional incident-command positions (NIMS/ICS) across Fire / EMS / SAR / Natural-disaster / Industrial-HazMat.
 * Each maps to a specialized app view and a capability set (see IncidentRoleCapabilityMap on the backend).
 */
export enum IncidentRoleType {
  IncidentCommander = 0,
  DeputyIncidentCommander = 1,
  UnifiedCommandMember = 2,
  OperationsSectionChief = 3,
  PlanningSectionChief = 4,
  LogisticsSectionChief = 5,
  FinanceAdminSectionChief = 6,
  SafetyOfficer = 7,
  LiaisonOfficer = 8,
  PublicInformationOfficer = 9,
  StagingAreaManager = 10,
  ResourcesUnitLeader = 11,
  SituationUnitLeader = 12,
  DocumentationUnitLeader = 13,
  CommunicationsUnitLeader = 14,
  DivisionGroupSupervisor = 15,
  BranchDirector = 16,
  StrikeTeamTaskForceLeader = 17,
  MedicalUnitLeader = 18,
  RehabOfficer = 19,
  MedicalBranchDirector = 20,
  TriageOfficer = 21,
  TreatmentOfficer = 22,
  TransportOfficer = 23,
  HazMatGroupSupervisor = 24,
  DeconOfficer = 25,
  EntryTeamLeader = 26,
  SearchGroupSupervisor = 27,
  AirOperationsBranchDirector = 28,
  ShelterMassCareCoordinator = 29,
  DamageAssessmentLead = 30,
}

/**
 * Capabilities an incident role may have; drives the app's view gating. Bitwise flags — the board read
 * returns the user's effective value, test with `(value & IncidentCapabilities.X) !== 0`.
 */
export enum IncidentCapabilities {
  None = 0,
  ViewBoard = 1,
  ManageCommand = 2,
  ManageStructure = 4,
  AssignResources = 8,
  ManageObjectives = 16,
  ManageTimers = 32,
  ManageAnnotations = 64,
  ManageAccountability = 128,
  ManageChannels = 256,
  ManageResources = 512,
  ViewReports = 1024,

  All = ViewBoard | ManageCommand | ManageStructure | AssignResources | ManageObjectives | ManageTimers | ManageAnnotations | ManageAccountability | ManageChannels | ManageResources | ViewReports,
}

/** True when the given effective capability bitmask contains the requested capability flag. */
export const hasIncidentCapability = (value: number, capability: IncidentCapabilities): boolean => (value & capability) === capability;

/**
 * Maps each IncidentRoleType to its capability bitmask. Ported verbatim from
 * Resgrid.Model.IncidentRoleCapabilityMap so the client can reason about a role locally.
 */
export const getIncidentRoleCapabilities = (role: IncidentRoleType): IncidentCapabilities => {
  const C = IncidentCapabilities;
  switch (role) {
    case IncidentRoleType.IncidentCommander:
    case IncidentRoleType.DeputyIncidentCommander:
    case IncidentRoleType.UnifiedCommandMember:
      return C.All;
    case IncidentRoleType.OperationsSectionChief:
      return C.ViewBoard | C.ManageStructure | C.AssignResources | C.ManageObjectives | C.ManageTimers | C.ManageResources;
    case IncidentRoleType.PlanningSectionChief:
    case IncidentRoleType.SituationUnitLeader:
      return C.ViewBoard | C.ManageObjectives | C.ManageAnnotations | C.ViewReports;
    case IncidentRoleType.DocumentationUnitLeader:
      return C.ViewBoard | C.ViewReports;
    case IncidentRoleType.LogisticsSectionChief:
      return C.ViewBoard | C.ManageChannels | C.ManageResources;
    case IncidentRoleType.CommunicationsUnitLeader:
      return C.ViewBoard | C.ManageChannels;
    case IncidentRoleType.FinanceAdminSectionChief:
    case IncidentRoleType.PublicInformationOfficer:
      return C.ViewBoard | C.ViewReports;
    case IncidentRoleType.SafetyOfficer:
      return C.ViewBoard | C.ManageAnnotations | C.ManageObjectives;
    case IncidentRoleType.LiaisonOfficer:
      return C.ViewBoard | C.ManageResources;
    case IncidentRoleType.StagingAreaManager:
      return C.ViewBoard | C.ManageResources | C.AssignResources;
    case IncidentRoleType.ResourcesUnitLeader:
      return C.ViewBoard | C.ManageAccountability | C.AssignResources;
    case IncidentRoleType.DivisionGroupSupervisor:
    case IncidentRoleType.BranchDirector:
    case IncidentRoleType.StrikeTeamTaskForceLeader:
      return C.ViewBoard | C.AssignResources | C.ManageObjectives | C.ManageAccountability;
    case IncidentRoleType.MedicalUnitLeader:
    case IncidentRoleType.RehabOfficer:
      return C.ViewBoard | C.ManageAccountability;
    case IncidentRoleType.MedicalBranchDirector:
    case IncidentRoleType.TriageOfficer:
    case IncidentRoleType.TreatmentOfficer:
    case IncidentRoleType.TransportOfficer:
      return C.ViewBoard | C.ManageObjectives | C.ManageAccountability;
    case IncidentRoleType.HazMatGroupSupervisor:
    case IncidentRoleType.DeconOfficer:
    case IncidentRoleType.EntryTeamLeader:
      return C.ViewBoard | C.ManageObjectives | C.ManageTimers | C.ManageAccountability;
    case IncidentRoleType.SearchGroupSupervisor:
    case IncidentRoleType.AirOperationsBranchDirector:
      return C.ViewBoard | C.AssignResources | C.ManageObjectives | C.ManageAnnotations;
    case IncidentRoleType.ShelterMassCareCoordinator:
    case IncidentRoleType.DamageAssessmentLead:
      return C.ViewBoard | C.ManageObjectives | C.ViewReports;
    default:
      return C.ViewBoard;
  }
};
