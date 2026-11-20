import { FeatureFlagKeys, useFeatureFlag } from '@resgrid/auth';
import { type AiDestinationAdviceAction, useAiDestinationAdviceStore } from '@resgrid/data';
import type { AiDestinationAdviceData } from '@resgrid/models';
import { useRealtimeEvent } from '@resgrid/realtime';
import { useCallback, useEffect } from 'react';

export interface AiDestinationAdviceView {
  /** The department may use advice for this call: the advice surfaces show. False until the first answer says so. */
  isAvailable: boolean;
  /** This member may ask, apply and dismiss (the server's per-call edit check). */
  canApply: boolean;
  /** The call's open advice; null when there is none. */
  advice: AiDestinationAdviceData | null;
  /** The action in flight for the call. */
  busy: AiDestinationAdviceAction | null;
  /** Reads the call's advice now. */
  refresh: () => Promise<void>;
}

const isCallKey = (key: string): boolean => /^[1-9]\d*$/.test(key);

/**
 * A call's Enhanced AI destination advice for a view (call detail, the call form, the status destination list). Asks only when
 * the department has `Ai.DestinationAdvice` on (unknown flags are disabled) and the server has the endpoints (an older Core's
 * 404 hides every surface), reads again on the call's `aiDestinationAdviceUpdated` ping and after an eventing hub rejoin (the
 * hub replays nothing), and shows nothing until the server says the department may use advice.
 */
export function useAiDestinationAdvice(callId: number | string | null | undefined, enabled = true): AiDestinationAdviceView {
  const flag = useFeatureFlag(FeatureFlagKeys.AiDestinationAdvice);
  const key = callId === null || callId === undefined ? '' : String(callId).trim();
  const unsupported = useAiDestinationAdviceStore((state) => state.unsupported);
  const entry = useAiDestinationAdviceStore((state) => (key ? state.entries[key] : undefined));
  const busy = useAiDestinationAdviceStore((state) => (key ? (state.busy[key] ?? null) : null));
  const active = enabled && flag && !unsupported && isCallKey(key);

  const refresh = useCallback(async () => {
    if (!active) return;

    await useAiDestinationAdviceStore.getState().fetchAdvice(key, { bypassCache: true });
  }, [active, key]);

  useEffect(() => {
    if (active) void useAiDestinationAdviceStore.getState().fetchAdvice(key);
  }, [active, key]);

  // The ping names the call; the payload (advice id, state) is not trusted for display — GetAdvice applies the viewer's visibility.
  useRealtimeEvent(
    'aiDestinationAdviceUpdated',
    (id) => {
      if (id !== null && id.trim() === key) void useAiDestinationAdviceStore.getState().fetchAdvice(key, { bypassCache: true });
    },
    active
  );

  useRealtimeEvent(
    'eventingHubJoined',
    (info) => {
      if (info.rejoin) void useAiDestinationAdviceStore.getState().fetchAdvice(key, { bypassCache: true });
    },
    active
  );

  const isAvailable = active && entry?.available === true;

  return { isAvailable, canApply: isAvailable && entry?.canApply === true, advice: isAvailable ? (entry?.advice ?? null) : null, busy, refresh };
}
