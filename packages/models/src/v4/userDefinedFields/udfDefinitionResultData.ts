import { type UdfFieldResultData } from './udfFieldResultData';

// EntityType enum: Call=0, Personnel=1, Unit=2, Contact=3
export class UdfDefinitionResultData {
  public UdfDefinitionId: string = '';
  public DepartmentId: number = 0;
  public EntityType: number = 0;
  public Version: number = 1;
  public IsActive: boolean = true;
  public Fields: UdfFieldResultData[] = [];
}
