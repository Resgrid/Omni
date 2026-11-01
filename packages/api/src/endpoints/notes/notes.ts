import type { NewNoteInput, NoteCategoryResult, NoteResult, NotesResult, SaveNoteResult } from '@resgrid/models';

import { type ApiContext, cachedRequest, type CachedRequestOptions, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for notes (Notes). The contract test checks every entry against Swagger. */
export const notesEndpoints = defineEndpoints('notes', {
  getAllNotes: { method: 'GET', path: '/Notes/GetAllNotes', cacheTtlMs: 15 * 60 * 1000 },
  getAllUnexpiredNotesByCategory: { method: 'GET', path: '/Notes/GetAllUnexpiredNotesByCategory', query: ['category', 'includeUnCategorized'] },
  getDispatchNote: { method: 'GET', path: '/Notes/GetDispatchNote', cacheTtlMs: 15 * 60 * 1000 },
  getNote: { method: 'GET', path: '/Notes/GetNote', query: ['noteId'] },
  getNoteCategories: { method: 'GET', path: '/Notes/GetNoteCategories', cacheTtlMs: 15 * 60 * 1000 },
  saveNote: { method: 'POST', path: '/Notes/SaveNote', body: 'json' },
});

const E = notesEndpoints;

/** Gets all notes for a department. `GET /Notes/GetAllNotes` (cached) — legacy: BDIRU. */
export const getAllNotes = (ctx: ApiContext, options?: CachedRequestOptions): Promise<NotesResult> => cachedRequest<NotesResult>(ctx, E.getAllNotes, {}, options);

/** Get's all the notes in a department that are not expired by a category. `GET /Notes/GetAllUnexpiredNotesByCategory` — legacy: BDIRU. */
export const getAllUnexpiredNotesByCategory = (ctx: ApiContext, params: { category?: string; includeUnCategorized?: boolean } = {}, options?: RequestOptions): Promise<NotesResult> =>
  request<NotesResult>(ctx, E.getAllUnexpiredNotesByCategory, { params }, options);

/** Gets the dispatch note (if any). A dispatch note is a Department note with the title of "Dispatch" or a note in a Category of "Dispatch". `GET /Notes/GetDispatchNote` (cached) — legacy: BDIRU. */
export const getDispatchNote = (ctx: ApiContext, options?: CachedRequestOptions): Promise<NotesResult> => cachedRequest<NotesResult>(ctx, E.getDispatchNote, {}, options);

/** Gets the dispatch note (if any). A dispatch note is a Department note with the title of "Dispatch" or a note in a Category of "Dispatch". `GET /Notes/GetNote` — legacy: BDIRU. */
export const getNote = (ctx: ApiContext, params: { noteId: number | string }, options?: RequestOptions): Promise<NoteResult> => request<NoteResult>(ctx, E.getNote, { params }, options);

/** Get's all the note Categories for a Department. `GET /Notes/GetNoteCategories` (cached) — legacy: BDIRU. */
export const getNoteCategories = (ctx: ApiContext, options?: CachedRequestOptions): Promise<NoteCategoryResult> => cachedRequest<NoteCategoryResult>(ctx, E.getNoteCategories, {}, options);

/** Saves a new note in the system. `POST /Notes/SaveNote` — legacy: BDIRU. */
export const saveNote = (ctx: ApiContext, body: NewNoteInput, options?: RequestOptions): Promise<SaveNoteResult> => request<SaveNoteResult>(ctx, E.saveNote, { body }, options);
