import { useCallsStore } from '@resgrid/data';
import type { DispatchedEventResultData } from '@resgrid/models';
import { useEffect, useState } from 'react';

const CONCURRENCY = 4;

/**
 * Who each scheduled call will page (`Calls/GetCallExtraData`). The calls store keeps extras only for OPEN calls (it
 * evicts the rest on every refresh), so the widget holds the scheduled calls' dispatches itself; calls already loaded
 * are not asked again until the list changes.
 */
export function useScheduledCallDispatches(callIds: readonly string[], enabled: boolean = true): Record<string, DispatchedEventResultData[]> {
  const [byCall, setByCall] = useState<Record<string, DispatchedEventResultData[]>>({});
  const key = callIds.join(',');

  useEffect(() => {
    if (!enabled || !key) return undefined;
    let cancelled = false;
    const ids = key.split(',');
    void (async () => {
      const results: Record<string, DispatchedEventResultData[]> = {};
      for (let index = 0; index < ids.length; index += CONCURRENCY) {
        const chunk = ids.slice(index, index + CONCURRENCY);
        const extras = await Promise.all(chunk.map((id) => useCallsStore.getState().fetchCallExtraData(id)));
        chunk.forEach((id, position) => {
          const extra = extras[position];
          if (extra) results[id] = extra.Dispatches ?? [];
        });
        if (cancelled) return;
      }
      if (!cancelled) setByCall((previous) => ({ ...Object.fromEntries(Object.entries(previous).filter(([id]) => ids.includes(id))), ...results }));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, key]);

  return byCall;
}
