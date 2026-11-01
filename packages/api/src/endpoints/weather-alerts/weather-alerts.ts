import type {
  ActiveWeatherAlertsResult,
  GetWeatherAlertResult,
  SaveWeatherAlertSettingsInput,
  SaveWeatherAlertSourceInput,
  SaveWeatherAlertZoneInput,
  StandardApiResponseV4Base,
  WeatherAlertSettingsResult,
  WeatherAlertSourcesResult,
  WeatherAlertZonesResult,
} from '@resgrid/models';

import { type ApiContext, cachedRequest, type CachedRequestOptions, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for weather-alerts (WeatherAlerts). The contract test checks every entry against Swagger. */
export const weatherAlertsEndpoints = defineEndpoints('weather-alerts', {
  deleteWeatherAlertSource: { method: 'DELETE', path: '/WeatherAlerts/DeleteSource/{sourceId}' },
  deleteWeatherAlertZone: { method: 'DELETE', path: '/WeatherAlerts/DeleteZone/{zoneId}' },
  getActiveWeatherAlerts: { method: 'GET', path: '/WeatherAlerts/GetActiveAlerts', cacheTtlMs: 60 * 1000 },
  getWeatherAlert: { method: 'GET', path: '/WeatherAlerts/GetWeatherAlert/{alertId}' },
  getWeatherAlertHistory: { method: 'GET', path: '/WeatherAlerts/GetAlertHistory', query: ['startDate', 'endDate'] },
  getWeatherAlertSettings: { method: 'GET', path: '/WeatherAlerts/GetSettings', cacheTtlMs: 5 * 60 * 1000 },
  getWeatherAlertsNearLocation: { method: 'GET', path: '/WeatherAlerts/GetAlertsNearLocation', query: ['lat', 'lng', 'radiusMiles'] },
  getWeatherAlertSources: { method: 'GET', path: '/WeatherAlerts/GetSources' },
  getWeatherAlertZones: { method: 'GET', path: '/WeatherAlerts/GetZones', cacheTtlMs: 5 * 60 * 1000 },
  saveWeatherAlertSettings: { method: 'POST', path: '/WeatherAlerts/SaveSettings', body: 'json' },
  saveWeatherAlertSource: { method: 'POST', path: '/WeatherAlerts/SaveSource', body: 'json' },
  saveWeatherAlertZone: { method: 'POST', path: '/WeatherAlerts/SaveZone', body: 'json' },
});

const E = weatherAlertsEndpoints;

/** Deletes a weather alert source. `DELETE /WeatherAlerts/DeleteSource/{sourceId}` — legacy: D. */
export const deleteWeatherAlertSource = (ctx: ApiContext, params: { sourceId: string }, options?: RequestOptions): Promise<StandardApiResponseV4Base> =>
  request<StandardApiResponseV4Base>(ctx, E.deleteWeatherAlertSource, { params }, options);

/** Deletes a weather alert zone. `DELETE /WeatherAlerts/DeleteZone/{zoneId}` — legacy: D. */
export const deleteWeatherAlertZone = (ctx: ApiContext, params: { zoneId: string }, options?: RequestOptions): Promise<StandardApiResponseV4Base> =>
  request<StandardApiResponseV4Base>(ctx, E.deleteWeatherAlertZone, { params }, options);

/** Gets all active weather alerts for the department. `GET /WeatherAlerts/GetActiveAlerts` (cached) — legacy: BDIRU. */
export const getActiveWeatherAlerts = (ctx: ApiContext, options?: CachedRequestOptions): Promise<ActiveWeatherAlertsResult> => cachedRequest<ActiveWeatherAlertsResult>(ctx, E.getActiveWeatherAlerts, {}, options);

/** Gets a single weather alert by id. `GET /WeatherAlerts/GetWeatherAlert/{alertId}` — legacy: BDIRU. */
export const getWeatherAlert = (ctx: ApiContext, params: { alertId: string }, options?: RequestOptions): Promise<GetWeatherAlertResult> => request<GetWeatherAlertResult>(ctx, E.getWeatherAlert, { params }, options);

/** Gets historical weather alerts for a date range. `GET /WeatherAlerts/GetAlertHistory` — legacy: BDIU. */
export const getWeatherAlertHistory = (ctx: ApiContext, params: { startDate?: string; endDate?: string } = {}, options?: RequestOptions): Promise<ActiveWeatherAlertsResult> =>
  request<ActiveWeatherAlertsResult>(ctx, E.getWeatherAlertHistory, { params }, options);

/** Gets weather alert settings for the department. `GET /WeatherAlerts/GetSettings` (cached) — legacy: BDIRU. */
export const getWeatherAlertSettings = (ctx: ApiContext, options?: CachedRequestOptions): Promise<WeatherAlertSettingsResult> => cachedRequest<WeatherAlertSettingsResult>(ctx, E.getWeatherAlertSettings, {}, options);

/** Gets active weather alerts near a geographic location. `GET /WeatherAlerts/GetAlertsNearLocation` — legacy: BDIRU. */
export const getWeatherAlertsNearLocation = (ctx: ApiContext, params: { lat?: number | string; lng?: number | string; radiusMiles?: number | string } = {}, options?: RequestOptions): Promise<ActiveWeatherAlertsResult> =>
  request<ActiveWeatherAlertsResult>(ctx, E.getWeatherAlertsNearLocation, { params }, options);

/** Gets all weather alert sources for the department. `GET /WeatherAlerts/GetSources` — legacy: D. */
export const getWeatherAlertSources = (ctx: ApiContext, options?: RequestOptions): Promise<WeatherAlertSourcesResult> => request<WeatherAlertSourcesResult>(ctx, E.getWeatherAlertSources, {}, options);

/** Gets all weather alert zones for the department. `GET /WeatherAlerts/GetZones` (cached) — legacy: BDIU. */
export const getWeatherAlertZones = (ctx: ApiContext, options?: CachedRequestOptions): Promise<WeatherAlertZonesResult> => cachedRequest<WeatherAlertZonesResult>(ctx, E.getWeatherAlertZones, {}, options);

/** Saves weather alert settings for the department. `POST /WeatherAlerts/SaveSettings` — legacy: D. */
export const saveWeatherAlertSettings = (ctx: ApiContext, body: SaveWeatherAlertSettingsInput, options?: RequestOptions): Promise<WeatherAlertSettingsResult> =>
  request<WeatherAlertSettingsResult>(ctx, E.saveWeatherAlertSettings, { body }, options);

/** Creates or updates a weather alert source. `POST /WeatherAlerts/SaveSource` — legacy: D. */
export const saveWeatherAlertSource = (ctx: ApiContext, body: SaveWeatherAlertSourceInput, options?: RequestOptions): Promise<WeatherAlertSourcesResult> =>
  request<WeatherAlertSourcesResult>(ctx, E.saveWeatherAlertSource, { body }, options);

/** Creates or updates a weather alert zone. `POST /WeatherAlerts/SaveZone` — legacy: D. */
export const saveWeatherAlertZone = (ctx: ApiContext, body: SaveWeatherAlertZoneInput, options?: RequestOptions): Promise<WeatherAlertZonesResult> =>
  request<WeatherAlertZonesResult>(ctx, E.saveWeatherAlertZone, { body }, options);
