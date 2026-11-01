import { type DataError, toDataError } from './errors';
import { createKeyedFlight } from './keyed-flight';
import { dataNow, getDataLogger } from './runtime';

/** Options every refetch helper accepts. `bypassCache` is what realtime pings and pull-to-refresh pass. */
export interface FetchOptions {
  bypassCache?: boolean;
}

/**
 * Per-slice request state (Dispatch baseline: one loading flag and one error per resource). Only
 * `fetchedAt` is persisted (sync metadata); loading flags and errors never are.
 */
export interface SliceMeta<K extends string> {
  loading: Partial<Record<K, boolean>>;
  errors: Partial<Record<K, DataError | null>>;
  fetchedAt: Partial<Record<K, number>>;
}

export const emptySliceMeta = <K extends string>(): SliceMeta<K> => ({ loading: {}, errors: {}, fetchedAt: {} });

export type SliceResult<T> = { ok: true; value: T } | { ok: false; error?: DataError; stale?: boolean };

type SetState<S> = (partial: Partial<S> | ((state: S) => Partial<S>)) => void;

export interface RunOptions {
  /** De-duplication key when one slice is fetched per id (e.g. `feeds:<callId>`); defaults to the slice key. */
  flightKey?: string;
  /** Queue a trailing refetch instead of sharing the in-flight one (realtime pings). */
  trailing?: boolean;
  /** Do not flip the loading flag (poll rounds, background prefetch). */
  silent?: boolean;
}

export interface SliceRunner<K extends string, S> {
  run<T>(key: K, fetcher: () => Promise<T>, apply: (value: T, state: S) => Partial<S>, options?: RunOptions): Promise<SliceResult<T>>;
  /** Drop every in-flight answer (sign-out, store reset): late responses must not repopulate the store. */
  invalidate(): void;
  generation(): number;
}

const metaPatch = <K extends string, S extends SliceMeta<K>>(state: S, key: K, patch: { loading?: boolean; error?: DataError | null; fetchedAt?: number }): Partial<S> => {
  const next: Partial<SliceMeta<K>> = {};
  if (patch.loading !== undefined) next.loading = { ...state.loading, [key]: patch.loading };
  if (patch.error !== undefined) next.errors = { ...state.errors, [key]: patch.error };
  if (patch.fetchedAt !== undefined) next.fetchedAt = { ...state.fetchedAt, [key]: patch.fetchedAt };
  return next as Partial<S>;
};

/**
 * Runs fetches for a store's slices with loading/error bookkeeping, de-duplication, a per-slice race guard
 * (the newest request for a slice wins — Dispatch video-feed guard, Unit records guards) and a generation
 * guard so a response that lands after sign-out is dropped.
 */
export function createSliceRunner<K extends string, S extends SliceMeta<K>>(storeName: string, set: SetState<S>): SliceRunner<K, S> {
  let generation = 0;
  const sequences = new Map<K, number>();
  const flights = createKeyedFlight();

  return {
    run<T>(key: K, fetcher: () => Promise<T>, apply: (value: T, state: S) => Partial<S>, options: RunOptions = {}): Promise<SliceResult<T>> {
      return flights.run<SliceResult<T>>(
        options.flightKey ?? key,
        async () => {
          const startedIn = generation;
          const sequence = (sequences.get(key) ?? 0) + 1;
          sequences.set(key, sequence);
          const isCurrent = (): boolean => startedIn === generation && sequences.get(key) === sequence;
          if (!options.silent) set((state) => metaPatch(state, key, { loading: true, error: null }));
          try {
            const value = await fetcher();
            if (!isCurrent()) return { ok: false, stale: true };
            set((state) => ({ ...apply(value, state), ...metaPatch(state, key, { loading: false, error: null, fetchedAt: dataNow() }) }));
            return { ok: true, value };
          } catch (error) {
            const dataError = toDataError(error);
            if (!isCurrent()) return { ok: false, stale: true, error: dataError };
            getDataLogger().warn({ message: 'Data fetch failed', context: { store: storeName, slice: key, code: dataError.code, status: dataError.status } });
            set((state) => metaPatch(state, key, { loading: false, error: dataError }));
            return { ok: false, error: dataError };
          }
        },
        { trailing: options.trailing }
      );
    },
    invalidate() {
      generation++;
      sequences.clear();
      flights.clear();
    },
    generation: () => generation,
  };
}

/** True when the slice was fetched within `maxAgeMs` (hydration `isCurrent`, skip-if-fresh guards). */
export function isSliceFresh<K extends string>(meta: SliceMeta<K>, key: K, maxAgeMs: number): boolean {
  const at = meta.fetchedAt[key] ?? 0;
  return at > 0 && dataNow() - at <= maxAgeMs;
}

/** Cached-endpoint options for a refetch: `bypassCache` maps to the API's `forceRefresh`. */
export const cacheOptions = (options?: FetchOptions): { forceRefresh: boolean } => ({ forceRefresh: options?.bypassCache === true });
