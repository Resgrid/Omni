import { closeIncidentChannels, createIncidentChannel, getAllCommandDefinitions, getIncidentVoiceChannels, getMyIncidentCapabilities, transferCommand } from '@resgrid/api';
import type { CommandResultData, IncidentVoiceChannel } from '@resgrid/models';
import { create } from 'zustand';

import { assertV4Success, unwrapItem, unwrapList } from '../core/envelope';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';
import { useCommandStore } from './command-store';

type SupportSlice = 'capabilities' | 'definitions' | 'voiceChannels';

/**
 * Board support reads the command store does not carry (Dispatch `incident-command/store` capabilities, IC start-command
 * templates and incident voice channels). In memory only: capabilities are per user and per incident and re-read with
 * the board; templates and voice channels are online conveniences (a blank board always works offline).
 */
interface CommandSupportData extends SliceMeta<SupportSlice> {
  /** Effective `IncidentCapabilities` bitmask per incident (`IncidentRoles/GetMyCapabilities`); absent = not loaded. */
  capabilitiesByCall: Record<string, number>;
  /** Department command templates (`Commands/GetAllCommands`). */
  definitions: CommandResultData[];
  /** On-demand incident voice channels per incident (open ones only). */
  voiceChannelsByCall: Record<string, IncidentVoiceChannel[]>;
}

export interface CommandSupportState extends CommandSupportData {
  fetchCapabilities: (callId: string, options?: FetchOptions) => Promise<void>;
  fetchCommandDefinitions: (options?: FetchOptions) => Promise<void>;
  fetchVoiceChannels: (callId: string, options?: FetchOptions) => Promise<void>;
  /** Online only (a LiveKit room cannot be created offline). Throws the API error so the caller can explain it. */
  createVoiceChannel: (callId: string, name: string) => Promise<IncidentVoiceChannel | null>;
  /** Online only: closes every on-demand channel of the incident. */
  closeVoiceChannels: (callId: string) => Promise<void>;
  /**
   * Hands command to another member, then refreshes the board. Online only (IC sent it online; the outbox has no transfer
   * event type yet although plan §8.5 lists it). Throws when there is no server command yet or the server refuses.
   */
  transferCommand: (callId: string, toUserId: string, notes?: string) => Promise<void>;
}

const initialSupportData = (): CommandSupportData => ({ ...emptySliceMeta<SupportSlice>(), capabilitiesByCall: {}, definitions: [], voiceChannelsByCall: {} });

const toCallParam = (callId: string): number | string => {
  const numeric = Number(callId);
  return Number.isFinite(numeric) ? numeric : callId;
};

let supportRunner: SliceRunner<SupportSlice, CommandSupportState>;

export const useCommandSupportStore = create<CommandSupportState>()((set, get) => {
  supportRunner = createSliceRunner<SupportSlice, CommandSupportState>('incident-command-support', set);
  const ctx = () => getDataApiContext();
  return {
    ...initialSupportData(),

    fetchCapabilities: async (callId, options) => {
      await supportRunner.run(
        'capabilities',
        async () => unwrapItem(await getMyIncidentCapabilities(ctx(), { callId: toCallParam(callId) })),
        (data, state) => ({ capabilitiesByCall: { ...state.capabilitiesByCall, [callId]: typeof data?.Value === 'number' ? data.Value : 0 } }),
        { flightKey: `capabilities:${callId}`, trailing: options?.bypassCache === true }
      );
    },

    fetchCommandDefinitions: async (options) => {
      await supportRunner.run(
        'definitions',
        async () => unwrapList(await getAllCommandDefinitions(ctx())),
        (definitions) => ({ definitions }),
        { trailing: options?.bypassCache === true }
      );
    },

    fetchVoiceChannels: async (callId, options) => {
      await supportRunner.run(
        'voiceChannels',
        async () => unwrapList(await getIncidentVoiceChannels(ctx(), { callId: toCallParam(callId) })),
        (channels, state) => ({ voiceChannelsByCall: { ...state.voiceChannelsByCall, [callId]: channels.filter((channel) => !channel.ClosedOn) } }),
        { flightKey: `voice:${callId}`, trailing: options?.bypassCache === true }
      );
    },

    createVoiceChannel: async (callId, name) => {
      const numeric = Number(callId);
      const channel = unwrapItem(assertV4Success(await createIncidentChannel(ctx(), { CallId: Number.isFinite(numeric) ? numeric : 0, Name: name })));
      await get().fetchVoiceChannels(callId, { bypassCache: true });
      return channel;
    },

    closeVoiceChannels: async (callId) => {
      assertV4Success(await closeIncidentChannels(ctx(), { callId: toCallParam(callId) }));
      set((state) => ({ voiceChannelsByCall: { ...state.voiceChannelsByCall, [callId]: [] } }));
    },

    transferCommand: async (callId, toUserId, notes) => {
      const entry = useCommandStore.getState().boards[callId];
      const incidentCommandId = entry?.board?.Command?.IncidentCommandId;
      if (!incidentCommandId || incidentCommandId.startsWith('local-') || entry?.isProvisional) throw new Error('No server incident command to transfer yet.');
      assertV4Success(await transferCommand(ctx(), { IncidentCommandId: incidentCommandId, ToUserId: toUserId, ...(notes?.trim() ? { Notes: notes.trim() } : {}) }));
      await useCommandStore.getState().refreshBoard(callId, { bypassCache: true });
    },
  };
});

registerDataStoreReset<CommandSupportState>('incident-command-support', useCommandSupportStore, initialSupportData, () => supportRunner.invalidate());
