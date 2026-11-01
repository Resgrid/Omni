import type {
  AcknowledgeUnitStatusAlertInput,
  ActiveUnitRolesResult,
  GetUnitFilterOptionsResult,
  GetUnitStatusAlertAcknowledgementsResult,
  SaveUnitLocationResult,
  SaveUnitStatusAlertAcknowledgementResult,
  SaveUnitStatusResult,
  SetUnitRolesInput,
  UnitLocationInput,
  UnitLocationResult,
  UnitRolesForUnitResult,
  UnitsInfoResult,
  UnitsResult,
  UnitStatusesResult,
  UnitStatusInput,
  UnitStatusResult,
} from '@resgrid/models';

import { type ApiContext, cachedRequest, type CachedRequestOptions, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for units (UnitStatusAlerts, UnitRoles, Units, UnitStatus, UnitLocation). The contract test checks every entry against Swagger. */
export const unitsEndpoints = defineEndpoints('units', {
  acknowledgeUnitStatusAlert: { method: 'POST', path: '/UnitStatusAlerts/Acknowledge', body: 'json' },
  clearUnitStatusAlert: { method: 'DELETE', path: '/UnitStatusAlerts/Clear/{id}' },
  getActiveUnitStatusAlertAcknowledgements: { method: 'GET', path: '/UnitStatusAlerts/GetActiveAcknowledgements' },
  getAllUnitRolesAndAssignmentsForDepartment: { method: 'GET', path: '/UnitRoles/GetAllUnitRolesAndAssignmentsForDepartment' },
  getAllUnits: { method: 'GET', path: '/Units/GetAllUnits', cacheTtlMs: 15 * 60 * 1000 },
  getAllUnitsInfos: { method: 'GET', path: '/Units/GetAllUnitsInfos', query: ['activeFilter'], cacheTtlMs: 15 * 60 * 1000 },
  getAllUnitStatuses: { method: 'GET', path: '/UnitStatus/GetAllUnitStatuses' },
  getLatestUnitLocation: { method: 'GET', path: '/UnitLocation/GetLatestUnitLocation', query: ['unitId'] },
  getRoleAssignmentsForUnit: { method: 'GET', path: '/UnitRoles/GetRoleAssignmentsForUnit', query: ['unitId'] },
  getRolesForUnit: { method: 'GET', path: '/UnitRoles/GetRolesForUnit', query: ['unitId'], cacheTtlMs: 15 * 60 * 1000 },
  getUnitsFilterOptions: { method: 'GET', path: '/Units/GetUnitsFilterOptions', cacheTtlMs: 15 * 60 * 1000 },
  getUnitStatus: { method: 'GET', path: '/UnitStatus/GetUnitStatus', query: ['unitId'] },
  saveUnitStatus: { method: 'POST', path: '/UnitStatus/SaveUnitStatus', body: 'json' },
  setRoleAssignmentsForUnit: { method: 'POST', path: '/UnitRoles/SetRoleAssignmentsForUnit', body: 'json' },
  setUnitLocation: { method: 'POST', path: '/UnitLocation/SetUnitLocation', body: 'json' },
});

const E = unitsEndpoints;

/** Acknowledges or mutes the status timer alert for a unit's current status, optionally with a note. Replaces any earlier acknowledgement of the same status. `POST /UnitStatusAlerts/Acknowledge` — legacy: B. */
export const acknowledgeUnitStatusAlert = (ctx: ApiContext, body: AcknowledgeUnitStatusAlertInput, options?: RequestOptions): Promise<SaveUnitStatusAlertAcknowledgementResult> =>
  request<SaveUnitStatusAlertAcknowledgementResult>(ctx, E.acknowledgeUnitStatusAlert, { body }, options);

/** Withdraws an acknowledgement, so the alert shows as unacknowledged again. Clearing one that is already cleared succeeds. `DELETE /UnitStatusAlerts/Clear/{id}` — legacy: B. */
export const clearUnitStatusAlert = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<SaveUnitStatusAlertAcknowledgementResult> =>
  request<SaveUnitStatusAlertAcknowledgementResult>(ctx, E.clearUnitStatusAlert, { params }, options);

/** Gets the acknowledgements that cover each unit's current status episode. Acknowledgements for units the caller cannot see are left out. `GET /UnitStatusAlerts/GetActiveAcknowledgements` — legacy: B. */
export const getActiveUnitStatusAlertAcknowledgements = (ctx: ApiContext, options?: RequestOptions): Promise<GetUnitStatusAlertAcknowledgementsResult> =>
  request<GetUnitStatusAlertAcknowledgementsResult>(ctx, E.getActiveUnitStatusAlertAcknowledgements, {}, options);

/** Gets all the roles for every unit in a department plus who is currently assigned to that unit role (accountability). `GET /UnitRoles/GetAllUnitRolesAndAssignmentsForDepartment` — legacy: BDIRU. */
export const getAllUnitRolesAndAssignmentsForDepartment = (ctx: ApiContext, options?: RequestOptions): Promise<ActiveUnitRolesResult> =>
  request<ActiveUnitRolesResult>(ctx, E.getAllUnitRolesAndAssignmentsForDepartment, {}, options);

/** Gets all the Units for a Department. `GET /Units/GetAllUnits` (cached) — legacy: BDIRU. */
export const getAllUnits = (ctx: ApiContext, options?: CachedRequestOptions): Promise<UnitsResult> => cachedRequest<UnitsResult>(ctx, E.getAllUnits, {}, options);

/** Gets all the Units for a Department. `GET /Units/GetAllUnitsInfos` (cached) — legacy: BDIRU. */
export const getAllUnitsInfos = (ctx: ApiContext, params: { activeFilter?: string } = {}, options?: CachedRequestOptions): Promise<UnitsInfoResult> =>
  cachedRequest<UnitsInfoResult>(ctx, E.getAllUnitsInfos, { params }, options);

/** Gets all the units in a departments current (latest) status (state) or a default. `GET /UnitStatus/GetAllUnitStatuses` — legacy: BDIU. */
export const getAllUnitStatuses = (ctx: ApiContext, options?: RequestOptions): Promise<UnitStatusesResult> => request<UnitStatusesResult>(ctx, E.getAllUnitStatuses, {}, options);

/** Gets the latest location for a specified unit. `GET /UnitLocation/GetLatestUnitLocation` — legacy: BDIU. */
export const getLatestUnitLocation = (ctx: ApiContext, params: { unitId: string }, options?: RequestOptions): Promise<UnitLocationResult> => request<UnitLocationResult>(ctx, E.getLatestUnitLocation, { params }, options);

/** Gets the accountability roles and the current assignments for a unit. `GET /UnitRoles/GetRoleAssignmentsForUnit` — legacy: BDIU. */
export const getRoleAssignmentsForUnit = (ctx: ApiContext, params: { unitId: string }, options?: RequestOptions): Promise<ActiveUnitRolesResult> =>
  request<ActiveUnitRolesResult>(ctx, E.getRoleAssignmentsForUnit, { params }, options);

/** Gets the accountability roles for a unit. `GET /UnitRoles/GetRolesForUnit` (cached) — legacy: BDIU. */
export const getRolesForUnit = (ctx: ApiContext, params: { unitId: string }, options?: CachedRequestOptions): Promise<UnitRolesForUnitResult> =>
  cachedRequest<UnitRolesForUnitResult>(ctx, E.getRolesForUnit, { params }, options);

/** Gets all the options available to filter units against compatible Resgrid APIs. `GET /Units/GetUnitsFilterOptions` (cached) — legacy: BDIRU. */
export const getUnitsFilterOptions = (ctx: ApiContext, options?: CachedRequestOptions): Promise<GetUnitFilterOptionsResult> => cachedRequest<GetUnitFilterOptionsResult>(ctx, E.getUnitsFilterOptions, {}, options);

/** Gets the unit status for a specific unit id. `GET /UnitStatus/GetUnitStatus` — legacy: BDIU. */
export const getUnitStatus = (ctx: ApiContext, params: { unitId: string }, options?: RequestOptions): Promise<UnitStatusResult> => request<UnitStatusResult>(ctx, E.getUnitStatus, { params }, options);

/** Sets the status/action for the current user. `POST /UnitStatus/SaveUnitStatus` — legacy: BDIU. */
export const saveUnitStatus = (ctx: ApiContext, body: UnitStatusInput, options?: RequestOptions): Promise<SaveUnitStatusResult> => request<SaveUnitStatusResult>(ctx, E.saveUnitStatus, { body }, options);

/** Sets the accountability roles and the current assignments for a unit. `POST /UnitRoles/SetRoleAssignmentsForUnit` — legacy: BDIU. */
export const setRoleAssignmentsForUnit = (ctx: ApiContext, body: SetUnitRolesInput, options?: RequestOptions): Promise<ActiveUnitRolesResult> =>
  request<ActiveUnitRolesResult>(ctx, E.setRoleAssignmentsForUnit, { body }, options);

/** Sets the location of a unit. `POST /UnitLocation/SetUnitLocation` — legacy: BDIU. */
export const setUnitLocation = (ctx: ApiContext, body: UnitLocationInput, options?: RequestOptions): Promise<SaveUnitLocationResult> => request<SaveUnitLocationResult>(ctx, E.setUnitLocation, { body }, options);
