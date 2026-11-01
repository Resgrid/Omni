export class UnitRoleResultData {
  public UnitId: string = '';
  public UnitRoleId: string = '';
  public Name: string = '';
  /** Personnel role a crew member needs for this seat (Core); absent from older servers. */
  public PersonnelRoleId?: string | null;
  public PersonnelRoleName?: string | null;
  public PersonnelRoleRequired?: boolean;
}
