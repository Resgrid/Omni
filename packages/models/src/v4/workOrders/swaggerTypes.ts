// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

import type { WorkOrderTransition } from './workOrders';

/** Core `v4.WorkOrders.WorkOrderApiLaborInput` (generated from Swagger v4). */
export interface WorkOrderApiLaborInput {
  Id?: string | null;
  Input?: Record<string, unknown>;
}

/** Core `v4.WorkOrders.WorkOrderCommandInput` (generated from Swagger v4). */
export interface WorkOrderCommandInput {
  Id?: string | null;
  Revision?: number;
  ChildId?: string | null;
  Note?: string | null;
}

/** Core `v4.WorkOrders.WorkOrderStatusInput` (generated from Swagger v4). */
export interface WorkOrderStatusInput {
  Id?: string | null;
  Input?: WorkOrderTransition;
}
