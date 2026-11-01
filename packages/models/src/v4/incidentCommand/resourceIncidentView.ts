/**
 * Read-only incident view for a responding resource (Core `IncidentCommand/GetResourceIncidentView/{callId}?unitId=`):
 * the incident summary plus the caller's own lane assignment. Mirrors Core `Resgrid.Model.ResourceIncidentView`.
 * Objectives, needs, notes and attachments reuse the canonical incident-command interfaces.
 */
import { type IncidentAttachment, type IncidentNeed, type IncidentNote, type TacticalObjective } from './incidentCommandModels';

export interface IncidentContactInfo {
  UserId?: string | null;
  Name: string;
  Phone?: string | null;
  Email?: string | null;
}

export interface ResourceLaneAssignmentView {
  ResourceAssignmentId: string;
  CommandStructureNodeId: string;
  LaneName: string;
  /** CommandNodeType. */
  NodeType: number;
  Color?: string | null;
  AssignedOn: string;
  PrimaryLead?: IncidentContactInfo | null;
  SecondaryLead?: IncidentContactInfo | null;
  PrimaryObjective?: TacticalObjective | null;
  SecondaryObjective?: TacticalObjective | null;
  LinkedNeed?: IncidentNeed | null;
}

/** Who holds an incident role (IncidentRoleType) and how to reach them. */
export interface IncidentRoleContactInfo {
  RoleType: number;
  Contact?: IncidentContactInfo | null;
}

/** Chat channel ids the resource may use for this incident; null where the channel does not exist or is not visible. */
export interface IncidentChatChannels {
  IncidentChannelId?: string | null;
  CommandChannelId?: string | null;
  LeadsChannelId?: string | null;
  LaneChannelId?: string | null;
  DispatchChannelId?: string | null;
  /** True once the incident is closed and its channels are read-only. */
  IsFrozen: boolean;
  /** Whether the caller may message the incident commander directly (Core); absent from older servers. */
  CanMessageCommander?: boolean;
}

export interface ResourceIncidentView {
  IncidentCommandId: string;
  CallId: number;
  /** IncidentCommandStatus. */
  Status: number;
  EstablishedOn: string;
  EstimatedEndOn?: string | null;
  ClosedOn?: string | null;
  ImportantInformation?: string | null;
  IncidentActionPlan?: string | null;
  Commander?: IncidentContactInfo | null;
  Objectives: TacticalObjective[];
  Needs: IncidentNeed[];
  Notes: IncidentNote[];
  Attachments: IncidentAttachment[];
  MyAssignment?: ResourceLaneAssignmentView | null;
  Roles?: IncidentRoleContactInfo[];
  Chat?: IncidentChatChannels | null;
}
