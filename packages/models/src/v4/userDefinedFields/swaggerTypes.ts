// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

import type { UdfFieldValueInput } from './udfFieldValueInput';

/** Input for saving UDF field values for a specific entity. */
export interface SaveUdfFieldValuesInput {
  EntityType: number;
  EntityId: string;
  Values: UdfFieldValueInput[];
}
