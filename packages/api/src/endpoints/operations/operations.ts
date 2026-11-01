import type {
  AddResourceUsageInput,
  BuildF42Input,
  CalOesMarsAccess,
  CalOesMarsQueueItem,
  CalOesMarsValidation,
  CalOesMarsWorkItem,
  Deployment,
  DeploymentAccess,
  Expense,
  FieldCostAccess,
  NewTimeReportInput,
  OperationsResult,
  ResourceUsage,
  SaveExpenseInput,
  SaveTimeEntriesInput,
  SignTimeReportInput,
  StandardApiResponseV4Base,
  TimeReport,
  TimeReportActionInput,
  TimeReportResponse,
} from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for operations (FieldCost, TimeReports, CalOesMars, Deployments). The contract test checks every entry against Swagger. */
export const operationsEndpoints = defineEndpoints('operations', {
  addResourceUsage: { method: 'POST', path: '/FieldCost/AddResourceUsage', body: 'json' },
  approveTimeReport: { method: 'POST', path: '/TimeReports/ApproveTimeReport', body: 'json' },
  buildCalOesMarsF42: { method: 'POST', path: '/CalOesMars/BuildF42', body: 'json' },
  deleteExpense: { method: 'DELETE', path: '/TimeReports/DeleteExpense', query: ['id'] },
  getCalOesMarsAccess: { method: 'GET', path: '/CalOesMars/GetAccess' },
  getCalOesMarsQueue: { method: 'GET', path: '/CalOesMars/GetQueue', query: ['recordType'] },
  getCalOesMarsWorkItem: { method: 'GET', path: '/CalOesMars/GetWorkItem', query: ['id'] },
  getDeployment: { method: 'GET', path: '/Deployments/GetDeployment', query: ['id'] },
  getDeploymentByCallId: { method: 'GET', path: '/Deployments/GetDeploymentByCallId', query: ['callId'] },
  getDeployments: { method: 'GET', path: '/Deployments/GetDeployments', query: ['active', 'skip', 'take'] },
  getDeploymentsAccess: { method: 'GET', path: '/Deployments/GetAccess' },
  getExpenses: { method: 'GET', path: '/TimeReports/GetExpenses', query: ['deploymentId'] },
  getFieldCostAccess: { method: 'GET', path: '/FieldCost/GetAccess' },
  getResourceUsage: { method: 'GET', path: '/FieldCost/GetResourceUsage', query: ['deploymentId'] },
  getTimeReport: { method: 'GET', path: '/TimeReports/GetTimeReport', query: ['id'] },
  getTimeReports: { method: 'GET', path: '/TimeReports/GetTimeReports', query: ['deploymentId'] },
  newTimeReport: { method: 'POST', path: '/TimeReports/NewTimeReport', body: 'json' },
  saveExpense: { method: 'POST', path: '/TimeReports/SaveExpense', body: 'json' },
  saveTimeEntries: { method: 'POST', path: '/TimeReports/SaveTimeEntries', body: 'json' },
  signTimeReport: { method: 'POST', path: '/TimeReports/SignTimeReport', body: 'json' },
  submitTimeReport: { method: 'POST', path: '/TimeReports/SubmitTimeReport', body: 'json' },
  validateCalOesMarsWorkItem: { method: 'POST', path: '/CalOesMars/Validate', query: ['id'] },
});

const E = operationsEndpoints;

/** A rostered member's own reading for a unit on their deployment (or any, with ViewInternalCosts). Distance is canonicalised to miles; conflicting readings are queued for review. `POST /FieldCost/AddResourceUsage` — legacy: DIRU. */
export const addResourceUsage = (ctx: ApiContext, body: AddResourceUsageInput, options?: RequestOptions): Promise<OperationsResult<ResourceUsage>> =>
  request<OperationsResult<ResourceUsage>>(ctx, E.addResourceUsage, { body }, options);

/** `POST /TimeReports/ApproveTimeReport` — legacy: DIRU. */
export const approveTimeReport = (ctx: ApiContext, body: TimeReportActionInput, options?: RequestOptions): Promise<TimeReportResponse> => request<TimeReportResponse>(ctx, E.approveTimeReport, { body }, options);

/** `POST /CalOesMars/BuildF42` — legacy: DIRU. */
export const buildCalOesMarsF42 = (ctx: ApiContext, body: BuildF42Input, options?: RequestOptions): Promise<OperationsResult<CalOesMarsWorkItem>> =>
  request<OperationsResult<CalOesMarsWorkItem>>(ctx, E.buildCalOesMarsF42, { body }, options);

/** `DELETE /TimeReports/DeleteExpense` — legacy: DIRU. */
export const deleteExpense = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<StandardApiResponseV4Base> => request<StandardApiResponseV4Base>(ctx, E.deleteExpense, { params }, options);

/** `GET /CalOesMars/GetAccess` — legacy: DIRU. */
export const getCalOesMarsAccess = (ctx: ApiContext, options?: RequestOptions): Promise<OperationsResult<CalOesMarsAccess>> => request<OperationsResult<CalOesMarsAccess>>(ctx, E.getCalOesMarsAccess, {}, options);

/** `GET /CalOesMars/GetQueue` — legacy: DIRU. */
export const getCalOesMarsQueue = (ctx: ApiContext, params: { recordType?: number | string } = {}, options?: RequestOptions): Promise<OperationsResult<CalOesMarsQueueItem[]>> =>
  request<OperationsResult<CalOesMarsQueueItem[]>>(ctx, E.getCalOesMarsQueue, { params }, options);

/** `GET /CalOesMars/GetWorkItem` — legacy: DIRU. */
export const getCalOesMarsWorkItem = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<OperationsResult<CalOesMarsWorkItem>> =>
  request<OperationsResult<CalOesMarsWorkItem>>(ctx, E.getCalOesMarsWorkItem, { params }, options);

/** `GET /Deployments/GetDeployment` — legacy: DIRU. */
export const getDeployment = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<OperationsResult<Deployment>> => request<OperationsResult<Deployment>>(ctx, E.getDeployment, { params }, options);

/** The billing context behind a call (mobile: call → deployment). `GET /Deployments/GetDeploymentByCallId` — legacy: DIRU. */
export const getDeploymentByCallId = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<OperationsResult<Deployment>> =>
  request<OperationsResult<Deployment>>(ctx, E.getDeploymentByCallId, { params }, options);

/** `GET /Deployments/GetDeployments` — legacy: DIRU. */
export const getDeployments = (ctx: ApiContext, params: { active?: boolean; skip?: number | string; take?: number | string } = {}, options?: RequestOptions): Promise<OperationsResult<Deployment[]>> =>
  request<OperationsResult<Deployment[]>>(ctx, E.getDeployments, { params }, options);

/** Whether the deployment core is available to this department and what the caller may do. Always answers. `GET /Deployments/GetAccess` — legacy: DIRU. */
export const getDeploymentsAccess = (ctx: ApiContext, options?: RequestOptions): Promise<OperationsResult<DeploymentAccess>> => request<OperationsResult<DeploymentAccess>>(ctx, E.getDeploymentsAccess, {}, options);

/** `GET /TimeReports/GetExpenses` — legacy: DIRU. */
export const getExpenses = (ctx: ApiContext, params: { deploymentId: string }, options?: RequestOptions): Promise<OperationsResult<Expense[]>> =>
  request<OperationsResult<Expense[]>>(ctx, E.getExpenses, { params }, options);

/** `GET /FieldCost/GetAccess` — legacy: DIRU. */
export const getFieldCostAccess = (ctx: ApiContext, options?: RequestOptions): Promise<OperationsResult<FieldCostAccess>> => request<OperationsResult<FieldCostAccess>>(ctx, E.getFieldCostAccess, {}, options);

/** Usage entries for a deployment the caller is rostered on (or any, with ViewInternalCosts). `GET /FieldCost/GetResourceUsage` — legacy: DIRU. */
export const getResourceUsage = (ctx: ApiContext, params: { deploymentId: string }, options?: RequestOptions): Promise<OperationsResult<ResourceUsage[]>> =>
  request<OperationsResult<ResourceUsage[]>>(ctx, E.getResourceUsage, { params }, options);

/** `GET /TimeReports/GetTimeReport` — legacy: DIRU. */
export const getTimeReport = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<OperationsResult<TimeReport>> => request<OperationsResult<TimeReport>>(ctx, E.getTimeReport, { params }, options);

/** `GET /TimeReports/GetTimeReports` — legacy: DIRU. */
export const getTimeReports = (ctx: ApiContext, params: { deploymentId: string }, options?: RequestOptions): Promise<OperationsResult<TimeReport[]>> =>
  request<OperationsResult<TimeReport[]>>(ctx, E.getTimeReports, { params }, options);

/** `POST /TimeReports/NewTimeReport` — legacy: DIRU. */
export const newTimeReport = (ctx: ApiContext, body: NewTimeReportInput, options?: RequestOptions): Promise<TimeReportResponse> => request<TimeReportResponse>(ctx, E.newTimeReport, { body }, options);

/** A field member adds expenses on a deployment they may write time for and edits only the ones they added; managers edit any. `POST /TimeReports/SaveExpense` — legacy: DIRU. */
export const saveExpense = (ctx: ApiContext, body: SaveExpenseInput, options?: RequestOptions): Promise<OperationsResult<Expense>> => request<OperationsResult<Expense>>(ctx, E.saveExpense, { body }, options);

/** Replaces the entries of the subjects the caller may write (every subject for a manager); other subjects' entries stay as stored. StartLocal/EndLocal, when sent, are department-local wall clock and win over StartTime/EndTime. Validation errors come back with the unchanged report and status Failure. `POST /TimeReports/SaveTimeEntries` — legacy: DIRU. */
export const saveTimeEntries = (ctx: ApiContext, body: SaveTimeEntriesInput, options?: RequestOptions): Promise<TimeReportResponse> => request<TimeReportResponse>(ctx, E.saveTimeEntries, { body }, options);

/** Crew boss / contractor signature (the acting user) and/or the customer signer's typed name. `POST /TimeReports/SignTimeReport` — legacy: DIRU. */
export const signTimeReport = (ctx: ApiContext, body: SignTimeReportInput, options?: RequestOptions): Promise<TimeReportResponse> => request<TimeReportResponse>(ctx, E.signTimeReport, { body }, options);

/** `POST /TimeReports/SubmitTimeReport` — legacy: DIRU. */
export const submitTimeReport = (ctx: ApiContext, body: TimeReportActionInput, options?: RequestOptions): Promise<TimeReportResponse> => request<TimeReportResponse>(ctx, E.submitTimeReport, { body }, options);

/** `POST /CalOesMars/Validate` — legacy: DIRU. */
export const validateCalOesMarsWorkItem = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<OperationsResult<CalOesMarsValidation>> =>
  request<OperationsResult<CalOesMarsValidation>>(ctx, E.validateCalOesMarsWorkItem, { params }, options);
