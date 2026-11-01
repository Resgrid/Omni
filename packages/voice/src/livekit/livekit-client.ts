import type * as LiveKitClient from 'livekit-client';

/**
 * livekit-client (about 600 KB) loads with the first voice connection instead of with the app — a separate chunk in the
 * web export, so members who never join a channel never download it. Everything that handles a Room runs after
 * `loadLiveKitClient()` resolved (a room only exists once it has).
 */
export type LiveKitClientModule = typeof LiveKitClient;

let loaded: LiveKitClientModule | null = null;
let loading: Promise<LiveKitClientModule> | null = null;

/** Loads livekit-client once; a failed load (offline web client) is retried on the next connect. */
export const loadLiveKitClient = (): Promise<LiveKitClientModule> => {
  if (loaded) return Promise.resolve(loaded);
  loading ??= import('livekit-client').then(
    (module) => {
      loaded = module;
      return module;
    },
    (error: unknown) => {
      loading = null;
      throw error;
    }
  );
  return loading;
};

/** livekit-client for code that runs with a room. Throws when it has not loaded (no room can exist then). */
export const getLiveKitClient = (): LiveKitClientModule => {
  if (!loaded) throw new Error('livekit-client is not loaded');
  return loaded;
};
