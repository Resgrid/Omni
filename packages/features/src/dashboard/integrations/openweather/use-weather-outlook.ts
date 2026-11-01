import { useEffect, useRef, useState } from 'react';

import { getDashboardKv } from '../../lib/storage';
import type { WeatherUnits } from '../../lib/widget-settings';
import { getWeatherOutlook, OpenWeatherError, type OpenWeatherErrorKind, WEATHER_CACHE_TTL_MS, type WeatherCacheStore, type WeatherOutlook } from './openweather-client';

/** Last good outlook, kept in durable storage (one entry, so it never grows) for boards that lose their connection. */
export const WEATHER_CACHE_STORAGE_KEY = 'omni-dashboard-weather';

export const durableWeatherCache: WeatherCacheStore = {
  read: (key) => {
    const entry = getDashboardKv()?.getJSON<{ key?: string; outlook?: WeatherOutlook }>(WEATHER_CACHE_STORAGE_KEY);
    return entry?.key === key && entry.outlook ? entry.outlook : null;
  },
  write: (key, outlook) => {
    getDashboardKv()?.setJSON(WEATHER_CACHE_STORAGE_KEY, { key, outlook });
  },
};

export interface WeatherOutlookState {
  outlook: WeatherOutlook | null;
  isLoading: boolean;
  /** Showing an older answer because the latest request failed. */
  isStale: boolean;
  errorKind: OpenWeatherErrorKind | null;
}

export interface UseWeatherOutlookOptions {
  apiKey: string | null | undefined;
  location: { latitude: number; longitude: number } | null;
  units: WeatherUnits;
  /** How often the widget refreshes (default: the cache TTL). */
  refreshMs?: number;
}

/** The weather for the widget: fetched through the cached client, refreshed on an interval, safe to unmount mid-request. */
export function useWeatherOutlook({ apiKey, location, units, refreshMs = WEATHER_CACHE_TTL_MS }: UseWeatherOutlookOptions): WeatherOutlookState {
  const [state, setState] = useState<WeatherOutlookState>({ outlook: null, isLoading: true, isStale: false, errorKind: null });
  // Read through a ref: a rotated key is used by the next refresh without refetching on every config change.
  const keyRef = useRef(apiKey);
  useEffect(() => {
    keyRef.current = apiKey;
  }, [apiKey]);
  const latitude = location?.latitude ?? null;
  const longitude = location?.longitude ?? null;
  const hasKey = !!(apiKey ?? '').trim();

  useEffect(() => {
    let cancelled = false;
    if (!hasKey || latitude === null || longitude === null) {
      setState({ outlook: null, isLoading: false, isStale: false, errorKind: !hasKey ? 'missing_key' : 'missing_location' });
      return undefined;
    }
    const load = async (bypassCache: boolean): Promise<void> => {
      try {
        const result = await getWeatherOutlook({ apiKey: keyRef.current, latitude, longitude, units }, { durable: durableWeatherCache, bypassCache });
        if (!cancelled) setState({ outlook: result.outlook, isLoading: false, isStale: result.stale, errorKind: result.error?.kind ?? null });
      } catch (error) {
        if (!cancelled) setState({ outlook: null, isLoading: false, isStale: false, errorKind: error instanceof OpenWeatherError ? error.kind : 'network' });
      }
    };
    setState((previous) => ({ ...previous, isLoading: previous.outlook === null }));
    void load(false);
    const timer = setInterval(() => void load(true), Math.max(60000, refreshMs));
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hasKey, latitude, longitude, units, refreshMs]);

  return state;
}
