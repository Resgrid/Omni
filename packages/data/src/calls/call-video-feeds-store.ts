import { deleteCallVideoFeed, editCallVideoFeed, getCallVideoFeeds, saveCallVideoFeed } from '@resgrid/api';
import type { CallVideoFeedResultData, EditCallVideoFeedInput, SaveCallVideoFeedInput } from '@resgrid/models';
import { create } from 'zustand';

import { assertV4Success, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

type FeedSlice = 'feeds';

interface VideoFeedsData extends SliceMeta<FeedSlice> {
  /** Unit shape, keyed by call so two screens never show each other's feeds. */
  feedsByCall: Record<string, CallVideoFeedResultData[]>;
  isSaving: boolean;
  saveError: DataError | null;
}

export interface CallVideoFeedsState extends VideoFeedsData {
  fetchFeeds: (callId: string, options?: FetchOptions) => Promise<void>;
  /** `videoFeeds: manage` (Dispatch). Returns the new feed id, or null when refused. */
  saveFeed: (input: SaveCallVideoFeedInput) => Promise<string | null>;
  editFeed: (input: EditCallVideoFeedInput) => Promise<boolean>;
  /** Optimistic removal; restored when the server refuses. */
  deleteFeed: (feedId: string, callId: string) => Promise<boolean>;
}

const initialData = (): VideoFeedsData => ({ ...emptySliceMeta<FeedSlice>(), feedsByCall: {}, isSaving: false, saveError: null });

const sortFeeds = (feeds: CallVideoFeedResultData[]): CallVideoFeedResultData[] => [...feeds].sort((a, b) => a.SortOrder - b.SortOrder);

let runner: SliceRunner<FeedSlice, CallVideoFeedsState>;

export const useCallVideoFeedsStore = create<CallVideoFeedsState>()((set, get) => {
  runner = createSliceRunner<FeedSlice, CallVideoFeedsState>('call-video-feeds', set);
  const save = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    set({ isSaving: true, saveError: null });
    try {
      const result = await fn();
      set({ isSaving: false });
      return result;
    } catch (error) {
      set({ isSaving: false, saveError: toDataError(error) });
      return null;
    }
  };

  return {
    ...initialData(),

    fetchFeeds: async (callId, options) => {
      // Dispatch race guard: the newest request wins even when the call changes mid-flight.
      await runner.run(
        'feeds',
        async () => sortFeeds(unwrapList(await getCallVideoFeeds(getDataApiContext(), { callId }))),
        (feeds, state) => ({ feedsByCall: { ...state.feedsByCall, [callId]: feeds } }),
        { flightKey: `feeds:${callId}`, trailing: options?.bypassCache === true }
      );
    },

    saveFeed: async (input) => {
      const id = await save(async () => assertV4Success(await saveCallVideoFeed(getDataApiContext(), input)).Id || null);
      if (id !== null) await get().fetchFeeds(input.CallId, { bypassCache: true });
      return id;
    },

    editFeed: async (input) => {
      const ok = await save(async () => {
        assertV4Success(await editCallVideoFeed(getDataApiContext(), input));
        return true;
      });
      if (ok) await get().fetchFeeds(input.CallId, { bypassCache: true });
      return ok === true;
    },

    deleteFeed: async (feedId, callId) => {
      const previous = get().feedsByCall[callId] ?? [];
      set((state) => ({ feedsByCall: { ...state.feedsByCall, [callId]: previous.filter((feed) => feed.CallVideoFeedId !== feedId) } }));
      try {
        assertV4Success(await deleteCallVideoFeed(getDataApiContext(), { callVideoFeedId: feedId }));
        return true;
      } catch (error) {
        set((state) => ({ feedsByCall: { ...state.feedsByCall, [callId]: previous }, saveError: toDataError(error) }));
        return false;
      }
    },
  };
});

registerDataStoreReset<CallVideoFeedsState>('call-video-feeds', useCallVideoFeedsStore, initialData, () => runner.invalidate());
