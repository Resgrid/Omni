import { BaseV4Request } from '../baseV4Request';
import { type CommandLogEntry, type CommandStructureNode, type IncidentRoleAssignment, type ResourceAssignment, type TacticalObjective } from './incidentCommandModels';

/** ICS-201/209 status summary metrics for an incident. */
export class IncidentReportSummary {
  public CallId: number = 0;
  public IncidentCommandId: string = '';
  public EstablishedOn: string | null = null;
  public ClosedOn: string | null = null;
  public DurationMinutes: number = 0;
  public CurrentCommanderUserId: string = '';
  public LaneCount: number = 0;
  public ActiveAssignmentCount: number = 0;
  public ObjectiveCount: number = 0;
  public CompletedObjectiveCount: number = 0;
  public TimelineEntryCount: number = 0;
  public RoleCount: number = 0;
  public AccountabilityGreen: number = 0;
  public AccountabilityWarning: number = 0;
  public AccountabilityCritical: number = 0;
}

/** Complete after-action bundle for an incident. */
export class IncidentAfterActionReport {
  public Summary: IncidentReportSummary = new IncidentReportSummary();
  public Nodes: CommandStructureNode[] = [];
  public Assignments: ResourceAssignment[] = [];
  public Objectives: TacticalObjective[] = [];
  public Timeline: CommandLogEntry[] = [];
  public Roles: IncidentRoleAssignment[] = [];
}

export class IncidentReportSummaryResult extends BaseV4Request {
  public Data: IncidentReportSummary = new IncidentReportSummary();
}

export class IncidentAfterActionReportResult extends BaseV4Request {
  public Data: IncidentAfterActionReport = new IncidentAfterActionReport();
}
