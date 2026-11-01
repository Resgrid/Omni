import './test-setup';

import { usePersonnelStore } from '@resgrid/data';
import type { GroupResultData } from '@resgrid/models';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { useDashboardStore } from '../hooks/use-dashboard-store';
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
  it('opens on the ?widget= type and adds it to the board', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ widget: 'units' });
    render(<ConfigureDashboardScreen />);
    expect(screen.getByTestId('configure-units-content')).toBeTruthy();
    expect(screen.getByTestId('configure-not-on-board')).toBeTruthy();

    fireEvent.press(screen.getByTestId('configure-add-widget'));
    expect(useDashboardStore.getState().widgets.map((widget) => widget.type)).toEqual(['units']);
    expect(screen.getByTestId('configure-board-section')).toBeTruthy();
  });

  it('switches widget tabs, resizes, reorders and removes', () => {
    useDashboardStore.setState({
      widgets: [
        { id: 'a', type: 'calls', x: 0, y: 0, w: 2, h: 2 },
        { id: 'b', type: 'time', x: 2, y: 0, w: 1, h: 1 },
      ],
    });
    render(<ConfigureDashboardScreen />);
    // No param: the first widget on the board.
    expect(screen.getByTestId('configure-calls-content')).toBeTruthy();

    fireEvent.press(screen.getByTestId('configure-tab-time'));
    expect(screen.getByTestId('configure-time-content')).toBeTruthy();
    fireEvent.press(screen.getByTestId('configure-height-increase'));
    expect(useDashboardStore.getState().widgets[1]).toMatchObject({ id: 'b', h: 2 });
    fireEvent.press(screen.getByTestId('configure-width-increase'));
    expect(useDashboardStore.getState().widgets[1]).toMatchObject({ id: 'b', w: 2 });

    fireEvent.press(screen.getByTestId('configure-move-earlier'));
    expect(useDashboardStore.getState().widgets.map((widget) => widget.id)).toEqual(['b', 'a']);
    expect(useDashboardStore.getState().widgets[0]).toMatchObject({ x: 0, y: 0 });

    fireEvent.press(screen.getByTestId('configure-remove-widget'));
    expect(useDashboardStore.getState().widgets.map((widget) => widget.id)).toEqual(['a']);
    expect(screen.getByTestId('configure-add-widget')).toBeTruthy();
  });

  it('edits widget settings in place (switches, steppers, column order, choices)', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ widget: 'personnel' });
    usePersonnelStore.setState({ groups: [{ GroupId: '7', Name: 'Station 7' } as GroupResultData] });
    render(<ConfigureDashboardScreen />);

    fireEvent(screen.getByTestId('setting-personnel-showGroup'), 'valueChange', false);
    expect(useWidgetSettingsStore.getState().personnel.showGroup).toBe(false);

    fireEvent.press(screen.getByTestId('setting-personnel-fontSize-increase'));
    expect(useWidgetSettingsStore.getState().personnel.fontSize).toBe(15);

    fireEvent.press(screen.getByTestId('setting-personnel-columns-group-up'));
    expect(useWidgetSettingsStore.getState().personnel.columnOrder.slice(0, 2)).toEqual(['group', 'name']);

    fireEvent.press(screen.getByTestId('setting-personnel-hideGroups-option-7'));
    expect(useWidgetSettingsStore.getState().personnel.hideGroups).toEqual(['7']);

    fireEvent.press(screen.getByTestId('configure-tab-calls'));
    expect(screen.queryByTestId('setting-calls-showId')).toBeNull();
    fireEvent.press(screen.getByTestId('setting-calls-display-table'));
    expect(useWidgetSettingsStore.getState().calls.display).toBe('table');
    expect(screen.getByTestId('setting-calls-showId')).toBeTruthy();

    fireEvent.press(screen.getByTestId('configure-reset-settings'));
    expect(useWidgetSettingsStore.getState().calls.display).toBe('cards');
  });

  it('commits coordinates on blur and ignores out-of-range values', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ widget: 'weather' });
    render(<ConfigureDashboardScreen />);
    const latitude = screen.getByTestId('setting-weather-latitude');
    fireEvent.changeText(latitude, '39.74');
    fireEvent(latitude, 'blur');
    expect(useWidgetSettingsStore.getState().weather.latitude).toBe(39.74);
    fireEvent.changeText(latitude, '123');
    fireEvent(latitude, 'blur');
    expect(useWidgetSettingsStore.getState().weather.latitude).toBe(39.74);
    fireEvent.press(screen.getByTestId('setting-weather-units-metric'));
    expect(useWidgetSettingsStore.getState().weather.units).toBe('metric');
  });

  it('loads picker data for the scheduled-calls filters and explains the unit alerts tab', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ widget: 'scheduled_calls' });
    const { unmount } = render(<ConfigureDashboardScreen />);
    expect(mocks.fetchUnitInfos).toHaveBeenCalled();
    expect(mocks.fetchPersonnel).toHaveBeenCalled();
    expect(mocks.fetchRecipients).toHaveBeenCalled();
    expect(mocks.fetchGroups).toHaveBeenCalled();
    unmount();

    render(<ConfigureDashboardScreen initialWidget="unit_alerts" />);
    expect(screen.getByTestId('configure-unit-alerts-hint')).toBeTruthy();
    expect(screen.queryByTestId('configure-reset-settings')).toBeNull();
    fireEvent.press(screen.getByTestId('configure-done-button'));
    expect(router.back).toHaveBeenCalled();
  });
});
