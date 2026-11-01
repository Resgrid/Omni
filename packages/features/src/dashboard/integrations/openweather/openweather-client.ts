import type { WeatherUnits } from '../../lib/widget-settings';

/**
 * OpenWeather client for the BigBoard weather widget (omni-plan §7.11: kept isolated under dashboard/integrations).
 * The API key is the department's `OpenWeatherApiKey` from `Config/GetConfig`; it rides only in the request URL to
 * api.openweathermap.org and is never logged, cached or put in an error. Responses are cached per place and units
 * (memory + the last good answer in durable storage, so a board that loses its connection keeps showing the weather,
 * marked stale). No key → a typed `missing_key` error the widget shows as "not configured".
 */

export const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5';
/** How long an answer is reused before the widget asks again. */
export const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;
const FORECAST_DAYS = 5;

export interface WeatherConditions {
  temperature: number;
  /** OpenWeather's condition group ("Rain", "Clouds", "Clear"…), used to pick an icon. */
  condition: string;
  description: string;
  humidity: number;
  windSpeed: number;
  icon: string;
}

export interface ForecastDay {
  /** Local calendar day (YYYY-MM-DD). */
  date: string;
  /** Epoch ms of local noon that day, for formatting the weekday. */
  dayMs: number;
  tempHigh: number;
  tempLow: number;
  condition: string;
  icon: string;
}

export interface WeatherOutlook {
  current: WeatherConditions;
  forecast: ForecastDay[];
  /** Place name OpenWeather reports ('' when none). */
  location: string;
  units: WeatherUnits;
  fetchedAt: number;
}

export type OpenWeatherErrorKind = 'missing_key' | 'missing_location' | 'unauthorized' | 'http' | 'network' | 'invalid_response';

export class OpenWeatherError extends Error {
  public readonly kind: OpenWeatherErrorKind;
  public readonly status?: number;

  constructor(kind: OpenWeatherErrorKind, status?: number) {
    super(`OpenWeather request failed (${kind})`);
    this.name = 'OpenWeatherError';
    this.kind = kind;
    this.status = status;
  }
}

export interface WeatherRequest {
  apiKey: string | null | undefined;
  latitude: number;
  longitude: number;
  units: WeatherUnits;
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

type Raw = Record<string, unknown>;
const isRecord = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const firstWeather = (entry: Raw): { condition: string; description: string; icon: string } => {
  const weather = Array.isArray(entry.weather) && isRecord(entry.weather[0]) ? entry.weather[0] : {};
  return {
    condition: typeof weather.main === 'string' ? weather.main : '',
    description: typeof weather.description === 'string' ? weather.description : '',
    icon: typeof weather.icon === 'string' ? weather.icon : '01d',
  };
};

/** `/weather` → current conditions. Throws `invalid_response` when the temperature is missing. */
export function parseCurrentWeather(json: unknown): { current: WeatherConditions; location: string } {
  if (!isRecord(json) || !isRecord(json.main)) throw new OpenWeatherError('invalid_response');
  const temperature = num(json.main.temp);
  if (temperature === null) throw new OpenWeatherError('invalid_response');
  const wind = isRecord(json.wind) ? json.wind : {};
  return {
    current: { temperature: Math.round(temperature), humidity: Math.round(num(json.main.humidity) ?? 0), windSpeed: Math.round(num(wind.speed) ?? 0), ...firstWeather(json) },
    location: typeof json.name === 'string' ? json.name : '',
  };
}

const localDateKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** `/forecast` (3-hourly) → one entry per local day: high/low and the conditions nearest midday. */
export function parseForecast(json: unknown, days: number = FORECAST_DAYS): ForecastDay[] {
  if (!isRecord(json) || !Array.isArray(json.list)) return [];
  const byDay = new Map<string, Raw[]>();
  for (const entry of json.list) {
    if (!isRecord(entry) || num(entry.dt) === null || !isRecord(entry.main) || num(entry.main.temp) === null) continue;
    const key = localDateKey(new Date((entry.dt as number) * 1000));
    const list = byDay.get(key) ?? [];
    list.push(entry);
    byDay.set(key, list);
  }
  return Array.from(byDay.entries())
    .slice(0, days)
    .map(([date, entries]) => {
      const temps = entries.map((entry) => (entry.main as Raw).temp as number);
      const midday = entries.reduce((best, entry) => (Math.abs(new Date((entry.dt as number) * 1000).getHours() - 12) < Math.abs(new Date((best.dt as number) * 1000).getHours() - 12) ? entry : best), entries[0] as Raw);
      const [year, month, day] = date.split('-').map(Number);
      const { condition, icon } = firstWeather(midday);
      return { date, dayMs: new Date(year as number, (month as number) - 1, day as number, 12).getTime(), tempHigh: Math.round(Math.max(...temps)), tempLow: Math.round(Math.min(...temps)), condition, icon };
    });
}

const validLocation = (latitude: number, longitude: number): boolean =>
  Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && !(latitude === 0 && longitude === 0);

const requestUrl = (path: 'weather' | 'forecast', request: WeatherRequest, apiKey: string): string =>
  `${OPENWEATHER_BASE_URL}/${path}?lat=${encodeURIComponent(request.latitude.toFixed(4))}&lon=${encodeURIComponent(request.longitude.toFixed(4))}&units=${encodeURIComponent(request.units)}&appid=${encodeURIComponent(apiKey)}`;

const getJson = async (fetchImpl: FetchLike, url: string): Promise<unknown> => {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  try {
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await fetchImpl(url, controller ? { signal: controller.signal } : undefined);
    } catch {
      // The URL carries the key: never rethrow the transport error (its message can include it).
      throw new OpenWeatherError('network');
    }
    if (response.status === 401 || response.status === 403) throw new OpenWeatherError('unauthorized', response.status);
    if (!response.ok) throw new OpenWeatherError('http', response.status);
    try {
      return await response.json();
    } catch {
      throw new OpenWeatherError('invalid_response');
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/** Fetches current conditions and the 5-day outlook in parallel. Throws `OpenWeatherError`. */
export async function fetchWeatherOutlook(request: WeatherRequest, options: { fetchImpl?: FetchLike; now?: () => number } = {}): Promise<WeatherOutlook> {
  const apiKey = (request.apiKey ?? '').trim();
  if (!apiKey) throw new OpenWeatherError('missing_key');
  if (!validLocation(request.latitude, request.longitude)) throw new OpenWeatherError('missing_location');
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (!fetchImpl) throw new OpenWeatherError('network');
  const [currentJson, forecastJson] = await Promise.all([getJson(fetchImpl, requestUrl('weather', request, apiKey)), getJson(fetchImpl, requestUrl('forecast', request, apiKey))]);
  const { current, location } = parseCurrentWeather(currentJson);
  return { current, forecast: parseForecast(forecastJson), location, units: request.units, fetchedAt: (options.now ?? Date.now)() };
}

// ------------------------------------------------------------------------------------------------ cache

/** Cache key: place (≈100 m) and units. The API key is deliberately not part of it (it is never stored). */
export const weatherCacheKey = (request: Pick<WeatherRequest, 'latitude' | 'longitude' | 'units'>): string => `${request.latitude.toFixed(3)},${request.longitude.toFixed(3)},${request.units}`;

export interface WeatherCacheStore {
  read: (key: string) => WeatherOutlook | null;
  write: (key: string, outlook: WeatherOutlook) => void;
}

const memory = new Map<string, WeatherOutlook>();
const inFlight = new Map<string, Promise<WeatherOutlook>>();

export interface WeatherResult {
  outlook: WeatherOutlook;
  /** True when this is an older answer shown because the newest request failed. */
  stale: boolean;
  error?: OpenWeatherError;
}

/**
 * Cached outlook for a place: a fresh cached answer is reused, concurrent requests share one fetch, and when a refresh
 * fails the last good answer (memory, then `durable`) comes back marked stale. Throws only when there is nothing to show.
 */
export async function getWeatherOutlook(
  request: WeatherRequest,
  options: { fetchImpl?: FetchLike; now?: () => number; durable?: WeatherCacheStore | null; maxAgeMs?: number; bypassCache?: boolean } = {}
): Promise<WeatherResult> {
  const now = (options.now ?? Date.now)();
  const key = weatherCacheKey(request);
  const cached = memory.get(key) ?? options.durable?.read(key) ?? null;
  if (cached && !options.bypassCache && now - cached.fetchedAt < (options.maxAgeMs ?? WEATHER_CACHE_TTL_MS)) return { outlook: cached, stale: false };

  let flight = inFlight.get(key);
  if (!flight) {
    flight = fetchWeatherOutlook(request, { fetchImpl: options.fetchImpl, now: options.now }).finally(() => inFlight.delete(key));
    inFlight.set(key, flight);
  }
  try {
    const outlook = await flight;
    memory.set(key, outlook);
    options.durable?.write(key, outlook);
    return { outlook, stale: false };
  } catch (error) {
    const weatherError = error instanceof OpenWeatherError ? error : new OpenWeatherError('network');
    // A missing key or place is a configuration answer, not an outage: never paper over it with old weather.
    if (cached && weatherError.kind !== 'missing_key' && weatherError.kind !== 'missing_location') return { outlook: cached, stale: true, error: weatherError };
    throw weatherError;
  }
}

/** Test helper. */
export function clearWeatherCache(): void {
  memory.clear();
  inFlight.clear();
}
