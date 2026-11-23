import './test-setup';

import { useCustomMapsStore, usePersonnelStore } from '@resgrid/data';
import type { GroupResultData } from '@resgrid/models';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { facilityMapsState } from '../../map/__tests__/facility-fixtures';
import { useDashboardStore } from '../hooks/use-dashboard-store';
import { useMapWidgetViewStore } from '../hooks/use-map-widget-view-store';
import { useWidgetSettingsStore } from '../hooks/use-widget-settings-store';
import ConfigureDashboardScreen from '../screens/configure-dashboard';
import { stubDataStores } from './fixtures';

let mocks: ReturnType<typeof stubDataStores>;

beforeEach(() => {
  mocks = stubDataStores();
  (router.back as jest.Mock).mockClear();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
});

describe('ConfigureDashboardScreen', () => {
  it('opens on the ?widget= type and adds it to the board', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ widget: 'units' });
    await render(<ConfigureDashboardScreen />);
    expect(screen.getByTestId('configure-units-content')).toBeTruthy();
    expect(screen.getByTestId('configure-not-on-board')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('configure-add-widget'));
    expect(useDashboardStore.getState().widgets.map((widget) => widget.type)).toEqual(['units']);
    expect(screen.getByTestId('configure-board-section')).toBeTruthy();
  });

  it('switches widget tabs, resizes, reorders and removes', async () => {
    useDashboardStore.setState({
      widgets: [
        { id: 'a', type: 'calls', x: 0, y: 0, w: 2, h: 2 },
        { id: 'b', type: 'time', x: 2, y: 0, w: 1, h: 1 },
      ],
    });
    await render(<ConfigureDashboardScreen />);
    // No param: the first widget on the board.
    expect(screen.getByTestId('configure-calls-content')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('configure-tab-time'));
    expect(screen.getByTestId('configure-time-content')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('configure-height-increase'));
    expect(useDashboardStore.getState().widgets[1]).toMatchObject({ id: 'b', h: 2 });
    await fireEvent.press(screen.getByTestId('configure-width-increase'));
    expect(useDashboardStore.getState().widgets[1]).toMatchObject({ id: 'b', w: 2 });

    await fireEvent.press(screen.getByTestId('configure-move-earlier'));
    expect(useDashboardStore.getState().widgets.map((widget) => widget.id)).toEqual(['b', 'a']);
    expect(useDashboardStore.getState().widgets[0]).toMatchObject({ x: 0, y: 0 });

    await fireEvent.press(screen.getByTestId('configure-remove-widget'));
    expect(useDashboardStore.getState().widgets.map((widget) => widget.id)).toEqual(['a']);
    expect(screen.getByTestId('configure-add-widget')).toBeTruthy();
  });

  it('edits widget settings in place (switches, steppers, column order, choices)', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ widget: 'personnel' });
    usePersonnelStore.setState({ groups: [{ GroupId: '7', Name: 'Station 7' } as GroupResultData] });
    await render(<ConfigureDashboardScreen />);

    await fireEvent(screen.getByTestId('setting-personnel-showGroup'), 'valueChange', false);
    expect(useWidgetSettingsStore.getState().personnel.showGroup).toBe(false);

    await fireEvent.press(screen.getByTestId('setting-personnel-fontSize-increase'));
    expect(useWidgetSettingsStore.getState().personnel.fontSize).toBe(15);

    await fireEvent.press(screen.getByTestId('setting-personnel-columns-group-up'));
    expect(useWidgetSettingsStore.getState().personnel.columnOrder.slice(0, 2)).toEqual(['group', 'name']);

    await fireEvent.press(screen.getByTestId('setting-personnel-hideGroups-option-7'));
    expect(useWidgetSettingsStore.getState().personnel.hideGroups).toEqual(['7']);

    // The calls widget is a list only: every column, the order, scrolling and font size are always configurable.
    await fireEvent.press(screen.getByTestId('configure-tab-calls'));
    expect(screen.queryByTestId('setting-calls-display-cards')).toBeNull();

    for (const key of ['showId', 'showName', 'showAddress', 'showTimestamp', 'showPriority', 'showDispatched', 'scrollDispatches']) expect(screen.getByTestId(`setting-calls-${key}`)).toBeTruthy();
    await fireEvent(screen.getByTestId('setting-calls-showAddress'), 'valueChange', false);
    await fireEvent.press(screen.getByTestId('setting-calls-columns-name-up'));
    await fireEvent.press(screen.getByTestId('setting-calls-fontSize-decrease'));
    await fireEvent(screen.getByTestId('setting-calls-scrollDispatches'), 'valueChange', false);
    expect(useWidgetSettingsStore.getState().calls).toMatchObject({ showAddress: false, fontSize: 13, scrollDispatches: false });
    expect(useWidgetSettingsStore.getState().calls.columnOrder.slice(0, 2)).toEqual(['name', 'id']);

    await fireEvent.press(screen.getByTestId('configure-reset-settings'));
    expect(useWidgetSettingsStore.getState().calls).toMatchObject({ showAddress: true, fontSize: 14, scrollDispatches: true });
  });

  it('commits coordinates on blur and ignores out-of-range values', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ widget: 'weather' });
    await render(<ConfigureDashboardScreen />);
    const latitude = screen.getByTestId('setting-weather-latitude');
    await fireEvent.changeText(latitude, '39.74');
    await fireEvent(latitude, 'blur');
    expect(useWidgetSettingsStore.getState().weather.latitude).toBe(39.74);
    await fireEvent.changeText(latitude, '123');
    await fireEvent(latitude, 'blur');
    expect(useWidgetSettingsStore.getState().weather.latitude).toBe(39.74);
    await fireEvent.press(screen.getByTestId('setting-weather-units-metric'));
    expect(useWidgetSettingsStore.getState().weather.units).toBe('metric');
  });

  it('sets the map widget to a facility map and floor, frames it or holds a fixed spot', async () => {
    useCustomMapsStore.setState(facilityMapsState());
    useMapWidgetViewStore.setState({ lastView: null });
    jest.mocked(useLocalSearchParams).mockReturnValue({ widget: 'map' });
    await render(<ConfigureDashboardScreen />);
    expect(mocks.fetchCustomMaps).toHaveBeenCalled();
    expect(mocks.fetchIndoorMaps).toHaveBeenCalled();
    // Framing a facility map is offered once one is chosen; the fixed spot's fields only in that mode.
    expect(screen.queryByTestId('setting-map-viewMode-customMap')).toBeNull();
    expect(screen.queryByTestId('setting-map-latitude')).toBeNull();
    expect(screen.queryByTestId('setting-map-lockView')).toBeNull();

    await fireEvent.press(screen.getByTestId('setting-map-customMap-indoor:bldg-a'));
    expect(useWidgetSettingsStore.getState().map).toMatchObject({ customMapId: 'bldg-a', customMapKind: 'indoor', customMapLayerId: '' });
    expect(screen.getByTestId('setting-map-customMapLayer-floor-1').props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(screen.getByTestId('setting-map-customMapLayer-floor-2'));
    expect(useWidgetSettingsStore.getState().map.customMapLayerId).toBe('floor-2');

    await fireEvent.press(screen.getByTestId('setting-map-viewMode-customMap'));
    await fireEvent(screen.getByTestId('setting-map-lockView'), 'valueChange', true);
    expect(useWidgetSettingsStore.getState().map).toMatchObject({ viewMode: 'customMap', lockView: true });

    // A custom map offers every layer at once.
    await fireEvent.press(screen.getByTestId('setting-map-customMap-custom:site'));
    expect(screen.getByTestId('setting-map-customMapLayer-').props.accessibilityState).toEqual({ selected: true });

    // A fixed spot, taken from where someone last moved the board's map.
    await act(() => useMapWidgetViewStore.getState().setLastView({ latitude: 35.004, longitude: -106.497, zoom: 17.6 }));
    await fireEvent.press(screen.getByTestId('setting-map-viewMode-fixed'));
    await fireEvent.press(screen.getByTestId('setting-map-useCurrentView'));
    expect(useWidgetSettingsStore.getState().map).toMatchObject({ viewMode: 'fixed', latitude: 35.004, longitude: -106.497, zoomLevel: 18 });

    // No facility map: framing one is no longer a choice and the board fits its pins again.
    await fireEvent.press(screen.getByTestId('setting-map-viewMode-customMap'));
    await fireEvent.press(screen.getByTestId('setting-map-customMap-'));
    expect(useWidgetSettingsStore.getState().map).toMatchObject({ customMapId: '', viewMode: 'fitPins' });
    expect(screen.queryByTestId('setting-map-viewMode-customMap')).toBeNull();
  });

  it('says when the department has no facility maps', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ widget: 'map' });
    await render(<ConfigureDashboardScreen />);
    expect(screen.getByTestId('setting-map-no-facility-maps')).toBeTruthy();
  });

  it('loads picker data for the scheduled-calls filters and explains the unit alerts tab', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ widget: 'scheduled_calls' });
    const { unmount } = await render(<ConfigureDashboardScreen />);
    expect(mocks.fetchUnitInfos).toHaveBeenCalled();
    expect(mocks.fetchPersonnel).toHaveBeenCalled();
    expect(mocks.fetchRecipients).toHaveBeenCalled();
    expect(mocks.fetchGroups).toHaveBeenCalled();
    await unmount();

    await render(<ConfigureDashboardScreen initialWidget="unit_alerts" />);
    expect(screen.getByTestId('configure-unit-alerts-hint')).toBeTruthy();
    expect(screen.queryByTestId('configure-reset-settings')).toBeNull();
    await fireEvent.press(screen.getByTestId('configure-done-button'));
    expect(router.back).toHaveBeenCalled();
  });
});
