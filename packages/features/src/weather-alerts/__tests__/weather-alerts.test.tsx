import '../../status/__tests__/test-setup';

import { useWeatherAlertsStore } from '@resgrid/data';
import { type WeatherAlertResultData } from '@resgrid/models';
import { emitRealtimeEvent } from '@resgrid/realtime';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { weatherAlertsRoutes } from '../routes';
import WeatherAlertDetailScreen from '../screens/weather-alert-detail';
import WeatherAlertSettingsScreen from '../screens/weather-alert-settings';
import WeatherAlertsListScreen from '../screens/weather-alerts-list';

const mockCapabilities = { weatherAlerts: { admin: false } };
jest.mock('@resgrid/config', () => ({
  ...jest.requireActual('@resgrid/config'),
  useCapability: (key: keyof typeof mockCapabilities) => mockCapabilities[key],
}));

const alert = (WeatherAlertId: string, Event: string, Severity: number, extra: Partial<WeatherAlertResultData> = {}): WeatherAlertResultData =>
  ({
    WeatherAlertId,
    Event,
    Severity,
    Status: 0,
    AlertCategory: 0,
    Urgency: 0,
    Certainty: 0,
    Headline: `${Event} headline`,
    AreaDescription: 'Denver County',
    EffectiveUtc: '2026-10-31T10:00:00Z',
    CenterGeoLocation: '39.7,-104.9',
    ...extra,
  }) as WeatherAlertResultData;

const admin = {
  fetchSettings: jest.fn(async () => undefined),
  fetchSources: jest.fn(async () => undefined),
  fetchZones: jest.fn(async () => undefined),
  saveSource: jest.fn(async () => true),
  handleAlertReceived: jest.fn(async () => undefined),
  handleAlertExpired: jest.fn(),
};

beforeEach(() => {
  mockCapabilities.weatherAlerts.admin = false;
  (router.push as jest.Mock).mockClear();
  Object.values(admin).forEach((fn) => fn.mockClear());
  useWeatherAlertsStore.setState({
    alerts: [alert('a1', 'Tornado Warning', 0), alert('a2', 'Wind Advisory', 3), alert('a3', 'Flood Watch', 2)],
    alertDetailsById: {},
    settings: null,
    sources: [],
    zones: [],
    adminError: null,
    fetchActiveAlerts: jest.fn(async () => undefined),
    fetchAlertDetail: jest.fn(async (id: string) => useWeatherAlertsStore.getState().alerts.find((item) => item.WeatherAlertId === id) ?? null),
    ...admin,
  });
});

describe('WeatherAlertsListScreen', () => {
  it('filters by severity tab and opens the canonical detail route', () => {
    render(<WeatherAlertsListScreen />);
    expect(screen.getByText('weather_alerts.filter.all (3)')).toBeTruthy();

    fireEvent.press(screen.getByTestId('weather-severity-tab-0'));
    expect(screen.getByTestId('weather-alert-card-a1')).toBeTruthy();
    expect(screen.queryByTestId('weather-alert-card-a2')).toBeNull();

    fireEvent.press(screen.getByTestId('weather-alert-card-a1'));
    expect(router.push).toHaveBeenCalledWith('/weather-alerts/a1');
  });

  it('hides the settings entry without the admin capability and shows it with it', () => {
    const { unmount } = render(<WeatherAlertsListScreen />);
    expect(screen.queryByTestId('weather-alerts-settings-button')).toBeNull();
    unmount();

    mockCapabilities.weatherAlerts.admin = true;
    render(<WeatherAlertsListScreen />);
    fireEvent.press(screen.getByTestId('weather-alerts-settings-button'));
    expect(router.push).toHaveBeenCalledWith(weatherAlertsRoutes.settings());
  });

  it('applies realtime weather pings to the store', () => {
    render(<WeatherAlertsListScreen />);
    emitRealtimeEvent('weatherAlertReceived', 'a9');
    emitRealtimeEvent('weatherAlertExpired', 'a2');
    expect(admin.handleAlertReceived).toHaveBeenCalledWith('a9');
    expect(admin.handleAlertExpired).toHaveBeenCalledWith('a2');
  });
});

describe('WeatherAlertDetailScreen', () => {
  it('shows severity and passes the centre to the map slot', async () => {
    const renderMap = jest.fn((_alert: WeatherAlertResultData, center: { latitude: number; longitude: number } | null) => <Text testID="weather-map">{center ? `${center.latitude}` : 'none'}</Text>);
    render(<WeatherAlertDetailScreen alertId="a1" renderMap={renderMap} />);
    await waitFor(() => expect(screen.getByTestId('weather-map')).toHaveTextContent('39.7'));
    expect(screen.getByTestId('weather-alert-detail-severity')).toHaveTextContent('weather_alerts.severity.extreme');
  });

  it('refuses the reserved and unsafe ids', () => {
    expect(() => weatherAlertsRoutes.detail('settings')).toThrow();
    expect(() => weatherAlertsRoutes.detail('a/b')).toThrow();
  });
});

describe('WeatherAlertSettingsScreen', () => {
  it('is unavailable and never calls the admin endpoints without the capability', () => {
    render(<WeatherAlertSettingsScreen />);
    expect(screen.getByTestId('weather-alert-settings-unavailable')).toBeTruthy();
    expect(admin.fetchSettings).not.toHaveBeenCalled();
  });

  it('loads the admin slices and saves a new source with the capability', async () => {
    mockCapabilities.weatherAlerts.admin = true;
    render(<WeatherAlertSettingsScreen />);
    expect(admin.fetchSettings).toHaveBeenCalled();
    expect(admin.fetchSources).toHaveBeenCalled();
    expect(admin.fetchZones).toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('weather-settings-add-source'));
    const q = { includeHiddenElements: true } as const;
    fireEvent.press(screen.getByTestId('weather-source-save', q));
    expect(screen.getByTestId('weather-source-error', q)).toHaveTextContent('weather_alerts.settings.name_required');

    fireEvent.changeText(screen.getByTestId('weather-source-name', q), 'NWS Denver');
    fireEvent.press(screen.getByTestId('weather-source-save', q));
    await waitFor(() => expect(admin.saveSource).toHaveBeenCalledWith(expect.objectContaining({ Name: 'NWS Denver', SourceType: 0, PollIntervalMinutes: 15, Active: true })));
  });
});
