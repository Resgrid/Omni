import {
  deleteWeatherAlertSource,
  deleteWeatherAlertZone,
  getActiveWeatherAlerts,
  getWeatherAlert,
  getWeatherAlertHistory,
  getWeatherAlertSettings,
  getWeatherAlertsNearLocation,
  getWeatherAlertSources,
  getWeatherAlertZones,
  parseUtcMs,
  saveWeatherAlertSettings,
  saveWeatherAlertSource,
  saveWeatherAlertZone,
} from '@resgrid/api';
import type {
  SaveWeatherAlertSettingsInput,
  SaveWeatherAlertSourceInput,
  SaveWeatherAlertZoneInput,
  WeatherAlertResultData,
  WeatherAlertSettingsData,
  WeatherAlertSourceResultData,
  WeatherAlertZoneResultData,
} from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapItem, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { dataNow, getDataApiContext, getDataVariant } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

// ---------------------------------------------------------------- pure helpers (Unit filter/sort, Responder severe selectors)

/** Core WeatherAlertSeverity: Extreme 0, Severe 1, Moderate 2, Minor 3, Unknown 4. */
export const isSevereWeatherAlert = (alert: Pick<WeatherAlertResultData, 'Severity'>): boolean => alert.Severity <= 1;

const effectiveMs = (alert: WeatherAlertResultData): number => parseUtcMs(alert.EffectiveOnUtc || alert.EffectiveUtc) ?? 0;
const expiresMs = (alert: WeatherAlertResultData): number | null => parseUtcMs(alert.ExpiresOnUtc || alert.ExpiresUtc);

/** Status Active and not past its expiry (Unit `isAlertActive`). */
export const isWeatherAlertActive = (alert: WeatherAlertResultData, now = dataNow()): boolean => {
  if (alert.Status !== 0) return false;
  const expires = expiresMs(alert);
  return expires === null || expires > now;
};

export type WeatherAlertSort = 'severity' | 'newest' | 'expiring';

/** Severity first, newest within a severity (Dispatch/Unit); or newest; or soonest to expire. */
export const sortWeatherAlerts = (alerts: WeatherAlertResultData[], sortBy: WeatherAlertSort = 'severity'): WeatherAlertResultData[] =>
  [...alerts].sort((a, b) => {
    if (sortBy === 'expiring') return (expiresMs(a) ?? Number.MAX_SAFE_INTEGER) - (expiresMs(b) ?? Number.MAX_SAFE_INTEGER);
    if (sortBy === 'severity' && a.Severity !== b.Severity) return a.Severity - b.Severity;
    return effectiveMs(b) - effectiveMs(a);
  });

export const filterWeatherAlerts = (alerts: WeatherAlertResultData[], filter: { severities?: number[]; categories?: number[]; activeOnly?: boolean }): WeatherAlertResultData[] =>
  alerts.filter(
    (alert) => (!filter.severities || filter.severities.includes(alert.Severity)) && (!filter.categories || filter.categories.includes(alert.AlertCategory)) && (!filter.activeOnly || isWeatherAlertActive(alert))
  );

// ---------------------------------------------------------------- store

type WeatherSlice = 'alerts' | 'detail' | 'nearby' | 'history' | 'settings' | 'sources' | 'zones';

interface WeatherAlertsData extends SliceMeta<WeatherSlice> {
  alerts: WeatherAlertResultData[];
  alertDetailsById: Record<string, WeatherAlertResultData>;
  nearbyAlerts: WeatherAlertResultData[];
  history: WeatherAlertResultData[];
  /** Admin slice (`capabilities.weatherAlerts.admin`, Dispatch). */
  settings: WeatherAlertSettingsData | null;
  sources: WeatherAlertSourceResultData[];
  zones: WeatherAlertZoneResultData[];
  adminError: DataError | null;
  lastWeatherAlertTimestamp: number;
}

export interface WeatherAlertsState extends WeatherAlertsData {
  fetchActiveAlerts: (options?: FetchOptions) => Promise<void>;
  fetchAlertDetail: (alertId: string, options?: FetchOptions) => Promise<WeatherAlertResultData | null>;
  fetchNearbyAlerts: (lat: number, lng: number, radiusMiles?: number) => Promise<void>;
  fetchHistory: (startDate: string, endDate: string) => Promise<void>;
  // Realtime (`weatherAlertReceived` / `Updated` / `Expired`, id-only pings).
  handleAlertReceived: (alertId: string) => Promise<void>;
  handleAlertUpdated: (alertId: string) => Promise<void>;
  handleAlertExpired: (alertId: string) => void;
  // Admin slice: refused locally (`forbidden`) when the variant lacks `weatherAlerts.admin`.
  fetchSettings: () => Promise<void>;
  saveSettings: (input: SaveWeatherAlertSettingsInput) => Promise<boolean>;
  fetchSources: () => Promise<void>;
  saveSource: (input: SaveWeatherAlertSourceInput) => Promise<boolean>;
  deleteSource: (sourceId: string) => Promise<boolean>;
  fetchZones: () => Promise<void>;
  saveZone: (input: SaveWeatherAlertZoneInput) => Promise<boolean>;
  deleteZone: (zoneId: string) => Promise<boolean>;
}

const initialData = (): WeatherAlertsData => ({
  ...emptySliceMeta<WeatherSlice>(),
  alerts: [],
  alertDetailsById: {},
  nearbyAlerts: [],
  history: [],
  settings: null,
  sources: [],
  zones: [],
  adminError: null,
  lastWeatherAlertTimestamp: 0,
});

/** True when the variant may administer weather alerts. */
export const canAdministerWeatherAlerts = (): boolean => getDataVariant()?.capabilities.weatherAlerts.admin === true;

const forbidden: DataError = { code: 'forbidden', messageKey: 'errors.data.forbidden' };

let runner: SliceRunner<WeatherSlice, WeatherAlertsState>;

export const useWeatherAlertsStore = create<WeatherAlertsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<WeatherSlice, WeatherAlertsState>('weather-alerts', set);
      const admin = async (fn: () => Promise<void>): Promise<boolean> => {
        if (!canAdministerWeatherAlerts()) {
          set({ adminError: forbidden });
          return false;
        }
        set({ adminError: null });
        try {
          await fn();
          return true;
        } catch (error) {
          set({ adminError: toDataError(error) });
          return false;
        }
      };
      const adminFetch = async (fn: () => Promise<void>): Promise<void> => {
        if (!canAdministerWeatherAlerts()) {
          set({ adminError: forbidden });
          return;
        }
        await fn();
      };
      const upsert = (alert: WeatherAlertResultData) =>
        set((state) => ({
          alerts: sortWeatherAlerts([alert, ...state.alerts.filter((existing) => existing.WeatherAlertId !== alert.WeatherAlertId)]),
          alertDetailsById: { ...state.alertDetailsById, [alert.WeatherAlertId]: alert },
          lastWeatherAlertTimestamp: dataNow(),
        }));

      return {
        ...initialData(),

        fetchActiveAlerts: async (options) => {
          await runner.run(
            'alerts',
            async () => sortWeatherAlerts(unwrapList(await getActiveWeatherAlerts(getDataApiContext()))),
            (alerts) => ({ alerts }),
            { trailing: options?.bypassCache === true }
          );
        },

        fetchAlertDetail: async (alertId, options) => {
          const cached = get().alertDetailsById[alertId];
          if (cached && !options?.bypassCache) return cached;
          const result = await runner.run(
            'detail',
            async () => unwrapItem(await getWeatherAlert(getDataApiContext(), { alertId })),
            (alert, state) => (alert ? { alertDetailsById: { ...state.alertDetailsById, [alertId]: alert } } : {}),
            { flightKey: `detail:${alertId}` }
          );
          return result.ok ? result.value : (cached ?? null);
        },

        fetchNearbyAlerts: async (lat, lng, radiusMiles) => {
          await runner.run(
            'nearby',
            async () => sortWeatherAlerts(unwrapList(await getWeatherAlertsNearLocation(getDataApiContext(), { lat, lng, radiusMiles }))),
            (nearbyAlerts) => ({ nearbyAlerts })
          );
        },

        fetchHistory: async (startDate, endDate) => {
          await runner.run(
            'history',
            async () => unwrapList(await getWeatherAlertHistory(getDataApiContext(), { startDate, endDate })),
            (history) => ({ history })
          );
        },

        handleAlertReceived: async (alertId) => {
          try {
            const alert = unwrapItem(await getWeatherAlert(getDataApiContext(), { alertId }));
            if (alert) upsert(alert);
          } catch {
            await get().fetchActiveAlerts({ bypassCache: true });
          }
        },

        handleAlertUpdated: async (alertId) => get().handleAlertReceived(alertId),

        handleAlertExpired: (alertId) =>
          set((state) => ({
            alerts: state.alerts.filter((alert) => alert.WeatherAlertId !== alertId),
            nearbyAlerts: state.nearbyAlerts.filter((alert) => alert.WeatherAlertId !== alertId),
            lastWeatherAlertTimestamp: dataNow(),
          })),

        fetchSettings: () =>
          adminFetch(
            async () =>
              void (await runner.run(
                'settings',
                async () => unwrapItem(await getWeatherAlertSettings(getDataApiContext())),
                (settings) => ({ settings })
              ))
          ),
        saveSettings: (input) =>
          admin(async () => {
            const settings = unwrapItem(assertV4Success(await saveWeatherAlertSettings(getDataApiContext(), input)));
            if (settings) set({ settings });
          }),
        fetchSources: () =>
          adminFetch(
            async () =>
              void (await runner.run(
                'sources',
                async () => unwrapList(await getWeatherAlertSources(getDataApiContext())),
                (sources) => ({ sources })
              ))
          ),
        saveSource: (input) =>
          admin(async () => {
            assertV4Success(await saveWeatherAlertSource(getDataApiContext(), input));
            await get().fetchSources();
          }),
        deleteSource: (sourceId) =>
          admin(async () => {
            assertV4Success(await deleteWeatherAlertSource(getDataApiContext(), { sourceId }));
            await get().fetchSources();
          }),
        fetchZones: () =>
          adminFetch(
            async () =>
              void (await runner.run(
                'zones',
                async () => unwrapList(await getWeatherAlertZones(getDataApiContext())),
                (zones) => ({ zones })
              ))
          ),
        saveZone: (input) =>
          admin(async () => {
            assertV4Success(await saveWeatherAlertZone(getDataApiContext(), input));
            await get().fetchZones();
          }),
        deleteZone: (zoneId) =>
          admin(async () => {
            assertV4Success(await deleteWeatherAlertZone(getDataApiContext(), { zoneId }));
            await get().fetchZones();
          }),
      };
    },
    dataPersistOptions<WeatherAlertsState, Pick<WeatherAlertsData, 'alerts' | 'alertDetailsById' | 'fetchedAt'>>({
      name: 'omni-weather-alerts-storage',
      partialize: (state) => ({ alerts: state.alerts, alertDetailsById: state.alertDetailsById, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('omni-weather-alerts-storage', useWeatherAlertsStore);
registerDataStoreReset<WeatherAlertsState>('weather-alerts', useWeatherAlertsStore, initialData, () => runner.invalidate());

/** Responder home: active severe alerts, most severe first. */
export const selectSevereAlerts = (state: Pick<WeatherAlertsState, 'alerts'>): WeatherAlertResultData[] => sortWeatherAlerts(state.alerts.filter((alert) => isSevereWeatherAlert(alert) && isWeatherAlertActive(alert)));
