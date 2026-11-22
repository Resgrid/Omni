import { useCapability } from '@resgrid/config';
import { isOnBreak, useDispatcherDeskStore } from '@resgrid/data';
import type { DispatcherDeskConfigData, DispatcherDeskMemberData, DispatcherDeskResultData, DispatcherQueueItemData } from '@resgrid/models';
import { onPushTokenRegistered, registerAlertSuppressor } from '@resgrid/notifications';
import { useRealtimeEvent } from '@resgrid/realtime';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { shouldSuppressDeskAlert } from '../lib/desk-alerts';

/** At most one foreground refresh per this interval (app switching bursts). */
export const DESK_FOREGROUND_REFRESH_MS = 10000;

/** "Still here" while signed in to the desk and the app is in the foreground (plan §4 Heartbeat). */
export const DESK_HEARTBEAT_MS = 60000;

/** The desk is a Dispatch module (`capabilities.calls.dispatcherDesk`). Off means no request, no state, no UI. */
export const useIsDispatcherDeskEnabled = (): boolean => useCapability('calls').dispatcherDesk;

export interface DispatcherDeskView {
  desk: DispatcherDeskResultData | null;
  me: DispatcherDeskMemberData | null;
  config: DispatcherDeskConfigData | null;
  queue: readonly DispatcherQueueItemData[];
  /** The app has the desk, the server has it, the department turned it on and the member may use it. */
  isAvailable: boolean;
  isSignedIn: boolean;
  onBreak: boolean;
  /** The first answer has not come yet. */
  isLoading: boolean;
}

const NO_ITEMS: readonly DispatcherQueueItemData[] = [];

/** The board as the screens and the status bar read it. */
export function useDispatcherDeskView(): DispatcherDeskView {
  const enabled = useIsDispatcherDeskEnabled();
  const desk = useDispatcherDeskStore((state) => state.desk);
  const unsupported = useDispatcherDeskStore((state) => state.unsupported);
  const loading = useDispatcherDeskStore((state) => state.loading.desk === true);
  const me = desk?.Me ?? null;
  const isAvailable = enabled && !unsupported && !!desk?.Enabled && desk.IsDispatcher;

  return {
    desk,
    me,
    config: desk?.Config ?? null,
    queue: desk?.Queue ?? NO_ITEMS,
    isAvailable,
    isSignedIn: isAvailable && !!me?.IsSignedIn,
    onBreak: isAvailable && isOnBreak(me),
    isLoading: enabled && !unsupported && desk === null && loading,
  };
}

/** The current time, re-read every `intervalMs` while enabled (countdowns). */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);

    return () => clearInterval(timer);
  }, [enabled, intervalMs]);

  return now;
}

const refreshDesk = (): void => void useDispatcherDeskStore.getState().fetchDesk({ bypassCache: true });

/**
 * Keeps the desk live for the signed-in Dispatch shell (mount once, through `DispatcherDeskHost`): loads the board, reads
 * it again on every `dispatcherDeskUpdated` / `dispatcherQueueUpdated` ping (and the open item on a queue ping for it),
 * after a hub rejoin and when the app comes back to the foreground (throttled); sends the heartbeat every minute while
 * signed in to the desk and in the foreground; puts this device's push token on the Dispatch-only desk subscriber; and
 * holds alerts back while the member is on break (plan D6). Off clears the store.
 */
export function useDispatcherDeskSync(enabledOverride?: boolean): void {
  const capability = useIsDispatcherDeskEnabled();
  const enabled = enabledOverride ?? capability;
  const deskOn = useDispatcherDeskStore((state) => !!state.desk?.Enabled && !!state.desk.IsDispatcher && !state.unsupported);
  const signedIn = useDispatcherDeskStore((state) => !!state.desk?.Me?.IsSignedIn);
  const [isActive, setIsActive] = useState(() => AppState.currentState !== 'background' && AppState.currentState !== 'inactive');

  useEffect(() => {
    const store = useDispatcherDeskStore.getState();

    if (!enabled) {
      store.disable();

      return;
    }

    void store.fetchDesk();
  }, [enabled]);

  useRealtimeEvent('dispatcherDeskUpdated', refreshDesk, enabled);

  useRealtimeEvent(
    'dispatcherQueueUpdated',
    (itemId) => {
      refreshDesk();

      // The conversation of an item on screen (or read before) follows its pings.
      if (itemId && useDispatcherDeskStore.getState().items[itemId]) void useDispatcherDeskStore.getState().fetchItem(itemId, { bypassCache: true });
    },
    enabled
  );

  // An intake text thread changed (a texter's message, Enhanced AI's question, a connect from the call page): the hub sends
  // the call id, so read again every open item about that call.
  useRealtimeEvent(
    'intakeConversationUpdated',
    (callId) => {
      // The hub sends the call id as a number; compare as text.
      const call = callId == null ? '' : String(callId);

      if (!call) return;
      const { items, fetchItem } = useDispatcherDeskStore.getState();

      for (const [itemId, detail] of Object.entries(items)) {
        if (detail?.Item?.CallId != null && String(detail.Item.CallId) === call) void fetchItem(itemId, { bypassCache: true });
      }
    },
    enabled
  );

  useRealtimeEvent(
    'eventingHubJoined',
    (info) => {
      // The hub replays nothing: after an outage the board may be stale.
      if (info.rejoin) refreshDesk();
    },
    enabled
  );

  // Foreground: refresh (at most once per interval, with one trailing refresh for a return inside it).
  useEffect(() => {
    if (!enabled) return undefined;
    let lastRefresh = Date.now();
    let trailing: ReturnType<typeof setTimeout> | null = null;

    const cancelTrailing = () => {
      if (trailing !== null) clearTimeout(trailing);
      trailing = null;
    };

    const refresh = () => {
      cancelTrailing();
      lastRefresh = Date.now();
      refreshDesk();
    };

    const subscription = AppState.addEventListener('change', (state) => {
      setIsActive(state === 'active');

      if (state !== 'active') {
        cancelTrailing();

        return;
      }

      const wait = DESK_FOREGROUND_REFRESH_MS - (Date.now() - lastRefresh);

      if (wait <= 0) refresh();
      else if (trailing === null) trailing = setTimeout(refresh, wait);
    });

    return () => {
      cancelTrailing();
      subscription.remove();
    };
  }, [enabled]);

  // Heartbeat while signed in to the desk and in the foreground: one now, then every minute.
  useEffect(() => {
    if (!enabled || !deskOn || !signedIn || !isActive) return undefined;
    void useDispatcherDeskStore.getState().heartbeat();
    const timer = setInterval(() => void useDispatcherDeskStore.getState().heartbeat(), DESK_HEARTBEAT_MS);

    return () => clearInterval(timer);
  }, [deskOn, enabled, isActive, signedIn]);

  // The desk pushes come through the Dispatch-only subscriber: it takes the same token as the app's own registration.
  useEffect(() => {
    if (!enabled || !deskOn) return undefined;

    return onPushTokenRegistered((registered) => void useDispatcherDeskStore.getState().registerDevice({ Platform: registered.platform, Token: registered.token }));
  }, [deskOn, enabled]);

  // Quiet while on break: push banners and sounds, the push modal, in-app sounds and alert toasts (except break alerts).
  useEffect(() => {
    if (!enabled) return undefined;

    return registerAlertSuppressor('dispatcher-desk', (alert) => shouldSuppressDeskAlert(useDispatcherDeskStore.getState().desk, alert));
  }, [enabled]);
}
