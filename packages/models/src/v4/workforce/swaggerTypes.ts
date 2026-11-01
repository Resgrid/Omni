// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** Core `v4.Workforce.AddResourceUsageInput` (generated from Swagger v4). */
export interface AddResourceUsageInput {
  DeploymentId?: string | null;
  CallId?: number | null;
  UnitId?: number;
  UsageDate?: string;
  /** UsagePhases. */
  Phase?: number;
  StartOdometer?: number | null;
  EndOdometer?: number | null;
  /** "mi" or "km"; the server keeps the reading and stores canonical miles. */
  DistanceUnit?: string | null;
  Distance?: number | null;
  StartEngineMeter?: number | null;
  EndEngineMeter?: number | null;
  EngineHours?: number | null;
  OperatingHours?: number | null;
  IdleHours?: number | null;
  FuelQuantity?: number | null;
  FuelUnit?: string | null;
  FuelActualCost?: number | null;
  ExternalId?: string | null;
}
