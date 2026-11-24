import './test-setup';

import { useNetInfo } from '@react-native-community/netinfo';
import { useCallsStore, useCustomMapsStore, useMapMarkersStore, useNotesStore, usePersonnelStore, useUnitsStore, useWeatherAlertsStore } from '@resgrid/data';
import type { CallPriorityResultData, CallResultData, MapMakerInfoData, NoteResultData, PersonnelInfoResultData, StatusesResultData, UnitInfoResultData, WeatherAlertResultData } from '@resgrid/models';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

import { facilityMapsState } from '../../map/__tests__/facility-fixtures';
import { pin } from '../../map/__tests__/fixtures';
import { WIDGET_COMPONENTS, WidgetRenderer } from '../components/widget-renderer';
import { CallsSummaryWidget } from '../components/widgets/calls-summary-widget';
import { CallsWidget } from '../components/widgets/calls-widget';
import { MapWidget } from '../components/widgets/map-widget';
import { NotesWidget } from '../components/widgets/notes-widget';
import { PersonnelStaffingSummaryWidget, PersonnelStatusSummaryWidget } from '../components/widgets/personnel-option-summary-widget';
import { PersonnelWidget } from '../components/widgets/personnel-widget';
import { ScheduledCallsWidget } from '../components/widgets/scheduled-calls-widget';
import { TimeWidget } from '../components/widgets/time-widget';
import { UnitsSummaryWidget } from '../components/widgets/units-summary-widget';
import { WeatherAlertsWidget } from '../components/widgets/weather-alerts-widget';
import { WeatherWidget } from '../components/widgets/weather-widget';
import { useWidgetSettingsStore } from '../hooks/use-widget-settings-store';
import { clearWeatherCache } from '../integrations/openweather/openweather-client';
import { WIDGET_TYPES } from '../lib/widget-types';
import { setConfig, stubDataStores, utcAgo } from './fixtures';

const props = { isEditMode: false, width: 600, height: 400 };

const person = (UserId: string, extra: Partial<PersonnelInfoResultData> = {}): PersonnelInfoResultData =>
  ({
    UserId,
    FirstName: UserId,
    LastName: 'Smith',
    GroupId: '',
    GroupName: 'Station 1',
    Roles: ['Driver'],
    Status: 'Available',
    StatusColor: '#00aa00',
    Staffing: 'On Shift',
    StaffingColor: '#0000aa',
    ...extra,
  }) as PersonnelInfoResultData;

const call = (CallId: string, extra: Partial<CallResultData> = {}): CallResultData =>
  ({ CallId, Number: CallId, Name: `Call ${CallId}`, Address: '1 Main St', Priority: 1, State: 0, LoggedOnUtc: utcAgo(300), ...extra }) as CallResultData;

const priority = (Id: number, Name: string): CallPriorityResultData => ({ Id, Name, Color: '#ff0000', Sort: Id, BaseType: Id, IsDeleted: false, IsDefault: false }) as CallPriorityResultData;

let mocks: ReturnType<typeof stubDataStores>;

beforeEach(() => {
  mocks = stubDataStores();
  (router.push as jest.Mock).mockClear();
  (useNetInfo as jest.Mock).mockReturnValue({ isConnected: true, isInternetReachable: true });
});

describe('WidgetRenderer', () => {
  it('has a component for all 14 widget types', async () => {
    expect(Object.keys(WIDGET_COMPONENTS).sort()).toEqual([...WIDGET_TYPES].sort());
    await render(<WidgetRenderer type="time" {...props} />);
    expect(screen.getByTestId('time-widget')).toBeTruthy();
  });
});

describe('TimeWidget', () => {
  it('shows the clock and date', async () => {
    useWidgetSettingsStore.getState().updateSettings('time', { format24Hour: true, showSeconds: false });
    await render(<TimeWidget {...props} />);
    expect(screen.getByTestId('time-widget-clock').props.children).toMatch(/^\d{2}:\d{2}$/);
    expect(screen.getByTestId('time-widget-date')).toBeTruthy();
  });
});

describe('PersonnelWidget', () => {
  it('renders the roster table and filters by status meaning', async () => {
    usePersonnelStore.setState({ personnel: [person('Ann'), person('Bob', { StatusBaseType: 1, Status: 'Unavailable for call' }), person('Cy', { StatusBaseType: 2, Status: 'En Route' })] });
    useWidgetSettingsStore.getState().updateSettings('personnel', { hideNotResponding: true, showRoles: false });
    await render(<PersonnelWidget {...props} />);
    expect(screen.getByText('Ann Smith')).toBeTruthy();
    expect(screen.queryByText('Bob Smith')).toBeNull();
    // Responding people first.
    expect(screen.getAllByText(/Smith$/).map((node) => node.props.children)).toEqual(['Cy Smith', 'Ann Smith']);
    expect(screen.queryByText('personnel.column.roles')).toBeNull();
  });

  it('shows the last data as stale when offline, and an error with nothing to show', async () => {
    usePersonnelStore.setState({ personnel: [person('Ann')] });
    (useNetInfo as jest.Mock).mockReturnValue({ isConnected: false, isInternetReachable: false });
    const { unmount } = await render(<PersonnelWidget {...props} />);
    expect(screen.getByTestId('personnel-widget-stale')).toBeTruthy();
    await unmount();

    usePersonnelStore.setState({ personnel: [], errors: { personnel: { code: 'network', messageKey: 'errors.data.network' } } });
    await render(<PersonnelWidget {...props} />);
    expect(screen.getByTestId('personnel-widget-error')).toBeTruthy();
  });
});

describe('CallsWidget', () => {
  const headerLabels = (): string[] => screen.getAllByText(/^configure\./).map((node) => String(node.props.children));
  const fontSizeOf = (text: string): number | undefined => StyleSheet.flatten(screen.getByText(text).props.style)?.fontSize;

  beforeEach(() => {
    useCallsStore.setState({ calls: [call('1'), call('2', { State: 8 })], callPriorities: [priority(1, 'Urgent')], callDispatches: { '1': [{ Id: 'u1', Type: 'Unit', Name: 'Engine 1' } as never] } });
  });

  it("lists active calls one per row in BigBoard's columns, never as cards (pending calls never count)", async () => {
    await render(<CallsWidget {...props} />);
    expect(screen.getByTestId('calls-table')).toBeTruthy();
    expect(screen.queryByTestId('call-card-1')).toBeNull();
    expect(headerLabels()).toEqual(['configure.id', 'configure.name', 'configure.address', 'configure.timestamp', 'configure.priority', 'configure.dispatched']);
    expect(screen.getByText('Call 1')).toBeTruthy();
    expect(screen.queryByText('Call 2')).toBeNull();
    expect(screen.getByText('1 Main St')).toBeTruthy();
    expect(screen.getByText('Urgent')).toBeTruthy();
    expect(screen.getByTestId('calls-widget-ticker-1')).toBeTruthy();
    // The list takes the whole widget body.
    expect(StyleSheet.flatten(screen.getByTestId('calls-widget-body').props.style)).toMatchObject({ padding: 2 });
  });

  it('honours every calls setting: visible columns, column order and font size (dispatch badges included)', async () => {
    useWidgetSettingsStore.getState().updateSettings('calls', { showAddress: false, showId: false, columnOrder: ['priority', 'dispatched', 'name'], fontSize: 20, scrollDispatches: false });
    await render(<CallsWidget {...props} />);
    expect(headerLabels()).toEqual(['configure.priority', 'configure.dispatched', 'configure.name', 'configure.timestamp']);
    expect(screen.queryByText('1 Main St')).toBeNull();
    expect(fontSizeOf('Call 1')).toBe(20);
    expect(fontSizeOf('Urgent')).toBe(20);
    expect(fontSizeOf('Engine 1')).toBe(19);
  });

  it('still names each call when every column is switched off', async () => {
    useWidgetSettingsStore.getState().updateSettings('calls', { showId: false, showName: false, showAddress: false, showTimestamp: false, showPriority: false, showDispatched: false });
    await render(<CallsWidget {...props} />);
    expect(headerLabels()).toEqual(['configure.name']);
    expect(screen.getByText('Call 1')).toBeTruthy();
  });

  it('shows the empty message in the list when no call is active', async () => {
    useCallsStore.setState({ calls: [call('2', { State: 8 })] });
    await render(<CallsWidget {...props} />);
    expect(screen.getByTestId('calls-table-empty')).toBeTruthy();
  });
});

describe('ScheduledCallsWidget', () => {
  it('lists pending scheduled calls by time with overdue marks, and fetches their dispatches', async () => {
    useCallsStore.setState({
      scheduledCalls: [call('late', { Name: 'Later', DispatchedOnUtc: new Date(Date.now() + 3 * 3600000).toISOString() }), call('over', { Name: 'Overdue', DispatchedOnUtc: utcAgo(600) })],
      callPriorities: [priority(1, 'Urgent')],
    });
    await render(<ScheduledCallsWidget {...props} />);
    expect(screen.getAllByText(/^(Later|Overdue)$/).map((node) => node.props.children)).toEqual(['Overdue', 'Later']);
    expect(screen.getByText(/scheduledCalls\.overdue/)).toBeTruthy();
    await waitFor(() => expect(mocks.fetchCallExtraData).toHaveBeenCalledWith('late'));
  });

  it('sizes the dispatch badges with the font size setting', async () => {
    useCallsStore.setState({ scheduledCalls: [call('late', { Name: 'Later', DispatchedOnUtc: new Date(Date.now() + 3 * 3600000).toISOString() })] });
    // SAFETY: the scheduled-calls widget reads only `Dispatches` (Id, Type, Name) from a call's extra data.
    mocks.fetchCallExtraData.mockResolvedValue({ Dispatches: [{ Id: 'u1', Type: 'Unit', Name: 'Engine 1' }] } as never);
    useWidgetSettingsStore.getState().updateSettings('scheduledCalls', { fontSize: 18 });
    await render(<ScheduledCallsWidget {...props} />);
    await waitFor(() => expect(screen.getByTestId('scheduled-calls-widget-ticker-late')).toBeTruthy());
    expect(StyleSheet.flatten(screen.getByText('Engine 1').props.style)?.fontSize).toBe(17);
  });
});

describe('summary widgets', () => {
  it('counts personnel per status and staffing option', async () => {
    usePersonnelStore.setState({
      personnel: [person('a', { StatusId: '1', StaffingId: '5' }), person('b', { StatusId: '1', StaffingId: '6' }), person('c', { StatusId: '2', StaffingId: '5' })],
      statusOptions: [{ Id: 1, Text: 'Available', BColor: '#00ff00' } as StatusesResultData, { Id: 2, Text: 'Responding', BColor: '#ffaa00' } as StatusesResultData],
      staffingOptions: [{ Id: 5, Text: 'On Shift' } as StatusesResultData, { Id: 6, Text: 'Off' } as StatusesResultData],
    });
    const { unmount } = await render(<PersonnelStatusSummaryWidget {...props} />);
    expect(screen.getByTestId('personnel-status-summary-widget-row-1').props.accessibilityLabel).toBe('Available: 2');
    await unmount();
    await render(<PersonnelStaffingSummaryWidget {...props} />);
    expect(screen.getByTestId('personnel-staffing-summary-widget-row-5').props.accessibilityLabel).toBe('On Shift: 2');
  });

  it('counts units by meaning and calls by priority', async () => {
    useUnitsStore.setState({ unitInfos: [{ UnitId: '1', CurrentStatusBaseType: 0 } as UnitInfoResultData, { UnitId: '2', CurrentStatusBaseType: 2 } as UnitInfoResultData] });
    useWidgetSettingsStore.getState().updateSettings('unitsSummary', { showOnScene: false });
    const { unmount } = await render(<UnitsSummaryWidget {...props} />);
    expect(screen.getByTestId('units-summary-total').props.accessibilityLabel).toBe('dashboard.summary.total: 2');
    expect(screen.getByTestId('units-summary-responding').props.accessibilityLabel).toBe('dashboard.summary.responding: 1');
    expect(screen.queryByTestId('units-summary-on-scene')).toBeNull();
    await unmount();

    useCallsStore.setState({ calls: [call('1'), call('2', { Priority: 3 }), call('3', { State: 8 })], callPriorities: [priority(1, 'Urgent'), priority(3, 'Emergency')] });
    await render(<CallsSummaryWidget {...props} />);
    expect(screen.getByTestId('calls-summary-total').props.accessibilityLabel).toBe('dashboard.summary.active_calls: 2');
    expect(screen.getByTestId('calls-summary-priority-3').props.accessibilityLabel).toBe('Emergency: 1');
    expect(screen.getByTestId('calls-summary-recent')).toBeTruthy();
  });
});

describe('NotesWidget', () => {
  it('shows notes as plain text, filtered by category', async () => {
    useNotesStore.setState({
      notes: [
        { NoteId: 'n1', Title: 'Hydrant out', Body: '<p>Main <b>and</b> 5th</p>', Category: 'Ops', ExpiresOn: '', AddedOn: '2026-10-01T10:00:00' } as NoteResultData,
        { NoteId: 'n2', Title: 'Party', Body: 'Friday', Category: 'Social', ExpiresOn: '', AddedOn: '2026-10-02T10:00:00' } as NoteResultData,
      ],
    });
    useWidgetSettingsStore.getState().updateSettings('notes', { category: 'Ops' });
    await render(<NotesWidget {...props} />);
    expect(screen.getByText('Hydrant out')).toBeTruthy();
    expect(screen.getByText('Main and 5th')).toBeTruthy();
    expect(screen.queryByText('Party')).toBeNull();
  });
});

describe('WeatherAlertsWidget', () => {
  it('shows the configured severities, capped, and opens the canonical alert page', async () => {
    const alert = (WeatherAlertId: string, Severity: number): WeatherAlertResultData =>
      ({
        WeatherAlertId,
        Event: `Event ${WeatherAlertId}`,
        Severity,
        AlertCategory: 0,
        Headline: 'Headline',
        AreaDescription: 'County',
        ExpiresUtc: new Date(Date.now() + 7200000).toISOString(),
      }) as WeatherAlertResultData;

    useWeatherAlertsStore.setState({ alerts: [alert('a', 3), alert('b', 0), alert('c', 1)] });
    useWidgetSettingsStore.getState().updateSettings('weatherAlerts', { showMinor: false, maxAlertsInWidget: 1 });
    await render(<WeatherAlertsWidget {...props} />);
    expect(screen.getByTestId('weather-alerts-widget-alert-b')).toBeTruthy();
    expect(screen.queryByTestId('weather-alerts-widget-alert-c')).toBeNull();
    expect(screen.queryByTestId('weather-alerts-widget-alert-a')).toBeNull();
    await fireEvent.press(screen.getByTestId('weather-alerts-widget-alert-b'));
    expect(router.push).toHaveBeenCalledWith('/weather-alerts/b');
  });
});

describe('WeatherWidget', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearWeatherCache();
  });

  it('says weather is not configured without a department key', async () => {
    setConfig({ OpenWeatherApiKey: '', MapCenterLatitude: 39.7, MapCenterLongitude: -104.9 });
    await render(<WeatherWidget {...props} />);
    expect(await screen.findByTestId('weather-widget-missing_key')).toBeTruthy();
  });

  it('asks for a location when neither the widget nor the department has one', async () => {
    setConfig({ OpenWeatherApiKey: 'k', MapCenterLatitude: 0, MapCenterLongitude: 0 });
    await render(<WeatherWidget {...props} />);
    expect(await screen.findByTestId('weather-widget-missing_location')).toBeTruthy();
  });

  it('renders current conditions and the outlook for the department centre', async () => {
    globalThis.fetch = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(url).includes('/forecast?')
          ? { list: [{ dt: Math.floor(Date.now() / 1000), main: { temp: 50 }, weather: [{ main: 'Rain' }] }] }
          : { name: 'Denver', main: { temp: 61.2, humidity: 40 }, wind: { speed: 3 }, weather: [{ main: 'Clear', description: 'clear sky' }] },
    })) as unknown as typeof fetch;
    setConfig({ OpenWeatherApiKey: 'k', MapCenterLatitude: 39.7, MapCenterLongitude: -104.9 });
    await render(<WeatherWidget {...props} />);
    expect(await screen.findByTestId('weather-widget-temperature')).toHaveTextContent('61°F');
    expect(screen.getByText('widgets.weather · Denver')).toBeTruthy();
  });
});

describe('MapWidget', () => {
  it('draws the persisted department pins of the configured kinds and refreshes them', async () => {
    useMapMarkersStore.setState({
      markers: [
        { Id: 'c1', Type: 0, Latitude: 39.7, Longitude: -104.9 } as MapMakerInfoData,
        { Id: 'u1', Type: 1, Latitude: 39.71, Longitude: -104.91 } as MapMakerInfoData,
        { Id: 'p1', Type: 3, Latitude: 39.72, Longitude: -104.92 } as MapMakerInfoData,
      ],
      fetchedAt: { markers: Date.now() },
    });
    useWidgetSettingsStore.getState().updateSettings('map', { showPersonnel: false });
    await render(<MapWidget {...props} />);
    await waitFor(() => expect(screen.getByTestId('mock-map-pins')).toHaveTextContent('c1,u1'));
    expect(mocks.fetchMarkers).toHaveBeenCalled();
    // No app-level MapProvider: the widget provides one from the department config.
    expect(screen.getByTestId('mock-map-provider')).toBeTruthy();
  });

  it('draws the department layers that are on, an imported event layer included, with labels as configured', async () => {
    const waterPoints = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [3.7, 51.05] }, properties: { name: 'Water point' } }] };
    useCustomMapsStore.setState({
      activeLayers: [{ Id: 'E1', Name: 'City marathon', LayerSource: 'maplayer', Type: 0, Color: '#ff8800', IsSearchable: false, IsOnByDefault: true }],
      layerGeoJSON: { E1: waterPoints, L2: waterPoints },
    });
    await render(<MapWidget {...props} />);
    expect(screen.getByTestId('mock-dashboard-layer-E1')).toHaveTextContent('labels');
    expect(screen.queryByTestId('mock-dashboard-layer-L2')).toBeNull();
    expect(screen.getByTestId('mock-dashboard-offline-layers')).toBeTruthy();
    expect(mocks.fetchActiveLayers).toHaveBeenCalled();
    expect(mocks.fetchMapLayers).toHaveBeenCalled();
  });

  it('hides layer labels with the pin labels', async () => {
    useCustomMapsStore.setState({
      activeLayers: [{ Id: 'E1', Name: 'City marathon', LayerSource: 'maplayer', Type: 0, Color: '#ff8800', IsSearchable: false, IsOnByDefault: true }],
      layerGeoJSON: { E1: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [3.7, 51.05] }, properties: {} }] } },
    });
    useWidgetSettingsStore.getState().updateSettings('map', { hideLabels: true });
    await render(<MapWidget {...props} />);
    expect(screen.getByTestId('mock-dashboard-layer-E1')).toHaveTextContent('no-labels');
  });

  interface CameraJson {
    centerCoordinate: number[] | null;
    zoomLevel: number | null;
    bounds: { ne: number[]; sw: number[]; paddingTop?: number } | null;
    maxBounds: { ne: number[]; sw: number[] } | null;
  }

  const camera = (): CameraJson => JSON.parse(String(screen.getByTestId('mock-camera').props.children));

  it('fits the pins by default and leaves the camera free', async () => {
    await render(<MapWidget {...props} />);
    expect(camera()).toEqual({ centerCoordinate: null, zoomLevel: null, bounds: null, maxBounds: null });
    expect(screen.queryByTestId(/^mock-(custom-map|indoor-floor)-/)).toBeNull();
  });

  it('fits the pins again when the board comes back to fitting them from another view', async () => {
    // SAFETY: the @resgrid/maps mock in test-setup exports `mockFitPins`.
    const { mockFitPins } = jest.requireMock('@resgrid/maps') as { mockFitPins: jest.Mock };

    useMapMarkersStore.setState({ markers: [pin('c1', 0)], fetchedAt: { markers: Date.now() } });
    await render(<MapWidget {...props} />);
    expect(mockFitPins).toHaveBeenCalledTimes(1);

    await act(() => useWidgetSettingsStore.getState().updateSettings('map', { viewMode: 'fixed', latitude: 39.7, longitude: -104.9 }));
    await act(() => useWidgetSettingsStore.getState().updateSettings('map', { viewMode: 'fitPins' }));
    expect(mockFitPins).toHaveBeenCalledTimes(2);
  });

  it('closes a room’s card when the board shows another floor, and does not bring it back with the floor', async () => {
    useCustomMapsStore.setState(facilityMapsState());
    useWidgetSettingsStore.getState().updateSettings('map', { customMapId: 'bldg-a', customMapKind: 'indoor', customMapLayerId: 'floor-1', viewMode: 'customMap' });
    await render(<MapWidget {...props} />);
    await fireEvent.press(screen.getByTestId('mock-zone-control'));
    expect(screen.getByTestId('map-widget-facility-feature')).toBeTruthy();

    await act(() => useWidgetSettingsStore.getState().updateSettings('map', { customMapLayerId: 'floor-2' }));
    expect(screen.queryByTestId('map-widget-facility-feature')).toBeNull();
    await act(() => useWidgetSettingsStore.getState().updateSettings('map', { customMapLayerId: 'floor-1' }));
    expect(screen.getByTestId('mock-indoor-floor-floor-1')).toBeTruthy();
    expect(screen.queryByTestId('map-widget-facility-feature')).toBeNull();
  });

  it('draws the facility map the board is set to and frames its floor, locked when asked', async () => {
    useCustomMapsStore.setState(facilityMapsState());
    useWidgetSettingsStore.getState().updateSettings('map', { customMapId: 'bldg-a', customMapKind: 'indoor', customMapLayerId: 'floor-2', viewMode: 'customMap', hideLabels: true });
    await render(<MapWidget {...props} />);
    expect(screen.getByTestId('mock-indoor-floor-floor-2')).toHaveTextContent('no-labels');
    expect(screen.queryByTestId('mock-indoor-floor-floor-1')).toBeNull();
    // The upper floor is read for its rooms.
    expect(mocks.fetchIndoorFloor).toHaveBeenCalledWith('floor-2');
    expect(camera()).toMatchObject({ centerCoordinate: null, bounds: { ne: [-106.49, 35.01], sw: [-106.5, 35.0] }, maxBounds: null });

    await act(() => useWidgetSettingsStore.getState().updateSettings('map', { lockView: true }));
    const locked = camera().maxBounds;
    expect(locked?.sw[0]).toBeLessThan(-106.5);
    expect(locked?.ne[1]).toBeGreaterThan(35.01);
  });

  it('draws a custom map site plan under the pins while fitting the pins, and reads a map not on the device', async () => {
    useWidgetSettingsStore.getState().updateSettings('map', { customMapId: 'site', customMapKind: 'custom' });
    await render(<MapWidget {...props} />);
    expect(mocks.fetchCustomMap).toHaveBeenCalledWith('site');
    await act(() => useCustomMapsStore.setState(facilityMapsState()));
    expect(screen.getByTestId('mock-custom-map-site-base')).toHaveTextContent('pressable');
    expect(screen.getByTestId('mock-custom-map-site-evac')).toBeTruthy();
    expect(camera().bounds).toBeNull();
  });

  it('holds a fixed spot, kept there when the view is locked', async () => {
    useWidgetSettingsStore.getState().updateSettings('map', { viewMode: 'fixed', latitude: 35.005, longitude: -106.495, zoomLevel: 17, lockView: true });
    await render(<MapWidget {...props} />);
    const view = camera();
    expect(view).toMatchObject({ centerCoordinate: [-106.495, 35.005], zoomLevel: 17, bounds: null });
    expect(view.maxBounds?.sw[0]).toBeLessThan(-106.495);
    expect(view.maxBounds?.ne[0]).toBeGreaterThan(-106.495);
  });

  it('takes no taps on the facility map while the board is edited', async () => {
    useCustomMapsStore.setState(facilityMapsState());
    useWidgetSettingsStore.getState().updateSettings('map', { customMapId: 'site', customMapKind: 'custom', customMapLayerId: 'site-base' });
    await render(<MapWidget {...props} isEditMode={true} />);
    expect(screen.getByTestId('mock-custom-map-site-base')).toHaveTextContent('static');
    expect(screen.queryByTestId('mock-custom-map-site-evac')).toBeNull();
  });
});
