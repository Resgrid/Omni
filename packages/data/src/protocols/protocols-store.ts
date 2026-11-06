import { getAllProtocols, getProtocol } from '@resgrid/api';
import type { CallProtocolsResultData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { unwrapItem, unwrapList } from '../core/envelope';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { cacheOptions, createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';
import { type PersistedProtocolsV0, toCallProtocol, toCallProtocols } from './protocol-wire';

type ProtocolsSlice = 'protocols' | 'detail';

interface ProtocolsData extends SliceMeta<ProtocolsSlice> {
  protocols: CallProtocolsResultData[];
  protocolDetailsById: Record<string, CallProtocolsResultData>;
}

export interface ProtocolsState extends ProtocolsData {
  fetchProtocols: (options?: FetchOptions) => Promise<void>;
  fetchProtocol: (protocolId: string, options?: FetchOptions) => Promise<CallProtocolsResultData | null>;
}

const initialData = (): ProtocolsData => ({ ...emptySliceMeta<ProtocolsSlice>(), protocols: [], protocolDetailsById: {} });

type PersistedProtocols = Pick<ProtocolsData, 'protocols' | 'protocolDetailsById' | 'fetchedAt'>;

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
    fetchedAt: persisted?.fetchedAt ?? {},
  };
}

let runner: SliceRunner<ProtocolsSlice, ProtocolsState>;

export const useProtocolsStore = create<ProtocolsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<ProtocolsSlice, ProtocolsState>('protocols', set);
      return {
        ...initialData(),
        fetchProtocols: async (options) => {
          await runner.run(
            'protocols',
            async () => toCallProtocols(unwrapList(await getAllProtocols(getDataApiContext(), cacheOptions(options)))),
            (protocols) => ({ protocols }),
            { trailing: options?.bypassCache === true }
          );
        },
        fetchProtocol: async (protocolId, options) => {
          const cached = get().protocolDetailsById[protocolId];
          if (cached && !options?.bypassCache) return cached;
          const result = await runner.run(
            'detail',
            // GetProtocol answers one protocol in `Data` (not a list), so reading it as a list never kept a detail.
            async () => {
              const protocol = unwrapItem(await getProtocol(getDataApiContext(), { protocolId }));

              return protocol ? toCallProtocol(protocol) : null;
            },
            (protocol, state) => (protocol ? { protocolDetailsById: { ...state.protocolDetailsById, [protocolId]: protocol } } : {}),
            { flightKey: `detail:${protocolId}` }
          );
          return result.ok ? result.value : (cached ?? get().protocols.find((protocol) => protocol.Id === protocolId) ?? null);
        },
      };
    },
    dataPersistOptions<ProtocolsState, PersistedProtocols>({
      name: 'omni-protocols-storage',
      version: 1,
      partialize: (state) => ({ protocols: state.protocols, protocolDetailsById: state.protocolDetailsById, fetchedAt: state.fetchedAt }),
      // SAFETY: zustand hands over whatever JSON this name held; version 0 is the PersistedProtocolsV0 shape and every field is optional.
      migrate: (persisted) => migrateProtocolsStorage(persisted as PersistedProtocolsV0 | null),
    })
  )
);

registerPersistedStore('omni-protocols-storage', useProtocolsStore);
registerDataStoreReset<ProtocolsState>('protocols', useProtocolsStore, initialData, () => runner.invalidate());
