import { UnitRoleResultData } from './unitRoleResultData';

export class ActiveUnitRoleResultData extends UnitRoleResultData {
  public UserId: string = '';
  public FullName: string = '';
  public UpdatedOn: string = '';
  /** Whether the assigned person holds the seat's required personnel role (Core); absent from older servers. */
  public IsQualified?: boolean;
}
