import type { ChecklistAccess, ChecklistCommandInput, ChecklistDuePage, ChecklistHistory, ChecklistProgressInput, ChecklistResult, ChecklistRun, ChecklistStartInput, ChecklistWitnessInput } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions, type UnknownV4Result } from '../../core';

/** Core v4 endpoints for checklists (ChecklistRuns). The contract test checks every entry against Swagger. */
export const checklistsEndpoints = defineEndpoints('checklists', {
  attestChecklistRun: { method: 'POST', path: '/ChecklistRuns/AttestChecklistRun', body: 'json' },
  completeChecklistRun: { method: 'POST', path: '/ChecklistRuns/CompleteChecklistRun', body: 'json' },
  deleteChecklistRunFile: { method: 'POST', path: '/ChecklistRuns/DeleteChecklistRunFile', body: 'json' },
  getChecklistAccess: { method: 'GET', path: '/ChecklistRuns/GetChecklistAccess' },
  getChecklistHistory: { method: 'GET', path: '/ChecklistRuns/GetChecklistHistory', query: ['Page', 'UnitId', 'AssetId', 'ForCurrentUser', 'DefinitionId', 'UserId', 'Start', 'End'] },
  getChecklistRun: { method: 'GET', path: '/ChecklistRuns/GetChecklistRun', query: ['id', 'occurrenceId'] },
  getChecklistRunFile: { method: 'GET', path: '/ChecklistRuns/GetChecklistRunFile', query: ['id'], responseType: 'arraybuffer' },
  getDueChecklists: { method: 'GET', path: '/ChecklistRuns/GetDueChecklists', query: ['Page', 'UnitId', 'AssetId', 'ForCurrentUser', 'DefinitionId', 'UserId', 'Start', 'End'] },
  getReadinessPacket: { method: 'GET', path: '/ChecklistRuns/GetReadinessPacket', query: ['callId', 'lookbackDays'] },
  saveChecklistRunProgress: { method: 'POST', path: '/ChecklistRuns/SaveChecklistRunProgress', body: 'json' },
  startChecklistRun: { method: 'POST', path: '/ChecklistRuns/StartChecklistRun', body: 'json' },
  uploadChecklistRunFile: { method: 'POST', path: '/ChecklistRuns/UploadChecklistRunFile', body: 'multipart' },
});

const E = checklistsEndpoints;

/** `POST /ChecklistRuns/AttestChecklistRun` — legacy: RU. */
export const attestChecklistRun = (ctx: ApiContext, body: ChecklistWitnessInput, options?: RequestOptions): Promise<ChecklistResult<ChecklistRun>> =>
  request<ChecklistResult<ChecklistRun>>(ctx, E.attestChecklistRun, { body }, options);

/** Submits a run (validated, then awaiting a witness or complete). `POST /ChecklistRuns/CompleteChecklistRun` — legacy: RU. */
export const completeChecklistRun = (ctx: ApiContext, body: ChecklistProgressInput, options?: RequestOptions): Promise<ChecklistResult<ChecklistRun>> =>
  request<ChecklistResult<ChecklistRun>>(ctx, E.completeChecklistRun, { body }, options);

/** Removes one evidence file from an open run (`Id` = file id, `Revision` = the run revision). `POST /ChecklistRuns/DeleteChecklistRunFile`. */
export const deleteChecklistRunFile = (ctx: ApiContext, body: ChecklistCommandInput, options?: RequestOptions): Promise<ChecklistResult<ChecklistRun>> =>
  request<ChecklistResult<ChecklistRun>>(ctx, E.deleteChecklistRunFile, { body }, options);

/** Fresh value-free scope and access state for secure local drafts. A mutation always repeats authorization and grant validation. `GET /ChecklistRuns/GetChecklistAccess` — legacy: RU. */
export const getChecklistAccess = (ctx: ApiContext, options?: RequestOptions): Promise<ChecklistResult<ChecklistAccess>> => request<ChecklistResult<ChecklistAccess>>(ctx, E.getChecklistAccess, {}, options);

/** `GET /ChecklistRuns/GetChecklistHistory` — legacy: RU. */
export const getChecklistHistory = (
  ctx: ApiContext,
  params: { Page?: number | string; UnitId?: string; AssetId?: string; ForCurrentUser?: boolean; DefinitionId?: string; UserId?: string; Start?: string; End?: string } = {},
  options?: RequestOptions
): Promise<ChecklistResult<ChecklistHistory[]>> => request<ChecklistResult<ChecklistHistory[]>>(ctx, E.getChecklistHistory, { params }, options);

/** Reads a run by ID, or previews a pinned scheduled occurrence without creating a run (exactly one of the two). `GET /ChecklistRuns/GetChecklistRun` — legacy: RU. */
export const getChecklistRun = (ctx: ApiContext, params: { id: string; occurrenceId?: undefined } | { id?: undefined; occurrenceId: string }, options?: RequestOptions): Promise<ChecklistResult<ChecklistRun>> =>
  request<ChecklistResult<ChecklistRun>>(ctx, E.getChecklistRun, { params }, options);

/** `GET /ChecklistRuns/GetChecklistRunFile` — legacy: RU. */
export const getChecklistRunFile = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<ArrayBuffer> => request<ArrayBuffer>(ctx, E.getChecklistRunFile, { params }, options);

/** Paged, authorized scheduled checks and published on-demand forms. Unit scope includes currently issued serialized assets when available. `GET /ChecklistRuns/GetDueChecklists` — legacy: RU. */
export const getDueChecklists = (
  ctx: ApiContext,
  params: { Page?: number | string; UnitId?: string; AssetId?: string; ForCurrentUser?: boolean; DefinitionId?: string; UserId?: string; Start?: string; End?: string } = {},
  options?: RequestOptions
): Promise<ChecklistResult<ChecklistDuePage>> => request<ChecklistResult<ChecklistDuePage>>(ctx, E.getDueChecklists, { params }, options);

/** Checklist evidence at the call time, with explicit unavailable historical inventory/deployment sources. This is a preview; RMS captures an immutable artifact separately. `GET /ChecklistRuns/GetReadinessPacket` — legacy: I. */
export const getReadinessPacket = (ctx: ApiContext, params: { callId: number | string; lookbackDays?: number | string }, options?: RequestOptions): Promise<UnknownV4Result> =>
  request<UnknownV4Result>(ctx, E.getReadinessPacket, { params }, options);

/** Saves answers without submitting; `Input.Revision` guards against a newer server copy. `POST /ChecklistRuns/SaveChecklistRunProgress` — legacy: RU. */
export const saveChecklistRunProgress = (ctx: ApiContext, body: ChecklistProgressInput, options?: RequestOptions): Promise<ChecklistResult<ChecklistRun>> =>
  request<ChecklistResult<ChecklistRun>>(ctx, E.saveChecklistRunProgress, { body }, options);

/** Starts or resumes one logical client GUID. The supplied published version is preserved for an offline on-demand run. `POST /ChecklistRuns/StartChecklistRun` — legacy: RU. */
export const startChecklistRun = (ctx: ApiContext, body: ChecklistStartInput, options?: RequestOptions): Promise<ChecklistResult<ChecklistRun>> =>
  request<ChecklistResult<ChecklistRun>>(ctx, E.startChecklistRun, { body }, options);

/** `POST /ChecklistRuns/UploadChecklistRunFile` — legacy: RU. */
export const uploadChecklistRunFile = (ctx: ApiContext, body: FormData, options?: RequestOptions): Promise<ChecklistResult<ChecklistRun>> =>
  request<ChecklistResult<ChecklistRun>>(ctx, E.uploadChecklistRunFile, { body }, options);
