import { getActiveWeatherAlerts, getWeatherAlert, saveWeatherAlertZone } from '@resgrid/api';
import type { WeatherAlertResultData } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, manifest, networkError, ok, persisted } from '../../__tests__/helpers';
import { setDataVariant } from '../../core/runtime';
import { filterWeatherAlerts, isWeatherAlertActive, selectSevereAlerts, sortWeatherAlerts, useWeatherAlertsStore } from '../weather-alerts-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getActiveWeatherAlerts: jest.fn(),
  getWeatherAlert: jest.fn(),
  saveWeatherAlertZone: jest.fn(),
  getWeatherAlertZones: jest.fn(async () => ({ Data: [], Status: 'success' })),
}));

const alert = (id: string, Severity: number, EffectiveUtc: string, extra: Partial<WeatherAlertResultData> = {}): WeatherAlertResultData =>
  ({ WeatherAlertId: id, Severity, EffectiveUtc, Status: 0, ExpiresUtc: null, AlertCategory: 0, ...extra }) as WeatherAlertResultData;

let runtime: DataTestRuntime;

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'unit' });
  await defaultResetRegistry.getStoreResets().get('data.weather-alerts')?.('logout');
});

describe('weather alert helpers (Unit filter/sort, Responder severe selectors)', () => {
  const alerts = [
    alert('minor-new', 3, '2026-10-31T11:00:00Z'),
    alert('severe-old', 1, '2026-10-30T11:00:00Z'),
    alert('severe-new', 1, '2026-10-31T10:00:00'),
    alert('expired', 0, '2026-10-29T00:00:00Z', { ExpiresUtc: '2026-10-30T00:00:00Z' }),
  ];

  it('sorts by severity then newest; by newest; by soonest expiry', () => {
    expect(sortWeatherAlerts(alerts).map((a) => a.WeatherAlertId)).toEqual(['expired', 'severe-new', 'severe-old', 'minor-new']);
    expect(sortWeatherAlerts(alerts, 'newest')[0].WeatherAlertId).toBe('minor-new');
    expect(sortWeatherAlerts(alerts, 'expiring')[0].WeatherAlertId).toBe('expired');
  });

  it('filters by severity/category/active and selects active severe alerts', () => {
    expect(isWeatherAlertActive(alerts[3], runtime.clock.now())).toBe(false);
    expect(filterWeatherAlerts(alerts, { severities: [3] }).map((a) => a.WeatherAlertId)).toEqual(['minor-new']);
    expect(filterWeatherAlerts(alerts, { activeOnly: true })).toHaveLength(3);
    expect(selectSevereAlerts({ alerts }).map((a) => a.WeatherAlertId)).toEqual(['severe-new', 'severe-old']);
  });
});

describe('weather alerts store (Dispatch baseline)', () => {
  it('loads and persists active alerts; realtime received/expired update in place', async () => {
    jest.mocked(getActiveWeatherAlerts).mockResolvedValue(ok([alert('a', 2, '2026-10-31T09:00:00Z')]) as never);
    await useWeatherAlertsStore.getState().fetchActiveAlerts();
    jest.mocked(getWeatherAlert).mockResolvedValue(ok(alert('b', 0, '2026-10-31T10:00:00Z')) as never);
    await useWeatherAlertsStore.getState().handleAlertReceived('b');
    expect(useWeatherAlertsStore.getState().alerts.map((a) => a.WeatherAlertId)).toEqual(['b', 'a']);
    useWeatherAlertsStore.getState().handleAlertExpired('a');
    expect(useWeatherAlertsStore.getState().alerts.map((a) => a.WeatherAlertId)).toEqual(['b']);
    expect(persisted(runtime.kv, 'omni-weather-alerts-storage')?.state.alerts).toHaveLength(1);
  });

  it('falls back to a full refetch when a received alert cannot be read', async () => {
    jest.mocked(getWeatherAlert).mockRejectedValue(networkError());
    jest.mocked(getActiveWeatherAlerts).mockResolvedValue(ok([]) as never);
    await useWeatherAlertsStore.getState().handleAlertReceived('x');
    expect(getActiveWeatherAlerts).toHaveBeenCalled();
  });

  it('refuses the admin slice locally without weatherAlerts.admin, and allows it on Dispatch', async () => {
    expect(await useWeatherAlertsStore.getState().saveZone({ Name: 'Z' } as never)).toBe(false);
    expect(useWeatherAlertsStore.getState().adminError?.code).toBe('forbidden');
    expect(saveWeatherAlertZone).not.toHaveBeenCalled();
    setDataVariant(manifest('dispatch'));
    jest.mocked(saveWeatherAlertZone).mockResolvedValue(ok([]) as never);
    expect(await useWeatherAlertsStore.getState().saveZone({ Name: 'Z' } as never)).toBe(true);
  });
});
