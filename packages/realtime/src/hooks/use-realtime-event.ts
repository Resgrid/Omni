import { useEffect, useRef } from 'react';

import { onRealtimeEvent, type RealtimeEventHandler, type RealtimeEventMap, type RealtimeEventName } from '../event-bus';

/**
 * Subscribes a typed handler to a realtime event for the component's lifetime. The latest handler is always called,
 * so it does not need to be memoized.
 */
export function useRealtimeEvent<K extends RealtimeEventName>(name: K, handler: RealtimeEventHandler<K>, enabled: boolean = true): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return undefined;
    return onRealtimeEvent(name, (...args: RealtimeEventMap[K]) => handlerRef.current(...args));
  }, [name, enabled]);
}
