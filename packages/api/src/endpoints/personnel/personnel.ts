import type { GetAllPersonnelInfosResult, GetPersonnelFilterOptionsResult, PersonnelInfoResult, PersonnelLocationInput, SaveUnitLocationResult } from '@resgrid/models';

import { type ApiContext, cachedRequest, type CachedRequestOptions, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for personnel (Personnel, PersonnelLocation). The contract test checks every entry against Swagger. */
export const personnelEndpoints = defineEndpoints('personnel', {
  getAllPersonnelInfos: { method: 'GET', path: '/Personnel/GetAllPersonnelInfos', query: ['activeFilter'] },
  getPersonnelFilterOptions: { method: 'GET', path: '/Personnel/GetPersonnelFilterOptions', cacheTtlMs: 15 * 60 * 1000 },
  getPersonnelInfo: { method: 'GET', path: '/Personnel/GetPersonnelInfo', query: ['userId'] },
  setPersonLocation: { method: 'POST', path: '/PersonnelLocation/SetPersonLocation', body: 'json' },
});

const E = personnelEndpoints;

/** Gets information about all users in a department. `GET /Personnel/GetAllPersonnelInfos` — legacy: BDIRU. */
export const getAllPersonnelInfos = (ctx: ApiContext, params: { activeFilter?: string } = {}, options?: RequestOptions): Promise<GetAllPersonnelInfosResult> =>
  request<GetAllPersonnelInfosResult>(ctx, E.getAllPersonnelInfos, { params }, options);

/** Gets all the options available to filter personnel against compatible Resgrid APIs. `GET /Personnel/GetPersonnelFilterOptions` (cached) — legacy: BDIRU. */
export const getPersonnelFilterOptions = (ctx: ApiContext, options?: CachedRequestOptions): Promise<GetPersonnelFilterOptionsResult> =>
  cachedRequest<GetPersonnelFilterOptionsResult>(ctx, E.getPersonnelFilterOptions, {}, options);

/** Gets information about a specific person. `GET /Personnel/GetPersonnelInfo` — legacy: BDIRU. */
export const getPersonnelInfo = (ctx: ApiContext, params: { userId: string }, options?: RequestOptions): Promise<PersonnelInfoResult> => request<PersonnelInfoResult>(ctx, E.getPersonnelInfo, { params }, options);

/** Sets the location of a person. `POST /PersonnelLocation/SetPersonLocation` — legacy: R. */
export const setPersonLocation = (ctx: ApiContext, body: PersonnelLocationInput, options?: RequestOptions): Promise<SaveUnitLocationResult> => request<SaveUnitLocationResult>(ctx, E.setPersonLocation, { body }, options);
