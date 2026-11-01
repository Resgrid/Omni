import { getAllNotes, getAllUnexpiredNotesByCategory, getDispatchNote, getNoteCategories, saveNote } from '@resgrid/api';
import type { NewNoteInput, NoteCategoryResultData, NoteResultData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { cacheOptions, createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

type NotesSlice = 'notes' | 'categories' | 'dispatchNotes' | 'byCategory';

interface NotesData extends SliceMeta<NotesSlice> {
  notes: NoteResultData[];
  categories: NoteCategoryResultData[];
  /** Notes shown on the dispatch console. */
  dispatchNotes: NoteResultData[];
  notesByCategory: Record<string, NoteResultData[]>;
  saveError: DataError | null;
}

export interface NotesState extends NotesData {
  fetchNotes: (options?: FetchOptions) => Promise<void>;
  fetchCategories: (options?: FetchOptions) => Promise<void>;
  fetchDispatchNotes: (options?: FetchOptions) => Promise<void>;
  fetchNotesByCategory: (category: string, options?: FetchOptions & { includeUnCategorized?: boolean }) => Promise<void>;
  /** Online only (department notes are edited by admins). */
  saveNote: (input: NewNoteInput) => Promise<boolean>;
}

const initialData = (): NotesData => ({ ...emptySliceMeta<NotesSlice>(), notes: [], categories: [], dispatchNotes: [], notesByCategory: {}, saveError: null });

let runner: SliceRunner<NotesSlice, NotesState>;

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<NotesSlice, NotesState>('notes', set);
      return {
        ...initialData(),
        fetchNotes: async (options) => {
          await runner.run(
            'notes',
            async () => unwrapList(await getAllNotes(getDataApiContext(), cacheOptions(options))),
            (notes) => ({ notes }),
            { trailing: options?.bypassCache === true }
          );
        },
        fetchCategories: async (options) => {
          await runner.run(
            'categories',
            async () => unwrapList(await getNoteCategories(getDataApiContext(), cacheOptions(options))),
            (categories) => ({ categories })
          );
        },
        fetchDispatchNotes: async (options) => {
          await runner.run(
            'dispatchNotes',
            async () => unwrapList(await getDispatchNote(getDataApiContext(), cacheOptions(options))),
            (dispatchNotes) => ({ dispatchNotes })
          );
        },
        fetchNotesByCategory: async (category, options) => {
          await runner.run(
            'byCategory',
            async () => unwrapList(await getAllUnexpiredNotesByCategory(getDataApiContext(), { category, includeUnCategorized: options?.includeUnCategorized ?? false })),
            (list, state) => ({ notesByCategory: { ...state.notesByCategory, [category]: list } }),
            { flightKey: `byCategory:${category}` }
          );
        },
        saveNote: async (input) => {
          set({ saveError: null });
          try {
            assertV4Success(await saveNote(getDataApiContext(), input));
            await get().fetchNotes({ bypassCache: true });
            return true;
          } catch (error) {
            set({ saveError: toDataError(error) });
            return false;
          }
        },
      };
    },
    dataPersistOptions<NotesState, Pick<NotesData, 'notes' | 'categories' | 'dispatchNotes' | 'fetchedAt'>>({
      name: 'omni-notes-storage',
      partialize: (state) => ({ notes: state.notes, categories: state.categories, dispatchNotes: state.dispatchNotes, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('omni-notes-storage', useNotesStore);
registerDataStoreReset<NotesState>('notes', useNotesStore, initialData, () => runner.invalidate());

/** Responder note search (pure; the query itself is view state). */
export const searchNotes = (notes: NoteResultData[], query: string): NoteResultData[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return notes;
  return notes.filter((note) => `${note.Title ?? ''} ${note.Body ?? ''} ${note.Category ?? ''}`.toLowerCase().includes(needle));
};
