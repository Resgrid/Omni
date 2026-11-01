import type {
  GetCurrentStaffingResult,
  GetCurrentStatusResult,
  SavePersonnelStaffingInput,
  SavePersonnelStaffingsInput,
  SavePersonsStaffingsResult,
  SavePersonsStatusesInput,
  SavePersonsStatusesResult,
  SavePersonStaffingResult,
  SavePersonStatusInput,
  SavePersonStatusResult,
  StatusesResult,
  UnitStatusesResult,
} from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for statuses (Statuses, PersonnelStaffing, PersonnelStatuses). The contract test checks every entry against Swagger. */
export const statusesEndpoints = defineEndpoints('statuses', {
  getAllPersonnelStaffings: { method: 'GET', path: '/Statuses/GetAllStaffingsForPersonnel' },
  getAllPersonnelStatuses: { method: 'GET', path: '/Statuses/GetAllStatusesForPersonnel' },
  getCurrentStaffing: { method: 'GET', path: '/PersonnelStaffing/GetCurrentStaffing', query: ['userId'] },
  getCurrentStatus: { method: 'GET', path: '/PersonnelStatuses/GetCurrentStatus', query: ['userId'] },
  getUnitTypeStatuses: { method: 'GET', path: '/Statuses/GetAllUnitStatuses' },
  savePersonsStaffings: { method: 'POST', path: '/PersonnelStaffing/SavePersonsStaffings', body: 'json' },
  savePersonsStatuses: { method: 'POST', path: '/PersonnelStatuses/SavePersonsStatuses', body: 'json' },
  savePersonStaffing: { method: 'POST', path: '/PersonnelStaffing/SavePersonStaffing', body: 'json' },
  savePersonStatus: { method: 'POST', path: '/PersonnelStatuses/SavePersonStatus', body: 'json' },
});

const E = statusesEndpoints;

/** Gets all available staffing levels for Personnel for the department. `GET /Statuses/GetAllStaffingsForPersonnel` — legacy: BDIRU. */
export const getAllPersonnelStaffings = (ctx: ApiContext, options?: RequestOptions): Promise<StatusesResult> => request<StatusesResult>(ctx, E.getAllPersonnelStaffings, {}, options);

/** Gets all available statuses for Personnel for the department. `GET /Statuses/GetAllStatusesForPersonnel` — legacy: BDIRU. */
export const getAllPersonnelStatuses = (ctx: ApiContext, options?: RequestOptions): Promise<StatusesResult> => request<StatusesResult>(ctx, E.getAllPersonnelStatuses, {}, options);

/** Gets the current staffing for a user. `GET /PersonnelStaffing/GetCurrentStaffing` — legacy: R. */
export const getCurrentStaffing = (ctx: ApiContext, params: { userId: string }, options?: RequestOptions): Promise<GetCurrentStaffingResult> =>
  request<GetCurrentStaffingResult>(ctx, E.getCurrentStaffing, { params }, options);

/** Gets the current status for a user. `GET /PersonnelStatuses/GetCurrentStatus` — legacy: DR. */
export const getCurrentStatus = (ctx: ApiContext, params: { userId: string }, options?: RequestOptions): Promise<GetCurrentStatusResult> => request<GetCurrentStatusResult>(ctx, E.getCurrentStatus, { params }, options);

/** Gets all active unit statuses for each unit type. `GET /Statuses/GetAllUnitStatuses` — legacy: BDIRU. */
export const getUnitTypeStatuses = (ctx: ApiContext, options?: RequestOptions): Promise<UnitStatusesResult> => request<UnitStatusesResult>(ctx, E.getUnitTypeStatuses, {}, options);

/** Saves a staffing for multiple personnel. `POST /PersonnelStaffing/SavePersonsStaffings` — legacy: DR. */
export const savePersonsStaffings = (ctx: ApiContext, body: SavePersonnelStaffingsInput, options?: RequestOptions): Promise<SavePersonsStaffingsResult> =>
  request<SavePersonsStaffingsResult>(ctx, E.savePersonsStaffings, { body }, options);

/** Saves a status for multiple personnel. `POST /PersonnelStatuses/SavePersonsStatuses` — legacy: DR. */
export const savePersonsStatuses = (ctx: ApiContext, body: SavePersonsStatusesInput, options?: RequestOptions): Promise<SavePersonsStatusesResult> =>
  request<SavePersonsStatusesResult>(ctx, E.savePersonsStatuses, { body }, options);

/** Saves a staffing for a person. `POST /PersonnelStaffing/SavePersonStaffing` — legacy: R. */
export const savePersonStaffing = (ctx: ApiContext, body: SavePersonnelStaffingInput, options?: RequestOptions): Promise<SavePersonStaffingResult> =>
  request<SavePersonStaffingResult>(ctx, E.savePersonStaffing, { body }, options);

/** Saves a status for a person. `POST /PersonnelStatuses/SavePersonStatus` — legacy: DR. */
export const savePersonStatus = (ctx: ApiContext, body: SavePersonStatusInput, options?: RequestOptions): Promise<SavePersonStatusResult> => request<SavePersonStatusResult>(ctx, E.savePersonStatus, { body }, options);
