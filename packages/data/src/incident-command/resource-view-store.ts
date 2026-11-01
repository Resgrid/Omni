import { askIncidentAssistant, getIncidentAssistantSuggestions, getResourceIncidentView } from '@resgrid/api';
import type { IncidentAssistantSuggestionsData, ResourceIncidentView } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { unwrapItem } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { dataNow, generateDataId, getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

type ViewSlice = 'view';

/**
 * Incident view tier (Responder/Unit `incidentCommand: view`): the resource's own slice of the command
 * board. `not_found` (no command on the call) is an empty answer, not an error (Unit compared against
 * 'NotFound', which Core never sends).
 */
interface ResourceViewData extends SliceMeta<ViewSlice> {
  viewsByCall: Record<string, ResourceIncidentView | null>;
}

export interface ResourceViewState extends ResourceViewData {
  fetchIncidentView: (callId: string, unitId?: number | string | null, options?: FetchOptions) => Promise<void>;
  /** `incidentCommandUpdated` ping: refetch only a view that is loaded. */
  handleIncidentCommandUpdated: (callId: string, unitId?: number | string | null) => Promise<void>;
}

const initialViewData = (): ResourceViewData => ({ ...emptySliceMeta<ViewSlice>(), viewsByCall: {} });

let viewRunner: SliceRunner<ViewSlice, ResourceViewState>;

export const useResourceViewStore = create<ResourceViewState>()((set, get) => {
  viewRunner = createSliceRunner<ViewSlice, ResourceViewState>('resource-view', set);
  return {
    ...initialViewData(),
    fetchIncidentView: async (callId, unitId, options) => {
      await viewRunner.run(
        'view',
        async () => unwrapItem(await getResourceIncidentView(getDataApiContext(), { callId, ...(unitId !== undefined && unitId !== null ? { unitId } : {}) })),
        (view, state) => ({ viewsByCall: { ...state.viewsByCall, [callId]: view } }),
        { flightKey: `view:${callId}`, trailing: options?.bypassCache === true }
      );
    },
    handleIncidentCommandUpdated: async (callId, unitId) => {
      if (!(callId in get().viewsByCall)) return;
      await get().fetchIncidentView(callId, unitId, { bypassCache: true });
    },
  };
});

registerDataStoreReset<ResourceViewState>('resource-view', useResourceViewStore, initialViewData, () => viewRunner.invalidate());

// ---------------------------------------------------------------- IC incident assistant

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdOn: string;
  /** Set on an assistant row when the server could not answer; the UI shows a translated fallback. */
  unanswered?: boolean;
}

type AssistantSlice = 'suggestions';

interface AssistantData extends SliceMeta<AssistantSlice> {
  messagesByCallId: Record<string, AssistantMessage[]>;
  suggestionsByCallId: Record<string, IncidentAssistantSuggestionsData | null>;
  askingCallId: string | null;
  askError: DataError | null;
}

export interface IncidentAssistantState extends AssistantData {
  /** Online only. No `t()` here (the IC store took a TFunction): an unanswered reply is flagged for the UI to translate. */
  ask: (callId: string, question: string) => Promise<void>;
  fetchSuggestions: (callId: string) => Promise<void>;
  clear: (callId: string) => void;
}

const initialAssistantData = (): AssistantData => ({ ...emptySliceMeta<AssistantSlice>(), messagesByCallId: {}, suggestionsByCallId: {}, askingCallId: null, askError: null });

const MAX_ASSISTANT_MESSAGES = 50;

let assistantRunner: SliceRunner<AssistantSlice, IncidentAssistantState>;

export const useIncidentAssistantStore = create<IncidentAssistantState>()(
  persist(
    (set, get) => {
      assistantRunner = createSliceRunner<AssistantSlice, IncidentAssistantState>('incident-assistant', set);
      const append = (callId: string, message: AssistantMessage) =>
        set((state) => ({ messagesByCallId: { ...state.messagesByCallId, [callId]: [...(state.messagesByCallId[callId] ?? []), message].slice(-MAX_ASSISTANT_MESSAGES) } }));
      return {
        ...initialAssistantData(),
        ask: async (callId, question) => {
          append(callId, { id: generateDataId(), role: 'user', text: question, createdOn: new Date(dataNow()).toISOString() });
          set({ askingCallId: callId, askError: null });
          try {
            const numericCallId = parseInt(callId, 10);
            const answer = (await askIncidentAssistant(getDataApiContext(), { Question: question, CallId: Number.isNaN(numericCallId) ? undefined : numericCallId })).Data ?? null;
            append(callId, { id: generateDataId(), role: 'assistant', text: answer?.Answer ?? '', createdOn: new Date(dataNow()).toISOString(), unanswered: !answer?.Processed });
            set({ askingCallId: null });
          } catch (error) {
            set({ askingCallId: null, askError: toDataError(error) });
          }
        },
        fetchSuggestions: async (callId) => {
          await assistantRunner.run(
            'suggestions',
            async () => (await getIncidentAssistantSuggestions(getDataApiContext(), { callId })).Data ?? null,
            (suggestions, state) => ({ suggestionsByCallId: { ...state.suggestionsByCallId, [callId]: suggestions } }),
            { flightKey: `suggestions:${callId}` }
          );
        },
        clear: (callId) =>
          set((state) => {
            const messagesByCallId = { ...state.messagesByCallId };
            delete messagesByCallId[callId];
            return { messagesByCallId };
          }),
      };
    },
    dataPersistOptions<IncidentAssistantState, Pick<AssistantData, 'messagesByCallId'>>({
      // Frozen: IC's persisted assistant store.
      name: 'incident-assistant-storage',
      partialize: (state) => ({ messagesByCallId: state.messagesByCallId }),
    })
  )
);

registerPersistedStore('incident-assistant-storage', useIncidentAssistantStore);
registerDataStoreReset<IncidentAssistantState>('incident-assistant', useIncidentAssistantStore, initialAssistantData, () => assistantRunner.invalidate());
