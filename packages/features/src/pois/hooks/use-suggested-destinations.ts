import { usePoisStore } from '@resgrid/data';
import { DestinationSuggestionModes, type SuggestedDestinationsResultData } from '@resgrid/models';
import { useCallback, useEffect, useRef, useState } from 'react';

import { type DestinationOrigin, isUsablePoint } from '../lib/poi-availability';

export interface UseSuggestedDestinationsOptions {
  /** The incident location; nothing is asked for without one. */
  origin: DestinationOrigin | null | undefined;
  /** The call type's name as the form holds it. */
  callType?: string | null;
  /** The call priority (the call's Priority value). */
  priority?: number | null;
  /** An existing call (update form): supplies its type and priority when the form has none. */
  callId?: number | string | null;
  /** The travelling unit (status lists): its type's rules and travel mode apply. */
  unitId?: number | string | null;
  /**
   * The department's mode from config (`configuredDestinationSuggestionMode`): 0 asks for nothing. Null or undefined when
   * the config could not be loaded; then the first answer tells.
   */
  configMode?: number | null;
  /** Off while the panel is not shown. */
  enabled: boolean;
  /** Waits this long after the last change before asking (each answer looks up drive times). */
  debounceMs?: number;
}

export interface SuggestedDestinationsState {
  /**
   * The answer for the current inputs; null while it is on its way, when off, or when the server could not answer. An
   * answer for earlier inputs is never returned: nothing fills or ranks from a type, priority or location the form no
   * longer holds.
   */
  data: SuggestedDestinationsResultData | null;
  /** The answer for the current inputs is on its way (or about to be asked for). */
  isLoading: boolean;
  /** The server could not answer for the current inputs. */
  failed: boolean;
  /** The department's suggestions are off (config, or the server said so): nothing more is asked. */
  isOff: boolean;
  /** Asks again for the current inputs (after a failure). */
  retry: () => void;
}

/** How the last request ended, for the inputs it asked about. */
interface SuggestionOutcome {
  key: string;
  /** Null when the server could not answer. */
  data: SuggestedDestinationsResultData | null;
}

/**
 * The destination rules' suggestion for a call (`GET /Mapping/GetSuggestedDestinations`): what the call needs and the
 * department's destinations ranked for it, with drive times for the nearest. Asks again when the location (about 10 m),
 * type, priority, call or unit changes, after a short pause; a newer request cancels the older one, and the answer for the
 * old inputs goes as soon as they change. Once the department's suggestions read as off, nothing more is asked on this form.
 */
export function useSuggestedDestinations({ origin, callType = null, priority = null, callId = null, unitId = null, configMode, enabled, debounceMs = 400 }: UseSuggestedDestinationsOptions): SuggestedDestinationsState {
  const [outcome, setOutcome] = useState<SuggestionOutcome | null>(null);
  const [serverOff, setServerOff] = useState(false);
  // Bumped by retry: the same inputs are asked again.
  const [attempt, setAttempt] = useState(0);
  const configOff = configMode !== undefined && configMode !== null && Number(configMode) === DestinationSuggestionModes.Off;
  const isOff = configOff || serverOff;
  const usable = enabled && !isOff && !!origin && isUsablePoint(origin.latitude, origin.longitude);
  // About 10 m: a marker nudged on the spot does not ask again.
  const latitudeKey = usable && origin ? origin.latitude.toFixed(4) : '';
  const longitudeKey = usable && origin ? origin.longitude.toFixed(4) : '';
  const typeKey = (callType ?? '').trim();
  const priorityKey = priority === null || priority === undefined ? '' : String(priority);
  const callKey = callId === null || callId === undefined ? '' : String(callId);
  const unitKey = unitId === null || unitId === undefined ? '' : String(unitId);
  const key = [latitudeKey, longitudeKey, typeKey, priorityKey, callKey, unitKey].join('|');
  // The outcome the effect last stored (state lags a render behind; the effect reads this).
  const settledRef = useRef<SuggestionOutcome | null>(null);
  const settled = usable && outcome !== null && outcome.key === key ? outcome : null;

  useEffect(() => {
    if (!usable) {
      settledRef.current = null;
      setOutcome((current) => (current === null ? current : null));

      return;
    }

    // The same inputs as the answer on screen (a re-render, a field touched and put back): not asked again.
    if (settledRef.current?.key === key && settledRef.current.data !== null) return;

    const controller = new AbortController();

    const timer = setTimeout(() => {
      void usePoisStore
        .getState()
        .fetchSuggestedDestinations(
          {
            latitude: Number(latitudeKey),
            longitude: Number(longitudeKey),
            type: typeKey || null,
            priority: priorityKey === '' ? null : Number(priorityKey),
            callId: callKey || null,
            unitId: unitKey || null,
            take: 10,
          },
          controller.signal
        )
        .then((result) => {
          if (controller.signal.aborted) return;

          if (result && Number(result.Mode) === DestinationSuggestionModes.Off) {
            settledRef.current = null;
            setServerOff(true);
            setOutcome(null);

            return;
          }

          const next: SuggestionOutcome = { key, data: result ?? null };

          settledRef.current = next;
          setOutcome(next);
        });
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [attempt, callKey, debounceMs, key, latitudeKey, longitudeKey, priorityKey, typeKey, unitKey, usable]);

  const retry = useCallback(() => {
    settledRef.current = null;
    setOutcome(null);
    setAttempt((count) => count + 1);
  }, []);

  return { data: settled?.data ?? null, isLoading: usable && settled === null, failed: settled !== null && settled.data === null, isOff, retry };
}
