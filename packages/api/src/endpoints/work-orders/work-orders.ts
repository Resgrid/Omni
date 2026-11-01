import type { ReadinessAccess, WorkOrderApiLaborInput, WorkOrderApiResult, WorkOrderChoices, WorkOrderCommandInput, WorkOrderDetail, WorkOrderInput, WorkOrderPage, WorkOrderStatusInput } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for work-orders (WorkOrders, Readiness). The contract test checks every entry against Swagger. */
export const workOrdersEndpoints = defineEndpoints('work-orders', {
  acceptWorkOrderAssignment: { method: 'POST', path: '/WorkOrders/AcceptWorkOrderAssignment', body: 'json' },
  addWorkOrderComment: { method: 'POST', path: '/WorkOrders/AddWorkOrderComment', body: 'json' },
  addWorkOrderLabor: { method: 'POST', path: '/WorkOrders/AddWorkOrderLabor', body: 'json' },
  getReadinessAccess: { method: 'GET', path: '/Readiness/GetAccess' },
  getWorkOrder: { method: 'GET', path: '/WorkOrders/GetWorkOrder', query: ['id'] },
  getWorkOrderChoices: { method: 'GET', path: '/WorkOrders/GetWorkOrderChoices' },
  getWorkOrderFile: { method: 'GET', path: '/WorkOrders/GetWorkOrderFile', query: ['id'], responseType: 'arraybuffer' },
  getWorkOrders: { method: 'GET', path: '/WorkOrders/GetWorkOrders', query: ['ChecklistCompletionId', 'Page', 'Status', 'Priority', 'AssignedToMe', 'UnitId', 'GroupId', 'AssetId', 'Number'] },
  newWorkOrder: { method: 'POST', path: '/WorkOrders/NewWorkOrder', body: 'json' },
  setWorkOrderStatus: { method: 'POST', path: '/WorkOrders/SetWorkOrderStatus', body: 'json' },
  uploadWorkOrderFile: { method: 'POST', path: '/WorkOrders/UploadWorkOrderFile', body: 'multipart' },
});

const E = workOrdersEndpoints;

/** `POST /WorkOrders/AcceptWorkOrderAssignment` — legacy: R. */
export const acceptWorkOrderAssignment = (ctx: ApiContext, body: WorkOrderCommandInput, options?: RequestOptions): Promise<WorkOrderApiResult<WorkOrderDetail>> =>
  request<WorkOrderApiResult<WorkOrderDetail>>(ctx, E.acceptWorkOrderAssignment, { body }, options);

/** `POST /WorkOrders/AddWorkOrderComment` — legacy: R. */
export const addWorkOrderComment = (ctx: ApiContext, body: WorkOrderCommandInput, options?: RequestOptions): Promise<WorkOrderApiResult<WorkOrderDetail>> =>
  request<WorkOrderApiResult<WorkOrderDetail>>(ctx, E.addWorkOrderComment, { body }, options);

/** `POST /WorkOrders/AddWorkOrderLabor` — legacy: R. */
export const addWorkOrderLabor = (ctx: ApiContext, body: WorkOrderApiLaborInput, options?: RequestOptions): Promise<WorkOrderApiResult<WorkOrderDetail>> =>
  request<WorkOrderApiResult<WorkOrderDetail>>(ctx, E.addWorkOrderLabor, { body }, options);

/** Independent feature availability and monthly offers. A flag alone is not a paid entitlement. `GET /Readiness/GetAccess` — legacy: R. */
export const getReadinessAccess = (ctx: ApiContext, options?: RequestOptions): Promise<WorkOrderApiResult<ReadinessAccess>> => request<WorkOrderApiResult<ReadinessAccess>>(ctx, E.getReadinessAccess, {}, options);

/** `GET /WorkOrders/GetWorkOrder` — legacy: R. */
export const getWorkOrder = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<WorkOrderApiResult<WorkOrderDetail>> =>
  request<WorkOrderApiResult<WorkOrderDetail>>(ctx, E.getWorkOrder, { params }, options);

/** `GET /WorkOrders/GetWorkOrderChoices` — legacy: R. */
export const getWorkOrderChoices = (ctx: ApiContext, options?: RequestOptions): Promise<WorkOrderApiResult<WorkOrderChoices>> => request<WorkOrderApiResult<WorkOrderChoices>>(ctx, E.getWorkOrderChoices, {}, options);

/** `GET /WorkOrders/GetWorkOrderFile` — legacy: R. */
export const getWorkOrderFile = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<ArrayBuffer> => request<ArrayBuffer>(ctx, E.getWorkOrderFile, { params }, options);

/** `GET /WorkOrders/GetWorkOrders` — legacy: R. */
export const getWorkOrders = (
  ctx: ApiContext,
  params: { ChecklistCompletionId?: string; Page?: number | string; Status?: string; Priority?: string; AssignedToMe?: boolean; UnitId?: number | string; GroupId?: number | string; AssetId?: string; Number?: string },
  options?: RequestOptions
): Promise<WorkOrderApiResult<WorkOrderPage>> => request<WorkOrderApiResult<WorkOrderPage>>(ctx, E.getWorkOrders, { params }, options);

/** `POST /WorkOrders/NewWorkOrder` — legacy: R. */
export const newWorkOrder = (ctx: ApiContext, body: WorkOrderInput, options?: RequestOptions): Promise<WorkOrderApiResult<WorkOrderDetail>> =>
  request<WorkOrderApiResult<WorkOrderDetail>>(ctx, E.newWorkOrder, { body }, options);

/** `POST /WorkOrders/SetWorkOrderStatus` — legacy: R. */
export const setWorkOrderStatus = (ctx: ApiContext, body: WorkOrderStatusInput, options?: RequestOptions): Promise<WorkOrderApiResult<WorkOrderDetail>> =>
  request<WorkOrderApiResult<WorkOrderDetail>>(ctx, E.setWorkOrderStatus, { body }, options);

/** `POST /WorkOrders/UploadWorkOrderFile` — legacy: R. */
export const uploadWorkOrderFile = (ctx: ApiContext, body: FormData, options?: RequestOptions): Promise<WorkOrderApiResult<WorkOrderDetail>> =>
  request<WorkOrderApiResult<WorkOrderDetail>>(ctx, E.uploadWorkOrderFile, { body }, options);
