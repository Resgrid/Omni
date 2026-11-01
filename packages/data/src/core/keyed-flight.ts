/**
 * Per-key request de-duplication. A caller arriving while a request for the same key is out shares it;
 * with `trailing` (realtime pings, pull-to-refresh) it instead queues one trailing run that starts when
 * the current one settles, because the change it is refreshing for may have been saved after the
 * in-flight request left (same rule as `singleFlight` in @resgrid/core, keyed).
 */
export interface KeyedFlight {
  run<T>(key: string, fn: () => Promise<T>, options?: { trailing?: boolean }): Promise<T>;
  clear(): void;
}

export function createKeyedFlight(): KeyedFlight {
  const inFlight = new Map<string, Promise<unknown>>();
  const trailing = new Map<string, Promise<unknown>>();

  const start = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    let result: Promise<T>;
    try {
      result = Promise.resolve(fn());
    } catch (error) {
      result = Promise.reject(error);
    }
    const current = result.finally(() => {
      if (inFlight.get(key) === current) inFlight.delete(key);
    });
    inFlight.set(key, current);
    return current;
  };

  return {
    run<T>(key: string, fn: () => Promise<T>, options: { trailing?: boolean } = {}): Promise<T> {
      const current = inFlight.get(key) as Promise<T> | undefined;
      if (!current) return start(key, fn);
      if (!options.trailing) return current;
      const queued = trailing.get(key) as Promise<T> | undefined;
      if (queued) return queued;
      const next = current
        .catch(() => undefined)
        .then(() => {
          trailing.delete(key);
          return start(key, fn);
        });
      trailing.set(key, next);
      return next;
    },
    clear() {
      inFlight.clear();
      trailing.clear();
    },
  };
}
