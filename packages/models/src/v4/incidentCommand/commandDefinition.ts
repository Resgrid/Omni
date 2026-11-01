import { BaseV4Request } from '../baseV4Request';

/** A lane template within a department command definition. */
export class CommandRoleResultData {
  public CommandDefinitionRoleId: number = 0;
  public Name: string = '';
  public Description: string = '';
  /** Maps to CommandNodeType. */
  public LaneType: number = 0;
  public SortOrder: number = 0;
  public MinUnitPersonnel: number = 0;
  public MaxUnitPersonnel: number = 0;
  public MaxUnits: number = 0;
  public MinTimeInRole: number = 0;
  public MaxTimeInRole: number = 0;
  public ForceRequirements: boolean = false;
  /** Core lane requirements; absent from older servers. */
  public MinUnits?: number;
  public WorkTimeAmberMinutes?: number;
  public WorkTimeRedMinutes?: number;
  public Color?: string | null;
  public RequiredUnitTypes?: number[];
  public RequiredPersonnelRoles?: number[];
}

/** A department command definition (template) optionally keyed to a call type. */
export class CommandResultData {
  public CommandDefinitionId: number = 0;
  public CallTypeId: number | null = null;
  public Name: string = '';
  public Description: string = '';
  public Timer: boolean = false;
  public TimerMinutes: number = 0;
  public Lanes: CommandRoleResultData[] = [];
}

export class CommandsResult extends BaseV4Request {
  public Data: CommandResultData[] = [];
}

export class CommandResult extends BaseV4Request {
  public Data: CommandResultData = new CommandResultData();
}

export interface SaveCommandLaneInput {
  CommandDefinitionRoleId?: number | null;
  Name: string;
  Description: string;
  LaneType: number;
  SortOrder: number;
  MinUnitPersonnel: number;
  MaxUnitPersonnel: number;
  MaxUnits: number;
  MinTimeInRole: number;
  MaxTimeInRole: number;
  ForceRequirements: boolean;
  MinUnits?: number;
  WorkTimeAmberMinutes?: number;
  WorkTimeRedMinutes?: number;
  Color?: string | null;
  RequiredUnitTypes?: number[];
  RequiredPersonnelRoles?: number[];
}

export interface SaveCommandInput {
  CommandDefinitionId?: number | null;
  CallTypeId?: number | null;
  Name: string;
  Description: string;
  Timer: boolean;
  TimerMinutes: number;
  Lanes: SaveCommandLaneInput[];
}
