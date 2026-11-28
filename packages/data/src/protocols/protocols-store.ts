import { getAllProtocols, getProtocol, getProtocolCategories, getProtocolVersionContent } from '@resgrid/api';
import type { CallProtocolsResultData, ProtocolCategoryResultData, ProtocolVersionContentData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { unwrapItem, unwrapList } from '../core/envelope';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { cacheOptions, createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';
import { type PersistedProtocolsV0, type ProtocolLibraryEntry, toCallProtocol, toCallProtocols, toLibraryEntries, toLibraryEntry } from './protocol-wire';

type ProtocolsSlice = 'protocols' | 'detail' | 'version' | 'categories';

interface ProtocolsData extends SliceMeta<ProtocolsSlice> {
  protocols: CallProtocolsResultData[];
  protocolDetailsById: Record<string, CallProtocolsResultData>;
  /** Kind, number, version in force and attachments by protocol id (protocols plan P1). */
  libraryById: Record<string, ProtocolLibraryEntry>;
  /** The department's protocol categories (library filter). */
  categories: ProtocolCategoryResultData[];
  /** The version in force as the reader is shown it (translated, with its steps), by version id; kept for offline reading. */
  versionContentById: Record<string, ProtocolVersionContentData>;
}

export interface ProtocolsState extends ProtocolsData {
  fetchProtocols: (options?: FetchOptions) => Promise<void>;
  fetchProtocol: (protocolId: string, options?: FetchOptions) => Promise<CallProtocolsResultData | null>;
  /** A version's content in the reader's language (`locale`, else the source); the persisted copy when the read fails. */
  fetchVersionContent: (protocolVersionId: string, options?: FetchOptions & { locale?: string }) => Promise<ProtocolVersionContentData | null>;
  fetchCategories: (options?: FetchOptions) => Promise<void>;
}

const initialData = (): ProtocolsData => ({ ...emptySliceMeta<ProtocolsSlice>(), protocols: [], protocolDetailsById: {}, libraryById: {}, categories: [], versionContentById: {} });

type PersistedProtocols = Pick<ProtocolsData, 'protocols' | 'protocolDetailsById' | 'libraryById' | 'categories' | 'versionContentById' | 'fetchedAt'>;

/**
 * Retention for the offline version copies: only versions in force for a protocol the member may still read are kept, so a
 * superseded or retired version leaves the device at the next library refresh.
 */
export function retainCurrentVersions(content: Record<string, ProtocolVersionContentData>, library: Record<string, ProtocolLibraryEntry>): Record<string, ProtocolVersionContentData> {
  const current = new Set(Object.values(library).flatMap((entry) => (entry.CurrentVersionId ? [entry.CurrentVersionId] : [])));

  return Object.fromEntries(Object.entries(content).filter(([versionId]) => current.has(versionId)));
}

/**
 * v0 → v1: version 0 kept the `Protocols` controller's raw items (`ProtocolId`, no `Id`), so a protocol could not be
 * opened until the list was fetched again; they now convert to the screen shape like a fresh answer does. A null entry
 * or a nested list that is not an array is dropped instead of throwing, so the usable protocols still hydrate (a throw
 * here left the list empty, offline, until the next fetch).
 */
export function migrateProtocolsStorage(persisted: PersistedProtocolsV0 | null): PersistedProtocols {
  return {
    protocols: toCallProtocols(persisted?.protocols),
    protocolDetailsById: persisted?.protocolDetailsById ?? {},
    libraryById: toLibraryEntries(persisted?.protocols),
    categories: [],
    versionContentById: {},
    fetchedAt: persisted?.fetchedAt ?? {},
  };
}

/** Whether a version is the one in force for some protocol of the library (what `retainCurrentVersions` keeps). */
const isCurrentVersion = (library: Record<string, ProtocolLibraryEntry>, protocolVersionId: string): boolean => Object.values(library).some((entry) => entry.CurrentVersionId === protocolVersionId);

/** A cached copy answers a request in `locale` when it is in that locale, and a source request (no locale) only when it is the source. */
const answersLocale = (content: ProtocolVersionContentData, locale: string | undefined): boolean => (locale ? content.Locale === locale : content.TranslationId === null);

let runner: SliceRunner<ProtocolsSlice, ProtocolsState>;

/**
 * The library entries come from two reads (the list and one protocol's detail) that race each other. Each read takes a ticket when
 * it starts, and an entry is replaced only by a read that started after the one that wrote it, so an older answer landing last
 * never brings back a superseded version in force.
 */
const library = { ticket: 0, writtenBy: new Map<string, number>() };

/** The list's entries, except those a read that started after this list read already wrote. */
function mergeLibrary(listed: Record<string, ProtocolLibraryEntry>, current: Record<string, ProtocolLibraryEntry>, ticket: number) {
  const writtenLater = (protocolId: string): boolean => (library.writtenBy.get(protocolId) ?? 0) > ticket;
  const merged = new Map<string, ProtocolLibraryEntry>();

  for (const [protocolId, entry] of Object.entries(listed)) {
    const newer = writtenLater(protocolId) ? current[protocolId] : undefined;

    merged.set(protocolId, newer ?? entry);

    if (!newer) library.writtenBy.set(protocolId, ticket);
  }

  // A protocol the list no longer has is gone, unless a later read found it.
  for (const [protocolId, entry] of Object.entries(current)) {
    if (!merged.has(protocolId) && writtenLater(protocolId)) merged.set(protocolId, entry);
  }

  for (const protocolId of [...library.writtenBy.keys()]) {
    if (!merged.has(protocolId)) library.writtenBy.delete(protocolId);
  }

  return Object.fromEntries(merged);
}

export const useProtocolsStore = create<ProtocolsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<ProtocolsSlice, ProtocolsState>('protocols', set);

      return {
        ...initialData(),
        fetchProtocols: async (options) => {
          let ticket = 0;

          await runner.run(
            'protocols',
            async () => {
              // The ticket is taken when the read really starts (a trailing read waits for the one in flight first).
              ticket = ++library.ticket;
              const list = unwrapList(await getAllProtocols(getDataApiContext(), cacheOptions(options)));

              return { protocols: toCallProtocols(list), libraryById: toLibraryEntries(list) };
            },
            ({ protocols, libraryById }, state) => {
              const merged = mergeLibrary(libraryById, state.libraryById, ticket);

              return { protocols, libraryById: merged, versionContentById: retainCurrentVersions(state.versionContentById, merged) };
            },
            { trailing: options?.bypassCache === true }
          );
        },
        fetchProtocol: async (protocolId, options) => {
          const cached = get().protocolDetailsById[protocolId];

          if (cached && !options?.bypassCache) return cached;
          let ticket = 0;

          const result = await runner.run(
            'detail',
            // GetProtocol answers one protocol in `Data` (not a list), so reading it as a list never kept a detail.
            async () => {
              ticket = ++library.ticket;
              const protocol = unwrapItem(await getProtocol(getDataApiContext(), { protocolId }));

              return protocol ? { protocol: toCallProtocol(protocol), entry: toLibraryEntry(protocol) } : null;
            },
            (found, state) => {
              if (!found) return {};
              const patch: Partial<ProtocolsData> = { protocolDetailsById: { ...state.protocolDetailsById, [protocolId]: found.protocol } };

              // A list read that started after this one already wrote the entry: its version in force is the newer one.
              if (found.entry && (library.writtenBy.get(protocolId) ?? 0) < ticket) {
                patch.libraryById = { ...state.libraryById, [protocolId]: found.entry };
                library.writtenBy.set(protocolId, ticket);
              }

              return patch;
            },
            { flightKey: `detail:${protocolId}` }
          );

          return result.ok ? (result.value?.protocol ?? null) : (cached ?? get().protocols.find((protocol) => protocol.Id === protocolId) ?? null);
        },
        fetchCategories: async (options) => {
          await runner.run(
            'categories',
            async () => unwrapList(await getProtocolCategories(getDataApiContext(), cacheOptions(options))),
            (categories) => ({ categories })
          );
        },
        fetchVersionContent: async (protocolVersionId, options) => {
          const cached = get().versionContentById[protocolVersionId];

          if (cached && !options?.bypassCache && answersLocale(cached, options?.locale)) return cached;
          // An owed version that is not (or no longer) in force may be read and kept for the reader; a version that stopped
          // being in force while it was read was pruned by that library refresh, and is not written back.
          const wasCurrent = isCurrentVersion(get().libraryById, protocolVersionId);

          const result = await runner.run(
            'version',
            async () => {
              const params: Parameters<typeof getProtocolVersionContent>[1] = { protocolVersionId };

              if (options?.locale) params.locale = options.locale;

              return unwrapItem(await getProtocolVersionContent(getDataApiContext(), params));
            },
            (content, state) => (content && !(wasCurrent && !isCurrentVersion(state.libraryById, protocolVersionId)) ? { versionContentById: { ...state.versionContentById, [protocolVersionId]: content } } : {}),
            // One flight per language; one race lane per stored copy, so the language asked for last is the one kept.
            { flightKey: `version:${protocolVersionId}:${options?.locale ?? ''}`, raceKey: `version:${protocolVersionId}` }
          );

          // A source read that fails falls back to the stored copy in any language (documented on `fetchVersionContent`).
          return result.ok ? (result.value ?? cached ?? null) : (cached ?? null);
        },
      };
    },
    dataPersistOptions<ProtocolsState, PersistedProtocols>({
      name: 'omni-protocols-storage',
      version: 1,
      partialize: (state) => ({
        protocols: state.protocols,
        protocolDetailsById: state.protocolDetailsById,
        libraryById: state.libraryById,
        categories: state.categories,
        versionContentById: state.versionContentById,
        fetchedAt: state.fetchedAt,
      }),
      // SAFETY: zustand hands over whatever JSON this name held; version 0 is the PersistedProtocolsV0 shape and every field is optional.
      migrate: (persisted) => migrateProtocolsStorage(persisted as PersistedProtocolsV0 | null),
    })
  )
);

registerPersistedStore('omni-protocols-storage', useProtocolsStore);

registerDataStoreReset<ProtocolsState>('protocols', useProtocolsStore, initialData, () => {
  runner.invalidate();
  library.writtenBy.clear();
});
