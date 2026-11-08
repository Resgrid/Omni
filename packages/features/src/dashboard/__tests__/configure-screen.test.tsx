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
