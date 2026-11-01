import type {
  ContactFilesResult,
  ContactHazardsResult,
  ContactPreplanResult,
  ContactResult,
  ContactsCategoriesResult,
  ContactsNotesResult,
  ContactsResult,
  DeleteContactFileResult,
  DeleteContactHazardResult,
  DeleteContactPreplanResult,
  LocationHistoryResult,
  SaveContactHazardInput,
  SaveContactHazardResult,
  SaveContactPreplanInput,
  SaveContactPreplanResult,
  UploadContactFileInput,
  UploadContactFileResult,
} from '@resgrid/models';

import { type ApiContext, cachedRequest, type CachedRequestOptions, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for contacts (ContactFiles, Contacts). The contract test checks every entry against Swagger. */
export const contactsEndpoints = defineEndpoints('contacts', {
  deleteContactFile: { method: 'DELETE', path: '/ContactFiles/DeleteContactFile', query: ['contactFileId'] },
  deleteContactHazard: { method: 'DELETE', path: '/Contacts/DeleteContactHazard', query: ['contactPreplanHazardId'] },
  deleteContactPreplan: { method: 'DELETE', path: '/Contacts/DeleteContactPreplan', query: ['contactId'] },
  getAllContactCategories: { method: 'GET', path: '/Contacts/GetAllContactCategories', cacheTtlMs: 15 * 60 * 1000 },
  getAllContacts: { method: 'GET', path: '/Contacts/GetAllContacts', cacheTtlMs: 15 * 60 * 1000 },
  getContact: { method: 'GET', path: '/Contacts/GetContactById', query: ['contactId'] },
  getContactCallHistory: { method: 'GET', path: '/Contacts/GetContactCallHistory', query: ['contactId'] },
  getContactFiles: { method: 'GET', path: '/ContactFiles/GetFilesForContact', query: ['contactId', 'includeData', 'type'] },
  getContactHazards: { method: 'GET', path: '/Contacts/GetContactHazards', query: ['contactId'] },
  getContactNotes: { method: 'GET', path: '/Contacts/GetContactNotesByContactId', query: ['contactId'] },
  getContactPreplan: { method: 'GET', path: '/Contacts/GetContactPreplan', query: ['contactId'] },
  saveContactHazard: { method: 'POST', path: '/Contacts/SaveContactHazard', body: 'json' },
  saveContactPreplan: { method: 'POST', path: '/Contacts/SaveContactPreplan', body: 'json' },
  uploadContactFile: { method: 'POST', path: '/ContactFiles/UploadContactFile', body: 'json' },
});

const E = contactsEndpoints;

/** Removes a file from a contact. `DELETE /ContactFiles/DeleteContactFile` — legacy: DIRU. */
export const deleteContactFile = (ctx: ApiContext, params: { contactFileId: number | string }, options?: RequestOptions): Promise<DeleteContactFileResult> =>
  request<DeleteContactFileResult>(ctx, E.deleteContactFile, { params }, options);

/** Removes a premise hazard from a contact. `DELETE /Contacts/DeleteContactHazard` — legacy: DIRU. */
export const deleteContactHazard = (ctx: ApiContext, params: { contactPreplanHazardId: string }, options?: RequestOptions): Promise<DeleteContactHazardResult> =>
  request<DeleteContactHazardResult>(ctx, E.deleteContactHazard, { params }, options);

/** Removes the pre-incident plan (and its hazards) from a contact. `DELETE /Contacts/DeleteContactPreplan` — legacy: DIRU. */
export const deleteContactPreplan = (ctx: ApiContext, params: { contactId: string }, options?: RequestOptions): Promise<DeleteContactPreplanResult> =>
  request<DeleteContactPreplanResult>(ctx, E.deleteContactPreplan, { params }, options);

/** Gets all the contact categories for the department. `GET /Contacts/GetAllContactCategories` (cached) — legacy: BDIRU. */
export const getAllContactCategories = (ctx: ApiContext, options?: CachedRequestOptions): Promise<ContactsCategoriesResult> => cachedRequest<ContactsCategoriesResult>(ctx, E.getAllContactCategories, {}, options);

/** Gets all the contacts for the department. `GET /Contacts/GetAllContacts` (cached) — legacy: BDIRU. */
export const getAllContacts = (ctx: ApiContext, options?: CachedRequestOptions): Promise<ContactsResult> => cachedRequest<ContactsResult>(ctx, E.getAllContacts, {}, options);

/** Gets the contact by id. `GET /Contacts/GetContactById` — legacy: BDIRU. */
export const getContact = (ctx: ApiContext, params: { contactId: string }, options?: RequestOptions): Promise<ContactResult> => request<ContactResult>(ctx, E.getContact, { params }, options);

/** Calls related to a contact: calls linked to it, plus calls at every occupancy it is linked to (one contact can be linked to several, such as a business with more than one location), newest first with their notes. `GET /Contacts/GetContactCallHistory` — legacy: DIRU. */
export const getContactCallHistory = (ctx: ApiContext, params: { contactId: string }, options?: RequestOptions): Promise<LocationHistoryResult> =>
  request<LocationHistoryResult>(ctx, E.getContactCallHistory, { params }, options);

/** Gets the files attached to a contact. `GET /ContactFiles/GetFilesForContact` — legacy: DIRU. */
export const getContactFiles = (ctx: ApiContext, params: { contactId: string; includeData?: boolean; type?: number | string }, options?: RequestOptions): Promise<ContactFilesResult> =>
  request<ContactFilesResult>(ctx, E.getContactFiles, { params }, options);

/** Gets the premise hazards for a contact, most severe first. `GET /Contacts/GetContactHazards` — legacy: DIRU. */
export const getContactHazards = (ctx: ApiContext, params: { contactId: string }, options?: RequestOptions): Promise<ContactHazardsResult> => request<ContactHazardsResult>(ctx, E.getContactHazards, { params }, options);

/** Gets all the Notes for a Contact by the contact id. `GET /Contacts/GetContactNotesByContactId` — legacy: BDIRU. */
export const getContactNotes = (ctx: ApiContext, params: { contactId: string }, options?: RequestOptions): Promise<ContactsNotesResult> => request<ContactsNotesResult>(ctx, E.getContactNotes, { params }, options);

/** Gets the pre-incident plan for a contact (with its hazards). Data is null when the contact has none. `GET /Contacts/GetContactPreplan` — legacy: DIRU. */
export const getContactPreplan = (ctx: ApiContext, params: { contactId: string }, options?: RequestOptions): Promise<ContactPreplanResult> => request<ContactPreplanResult>(ctx, E.getContactPreplan, { params }, options);

/** Creates (no id) or updates (with id) a premise hazard on a contact. `POST /Contacts/SaveContactHazard` — legacy: DIRU. */
export const saveContactHazard = (ctx: ApiContext, body: SaveContactHazardInput, options?: RequestOptions): Promise<SaveContactHazardResult> =>
  request<SaveContactHazardResult>(ctx, E.saveContactHazard, { body }, options);

/** Creates or replaces the pre-incident plan for a contact. `POST /Contacts/SaveContactPreplan` — legacy: DIRU. */
export const saveContactPreplan = (ctx: ApiContext, body: SaveContactPreplanInput, options?: RequestOptions): Promise<SaveContactPreplanResult> =>
  request<SaveContactPreplanResult>(ctx, E.saveContactPreplan, { body }, options);

/** Attaches a file to a contact. `POST /ContactFiles/UploadContactFile` — legacy: DIRU. */
export const uploadContactFile = (ctx: ApiContext, body: UploadContactFileInput, options?: RequestOptions): Promise<UploadContactFileResult> =>
  request<UploadContactFileResult>(ctx, E.uploadContactFile, { body }, options);
