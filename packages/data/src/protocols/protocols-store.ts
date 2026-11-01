import { getAllProtocols, getProtocol } from '@resgrid/api';
import type { CallProtocolsResultData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { unwrapList } from '../core/envelope';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { cacheOptions, createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

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
            async () => unwrapList(await getAllProtocols(getDataApiContext(), cacheOptions(options))),
            (protocols) => ({ protocols }),
            { trailing: options?.bypassCache === true }
          );
        },
        fetchProtocol: async (protocolId, options) => {
          const cached = get().protocolDetailsById[protocolId];
          if (cached && !options?.bypassCache) return cached;
          const result = await runner.run(
            'detail',
            async () => unwrapList(await getProtocol(getDataApiContext(), { protocolId }))[0] ?? null,
            (protocol, state) => (protocol ? { protocolDetailsById: { ...state.protocolDetailsById, [protocolId]: protocol } } : {}),
            { flightKey: `detail:${protocolId}` }
          );
          return result.ok ? result.value : (cached ?? get().protocols.find((protocol) => protocol.Id === protocolId) ?? null);
        },
      };
    },
    dataPersistOptions<ProtocolsState, Pick<ProtocolsData, 'protocols' | 'protocolDetailsById' | 'fetchedAt'>>({
      name: 'omni-protocols-storage',
      partialize: (state) => ({ protocols: state.protocols, protocolDetailsById: state.protocolDetailsById, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('omni-protocols-storage', useProtocolsStore);
registerDataStoreReset<ProtocolsState>('protocols', useProtocolsStore, initialData, () => runner.invalidate());
