import { getAllContactCategories, getAllContacts, getContact, getContactCallHistory, getContactFiles, getContactHazards, getContactNotes, getContactPreplan } from '@resgrid/api';
import type { ContactCategoryResultData, ContactFileResultData, ContactHazardData, ContactNoteResultData, ContactPreplanData, ContactResultData, LocationHistoryData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { unwrapItem, unwrapList } from '../core/envelope';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { cacheOptions, createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

type ContactsSlice = 'contacts' | 'categories' | 'detail' | 'notes' | 'preplan' | 'hazards' | 'files' | 'callHistory';

interface ContactsData extends SliceMeta<ContactsSlice> {
  contacts: ContactResultData[];
  categories: ContactCategoryResultData[];
  detailsById: Record<string, ContactResultData>;
  notesByContact: Record<string, ContactNoteResultData[]>;
  /** Dispatch pre-incident plans; null = the contact has none. */
  preplansByContact: Record<string, ContactPreplanData | null>;
  hazardsByContact: Record<string, ContactHazardData[]>;
  filesByContact: Record<string, ContactFileResultData[]>;
  callHistoryByContact: Record<string, LocationHistoryData | null>;
}

export interface ContactsState extends ContactsData {
  fetchContacts: (options?: FetchOptions) => Promise<void>;
  fetchCategories: (options?: FetchOptions) => Promise<void>;
  fetchContactDetails: (contactId: string, options?: FetchOptions) => Promise<void>;
  fetchContactNotes: (contactId: string, options?: FetchOptions) => Promise<void>;
  fetchPreplan: (contactId: string, options?: FetchOptions) => Promise<void>;
  fetchHazards: (contactId: string, options?: FetchOptions) => Promise<void>;
  fetchFiles: (contactId: string, options?: FetchOptions) => Promise<void>;
  fetchCallHistory: (contactId: string, options?: FetchOptions) => Promise<void>;
  /** Drops one contact's cached detail rows (after an edit elsewhere). */
  invalidateContact: (contactId: string) => void;
}

const initialData = (): ContactsData => ({
  ...emptySliceMeta<ContactsSlice>(),
  contacts: [],
  categories: [],
  detailsById: {},
  notesByContact: {},
  preplansByContact: {},
  hazardsByContact: {},
  filesByContact: {},
  callHistoryByContact: {},
});

const omitKey = <T>(record: Record<string, T>, key: string): Record<string, T> => {
  const next = { ...record };
  delete next[key];
  return next;
};

let runner: SliceRunner<ContactsSlice, ContactsState>;

export const useContactsStore = create<ContactsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<ContactsSlice, ContactsState>('contacts', set);
      const perContact =
        <T>(slice: ContactsSlice, field: keyof ContactsData, load: (contactId: string) => Promise<T>) =>
        async (contactId: string, options?: FetchOptions): Promise<void> => {
          const existing = get()[field] as Record<string, unknown>;
          if (!options?.bypassCache && contactId in existing) return;
          await runner.run(
            slice,
            () => load(contactId),
            (value, state) => ({ [field]: { ...(state[field] as Record<string, unknown>), [contactId]: value } }) as Partial<ContactsState>,
            {
              flightKey: `${slice}:${contactId}`,
            }
          );
        };

      return {
        ...initialData(),

        fetchContacts: async (options) => {
          await runner.run(
            'contacts',
            async () => unwrapList(await getAllContacts(getDataApiContext(), cacheOptions(options))),
            (contacts) => ({ contacts }),
            { trailing: options?.bypassCache === true }
          );
        },

        fetchCategories: async (options) => {
          await runner.run(
            'categories',
            async () => unwrapList(await getAllContactCategories(getDataApiContext(), cacheOptions(options))),
            (categories) => ({ categories })
          );
        },

        fetchContactDetails: async (contactId) => {
          await runner.run(
            'detail',
            async () => unwrapItem(await getContact(getDataApiContext(), { contactId })),
            (contact, state) => (contact ? { detailsById: { ...state.detailsById, [contactId]: contact } } : {}),
            { flightKey: `detail:${contactId}` }
          );
        },

        fetchContactNotes: perContact('notes', 'notesByContact', async (contactId) => unwrapList(await getContactNotes(getDataApiContext(), { contactId }))),
        fetchPreplan: perContact('preplan', 'preplansByContact', async (contactId) => unwrapItem(await getContactPreplan(getDataApiContext(), { contactId }))),
        fetchHazards: perContact('hazards', 'hazardsByContact', async (contactId) => unwrapList(await getContactHazards(getDataApiContext(), { contactId }))),
        fetchFiles: perContact('files', 'filesByContact', async (contactId) => unwrapList(await getContactFiles(getDataApiContext(), { contactId, includeData: false }))),
        fetchCallHistory: perContact('callHistory', 'callHistoryByContact', async (contactId) => unwrapItem(await getContactCallHistory(getDataApiContext(), { contactId }))),

        invalidateContact: (contactId) =>
          set((state) => ({
            detailsById: omitKey(state.detailsById, contactId),
            notesByContact: omitKey(state.notesByContact, contactId),
            preplansByContact: omitKey(state.preplansByContact, contactId),
            hazardsByContact: omitKey(state.hazardsByContact, contactId),
            filesByContact: omitKey(state.filesByContact, contactId),
            callHistoryByContact: omitKey(state.callHistoryByContact, contactId),
          })),
      };
    },
    dataPersistOptions<ContactsState, Pick<ContactsData, 'contacts' | 'categories' | 'notesByContact' | 'preplansByContact' | 'hazardsByContact' | 'fetchedAt'>>({
      name: 'omni-contacts-storage',
      // Files carry signed links and call history is re-read online; neither is persisted.
      partialize: (state) => ({
        contacts: state.contacts,
        categories: state.categories,
        notesByContact: state.notesByContact,
        preplansByContact: state.preplansByContact,
        hazardsByContact: state.hazardsByContact,
        fetchedAt: state.fetchedAt,
      }),
    })
  )
);

registerPersistedStore('omni-contacts-storage', useContactsStore);
registerDataStoreReset<ContactsState>('contacts', useContactsStore, initialData, () => runner.invalidate());
