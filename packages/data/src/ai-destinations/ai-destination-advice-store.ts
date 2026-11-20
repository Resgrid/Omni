import { type ApiError, applyAiDestinationAdvice, dismissAiDestinationAdvice, getAiDestinationAdvice, isApiError, isV4Failure, isV4NotFound, requestAiDestinationAdvice } from '@resgrid/api';
import { AI_DESTINATION_DISMISS_REASON_MAX, type AiDestinationAdviceData, type AiDestinationAdviceResult, type AiDestinationAdviceResultData, AiDestinationAdviceStates, AiDestinationOutcomes } from '@resgrid/models';
import { create } from 'zustand';

import { createKeyedFlight } from '../core/keyed-flight';
import { registerDataStoreReset } from '../core/reset';
import { dataNow, getDataApiContext, getDataLogger } from '../core/runtime';

/**
 * Enhanced AI destination advice per call (Core `api/v4/AiDestinations`, M0323; call-intake-and-ai-destinations-plan.md §7, D4):
 * the call's open advice, whether the department may use advice now and whether this member may act on it. Advice never
 * changes a destination by itself: asking, applying and dismissing are the member's own actions, sent straight to the server
 * (online only — advice is about the call as it is now, so nothing is queued). Never persisted: the advice can change with
 * every review, and the `aiDestinationAdviceUpdated` ping reloads it. A server without these endpoints (an older Core answers
 * 404) marks the store unsupported, and nothing more is asked until the next session.
 */

/** One call's advice as last read. */
export interface AiDestinationAdviceEntry {
  /** The department may use advice now; false hides every advice surface for the call. */
  available: boolean;
  /** This member may ask, apply and dismiss (the server's per-call edit check). */
  canApply: boolean;
  /** The call's open advice; null when there is none. */
  advice: AiDestinationAdviceData | null;
  fetchedAt: number;
}

export type AiDestinationAdviceAction = 'ask' | 'apply' | 'dismiss';

/** Why an action got no answer it could act on. */
export type AiDestinationAdviceActionError = 'offline' | 'unavailable' | 'not_allowed' | 'failed';

export type AiDestinationAdviceActionResult =
  | {
      ok: true;
      /** What the server did, or why not (`AiDestinationOutcomes`). */
      outcome: string | null;
      /** The advice the action returned (open, applied or dismissed); null when none. */
      advice: AiDestinationAdviceData | null;
    }
  | { ok: false; error: AiDestinationAdviceActionError };

export interface FetchAiDestinationAdviceOptions {
  /** Read now even when a recent answer is held (realtime pings, a reopened view). */
  bypassCache?: boolean;
}

interface AiDestinationAdviceStoreData {
  /** Keyed by call id. */
  entries: Readonly<Partial<Record<string, AiDestinationAdviceEntry>>>;
  /** The server has no AiDestinations endpoints: every advice surface stays hidden. */
  unsupported: boolean;
  /** The action in flight per call id. */
  busy: Readonly<Partial<Record<string, AiDestinationAdviceAction>>>;
}

export interface AiDestinationAdviceState extends AiDestinationAdviceStoreData {
  /** The call's advice (a held answer younger than {@link AI_DESTINATION_ADVICE_TTL_MS} unless bypassed); null when not read. */
  fetchAdvice: (callId: number | string, options?: FetchAiDestinationAdviceOptions) => Promise<AiDestinationAdviceEntry | null>;
  /** "Ask Enhanced AI" for the call now (Core bounds it to about 20 s). */
  requestAdvice: (callId: number | string) => Promise<AiDestinationAdviceActionResult>;
  /** Sets the call's destination to the advice's recommendation (Core saves the call and notes who applied it). */
  applyAdvice: (callId: number | string, adviceId: string) => Promise<AiDestinationAdviceActionResult>;
  /** Dismisses the advice; a dismissed change is noted on the call with the reason. */
  dismissAdvice: (callId: number | string, adviceId: string, reason?: string | null) => Promise<AiDestinationAdviceActionResult>;
}

/** A held answer is read again after this long (pings keep an open view current). */
export const AI_DESTINATION_ADVICE_TTL_MS = 30_000;

const initialData = (): AiDestinationAdviceStoreData => ({ entries: {}, unsupported: false, busy: {} });

const UNAVAILABLE_OUTCOMES: ReadonlySet<string> = new Set([AiDestinationOutcomes.Disabled, AiDestinationOutcomes.NotEntitled, AiDestinationOutcomes.Unconfigured, AiDestinationOutcomes.ProtectionUnsupported]);

/** Outcomes after which the advice acted on may not be the call's open one any more: the call's advice is read again. */
const REREAD_OUTCOMES: ReadonlySet<string> = new Set([AiDestinationOutcomes.NotOpen, AiDestinationOutcomes.NotFound, AiDestinationOutcomes.DestinationGone]);

const keyOf = (callId: number | string): string => String(callId).trim();

const isCallKey = (key: string): boolean => /^[1-9]\d*$/.test(key);

/** Only Open advice belongs on the call (GetAdvice returns nothing else); an applied, dismissed or superseded one is gone. */
const openOnly = (advice: AiDestinationAdviceData | null | undefined): AiDestinationAdviceData | null => (advice && Number(advice.State) === AiDestinationAdviceStates.Open ? advice : null);

const entryOf = (data: AiDestinationAdviceResultData | null | undefined, now: number): AiDestinationAdviceEntry => ({
  available: data?.Available === true,
  canApply: data?.Available === true && data.CanApply === true,
  advice: data?.Available === true ? openOnly(data.Advice) : null,
  fetchedAt: now,
});

const UNAVAILABLE = (now: number): AiDestinationAdviceEntry => ({ available: false, canApply: false, advice: null, fetchedAt: now });

const httpStatusOf = (error: ApiError | null): number | null => (error?.kind === 'http' ? (error.status ?? null) : null);

/** No answer at all (a timeout is not offline: "Ask Enhanced AI" can outlast its own bound). */
const isOffline = (error: ApiError | null): boolean => error?.kind === 'network';

const flights = createKeyedFlight();

/** Bumped by a reset: an answer to a request sent before it is dropped. */
let generation = 0;

/** Per call: bumped by every action, so a read that left before one cannot bring back the advice it acted on. */
const writes = new Map<string, number>();

const bumpWrites = (key: string): number => {
  const next = (writes.get(key) ?? 0) + 1;

  writes.set(key, next);

  return next;
};

export const useAiDestinationAdviceStore = create<AiDestinationAdviceState>()((set, get) => {
  const store = (key: string, entry: AiDestinationAdviceEntry): void => set((state) => ({ entries: { ...state.entries, [key]: entry } }));

  const setBusy = (key: string, action: AiDestinationAdviceAction | null): void =>
    set((state) => {
      const busy = { ...state.busy };

      if (action) busy[key] = action;
      else delete busy[key];

      return { busy };
    });

  /** Reads the call's advice from the server (no TTL). */
  const read = async (key: string): Promise<AiDestinationAdviceEntry | null> => {
    const startedIn = generation;
    const writesAtStart = writes.get(key) ?? 0;

    try {
      const result = await getAiDestinationAdvice(getDataApiContext(), { callId: key });

      if (startedIn !== generation) return null;

      // The call is not the department's (or not visible): nothing to show for it.
      const entry = isV4NotFound(result) || isV4Failure(result) ? UNAVAILABLE(dataNow()) : entryOf(result?.Data, dataNow());

      // An action landed while this read was out: its answer is newer than this one.
      if ((writes.get(key) ?? 0) !== writesAtStart) return get().entries[key] ?? null;

      store(key, entry);

      return entry;
    } catch (caught) {
      if (startedIn !== generation) return null;

      const error = isApiError(caught) ? caught : null;
      const status = httpStatusOf(error);

      if (status === 404) {
        // An older Core without AiDestinations: the feature is simply not there.
        set({ unsupported: true });

        return null;
      }

      if (status === 401 || status === 403) {
        const entry = UNAVAILABLE(dataNow());

        store(key, entry);

        return entry;
      }

      getDataLogger().warn({ message: 'AI destination advice could not be read', context: { kind: error?.kind ?? 'unknown', status } });

      // Offline or a server error: what was shown stays.
      return get().entries[key] ?? null;
    }
  };

  /** Sends one action and keeps the call's entry in step with its answer. */
  const act = async (key: string, action: AiDestinationAdviceAction, send: () => Promise<AiDestinationAdviceResult>): Promise<AiDestinationAdviceActionResult> => {
    if (!isCallKey(key)) return { ok: false, error: 'failed' };

    if (get().unsupported) return { ok: false, error: 'unavailable' };

    if (get().busy[key]) return { ok: false, error: 'failed' };

    const startedIn = generation;

    setBusy(key, action);

    try {
      const result = await send();

      if (startedIn !== generation) return { ok: false, error: 'failed' };

      bumpWrites(key);

      if (isV4Failure(result)) return { ok: false, error: 'failed' };

      const data = result?.Data ?? null;
      const outcome = data?.Outcome ?? (isV4NotFound(result) ? AiDestinationOutcomes.NotFound : null);
      const current = get().entries[key];
      const available = data ? data.Available === true && !(outcome !== null && UNAVAILABLE_OUTCOMES.has(outcome)) : (current?.available ?? false);

      store(key, {
        available,
        canApply: available && (data ? data.CanApply === true : (current?.canApply ?? false)),
        advice: available ? openOnly(data?.Advice) : null,
        fetchedAt: dataNow(),
      });

      if (outcome !== null && REREAD_OUTCOMES.has(outcome)) void read(key);

      return { ok: true, outcome, advice: data?.Advice ?? null };
    } catch (caught) {
      if (startedIn !== generation) return { ok: false, error: 'failed' };

      const error = isApiError(caught) ? caught : null;
      const status = httpStatusOf(error);

      if (status === 404) {
        set({ unsupported: true });

        return { ok: false, error: 'unavailable' };
      }

      if (status === 401 || status === 403) return { ok: false, error: 'not_allowed' };

      getDataLogger().warn({ message: 'AI destination advice action failed', context: { action, kind: error?.kind ?? 'unknown', status } });

      return { ok: false, error: isOffline(error) ? 'offline' : 'failed' };
    } finally {
      if (startedIn === generation) setBusy(key, null);
    }
  };

  return {
    ...initialData(),

    fetchAdvice: async (callId, options) => {
      const key = keyOf(callId);

      if (!isCallKey(key) || get().unsupported) return null;

      const held = get().entries[key];

      if (!options?.bypassCache && held && dataNow() - held.fetchedAt < AI_DESTINATION_ADVICE_TTL_MS) return held;

      return flights.run(key, () => read(key), { trailing: options?.bypassCache === true });
    },

    requestAdvice: (callId) => {
      const key = keyOf(callId);

      return act(key, 'ask', () => requestAiDestinationAdvice(getDataApiContext(), { CallId: Number(key) }));
    },

    applyAdvice: (callId, adviceId) => {
      const key = keyOf(callId);

      return act(key, 'apply', () => applyAiDestinationAdvice(getDataApiContext(), { AdviceId: adviceId }));
    },

    dismissAdvice: (callId, adviceId, reason) => {
      const key = keyOf(callId);
      const trimmed = (reason ?? '').trim().slice(0, AI_DESTINATION_DISMISS_REASON_MAX);

      return act(key, 'dismiss', () => dismissAiDestinationAdvice(getDataApiContext(), { AdviceId: adviceId, Reason: trimmed || null }));
    },
  };
});

registerDataStoreReset<AiDestinationAdviceState>('ai-destination-advice', useAiDestinationAdviceStore, initialData, () => {
  generation += 1;
  writes.clear();
  flights.clear();
});
