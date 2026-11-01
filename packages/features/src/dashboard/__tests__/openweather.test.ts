import {
  clearWeatherCache,
  type FetchLike,
  fetchWeatherOutlook,
  getWeatherOutlook,
  OpenWeatherError,
  parseCurrentWeather,
  parseForecast,
  weatherCacheKey,
  type WeatherOutlook,
} from '../integrations/openweather/openweather-client';

const KEY = 'secret-key-123';
const place = { latitude: 39.7392, longitude: -104.9903, units: 'imperial' as const };

const currentJson = { name: 'Denver', main: { temp: 71.6, humidity: 33 }, wind: { speed: 7.4 }, weather: [{ main: 'Clouds', description: 'scattered clouds', icon: '03d' }] };
const at = (day: number, hour: number): number => Math.floor(new Date(2026, 10, day, hour).getTime() / 1000);
const forecastJson = {
  list: [
    { dt: at(1, 9), main: { temp: 60 }, weather: [{ main: 'Clear', icon: '01d' }] },
    { dt: at(1, 12), main: { temp: 70 }, weather: [{ main: 'Rain', icon: '10d' }] },
    { dt: at(1, 18), main: { temp: 64 }, weather: [{ main: 'Clouds', icon: '04d' }] },
    { dt: at(2, 12), main: { temp: 50 }, weather: [{ main: 'Snow', icon: '13d' }] },
    { dt: at(2, 21), main: { temp: 41 }, weather: [{ main: 'Snow', icon: '13n' }] },
    { bad: true },
  ],
};

const okFetch = (): jest.MockedFunction<FetchLike> =>
  jest.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (url.includes('/forecast?') ? forecastJson : currentJson) })) as unknown as jest.MockedFunction<FetchLike>;

beforeEach(() => clearWeatherCache());

describe('OpenWeather parsing', () => {
  it('reads current conditions', () => {
    expect(parseCurrentWeather(currentJson)).toEqual({ current: { temperature: 72, humidity: 33, windSpeed: 7, condition: 'Clouds', description: 'scattered clouds', icon: '03d' }, location: 'Denver' });
    expect(() => parseCurrentWeather({ main: {} })).toThrow(OpenWeatherError);
  });

  it('groups the 3-hourly forecast by local day with highs, lows and midday conditions', () => {
    const days = parseForecast(forecastJson);
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ date: '2026-11-01', tempHigh: 70, tempLow: 60, condition: 'Rain' });
    expect(days[1]).toMatchObject({ date: '2026-11-02', tempHigh: 50, tempLow: 41, condition: 'Snow' });
    expect(parseForecast(null)).toEqual([]);
  });
});

describe('fetchWeatherOutlook', () => {
  it('handles a missing key or location as typed errors, without calling the service', async () => {
    const fetchImpl = okFetch();
    await expect(fetchWeatherOutlook({ ...place, apiKey: '' }, { fetchImpl })).rejects.toMatchObject({ kind: 'missing_key' });
    await expect(fetchWeatherOutlook({ ...place, apiKey: KEY, latitude: 0, longitude: 0 }, { fetchImpl })).rejects.toMatchObject({ kind: 'missing_location' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches current + forecast with the key and units', async () => {
    const fetchImpl = okFetch();
    const outlook = await fetchWeatherOutlook({ ...place, apiKey: KEY }, { fetchImpl, now: () => 5 });
    expect(outlook).toMatchObject({ location: 'Denver', units: 'imperial', fetchedAt: 5, current: { temperature: 72 } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toContain('https://api.openweathermap.org/data/2.5/weather?lat=39.7392&lon=-104.9903&units=imperial&appid=secret-key-123');
  });

  it('maps rejected keys and outages without ever putting the key in the error', async () => {
    const unauthorized = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as FetchLike;
    await expect(fetchWeatherOutlook({ ...place, apiKey: KEY }, { fetchImpl: unauthorized })).rejects.toMatchObject({ kind: 'unauthorized', status: 401 });
    const offline = jest.fn(async (url: string) => {
      throw new Error(`request to ${url} failed`);
    }) as unknown as FetchLike;
    const error = (await fetchWeatherOutlook({ ...place, apiKey: KEY }, { fetchImpl: offline }).catch((caught: unknown) => caught)) as OpenWeatherError;
    expect(error.kind).toBe('network');
    expect(`${error.message} ${JSON.stringify(error)}`).not.toContain(KEY);
  });
});

describe('getWeatherOutlook (cache)', () => {
  it('reuses a fresh answer and refetches a stale one', async () => {
    const fetchImpl = okFetch();
    let now = 1000;
    await getWeatherOutlook({ ...place, apiKey: KEY }, { fetchImpl, now: () => now });
    await getWeatherOutlook({ ...place, apiKey: KEY }, { fetchImpl, now: () => now + 60000 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    now += 11 * 60000;
    await getWeatherOutlook({ ...place, apiKey: KEY }, { fetchImpl, now: () => now });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('falls back to the last good answer (memory or durable) marked stale, but not for a missing key', async () => {
    const stored: Record<string, WeatherOutlook> = {};
    const durable = { read: (key: string) => stored[key] ?? null, write: (key: string, outlook: WeatherOutlook) => void (stored[key] = outlook) };
    await getWeatherOutlook({ ...place, apiKey: KEY }, { fetchImpl: okFetch(), durable, now: () => 1 });
    expect(stored[weatherCacheKey(place)]?.location).toBe('Denver');
    clearWeatherCache();

    const failing = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as FetchLike;
    const result = await getWeatherOutlook({ ...place, apiKey: KEY }, { fetchImpl: failing, durable, bypassCache: true });
    expect(result).toMatchObject({ stale: true, error: { kind: 'http' }, outlook: { location: 'Denver' } });

    await expect(getWeatherOutlook({ ...place, apiKey: '' }, { fetchImpl: failing, durable, bypassCache: true })).rejects.toMatchObject({ kind: 'missing_key' });
  });
});
