import './test-setup';

import { emitRealtimeEvent } from '@resgrid/realtime';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import { useDashboardStore } from '../hooks/use-dashboard-store';
import { useDashboardViewStore } from '../hooks/use-dashboard-view-store';
import { dashboardNav } from '../nav';
import { dashboardRoutes, parseConfigureWidgetParam } from '../routes';
import DashboardScreen from '../screens/dashboard';
import { stubDataStores } from './fixtures';

let mocks: ReturnType<typeof stubDataStores>;

beforeEach(() => {
  mocks = stubDataStores();
  (router.push as jest.Mock).mockClear();
});

describe('DashboardScreen', () => {
  it('shows the empty board and adds a widget from the add menu', async () => {
    render(<DashboardScreen />);
    expect(screen.getByTestId('dashboard-empty')).toBeTruthy();

    fireEvent.press(screen.getByTestId('dashboard-empty-add'));
    expect(screen.getByTestId('dashboard-add-menu')).toBeTruthy();
    expect(screen.getAllByTestId(/^add-widget-/)).toHaveLength(14);

    fireEvent.press(screen.getByTestId('add-widget-time'));
    expect(await screen.findByTestId('time-widget')).toBeTruthy();
    expect(useDashboardStore.getState().widgets.map((widget) => widget.type)).toEqual(['time']);
    // A type already on the board is no longer offered.
    expect(screen.queryByTestId('add-widget-time')).toBeNull();
  });

  it('edit mode shows the grid info, remove and configure controls per widget', () => {
    useDashboardStore.setState({ widgets: [{ id: 'w1', type: 'time', x: 0, y: 0, w: 1, h: 1 }] });
    render(<DashboardScreen />);
    expect(screen.queryByTestId('time-widget-remove-button')).toBeNull();

    fireEvent.press(screen.getByTestId('dashboard-edit-button'));
    expect(useDashboardViewStore.getState().isEditMode).toBe(true);
    expect(screen.getByTestId('dashboard-grid-info')).toBeTruthy();
    expect(screen.getByTestId('dashboard-widget-time-resize-handle')).toBeTruthy();

    fireEvent.press(screen.getByTestId('time-widget-configure-button'));
    expect(router.push).toHaveBeenCalledWith('/configure?widget=time');

    fireEvent.press(screen.getByTestId('time-widget-remove-button'));
    expect(useDashboardStore.getState().widgets).toEqual([]);
    expect(screen.getByTestId('dashboard-empty')).toBeTruthy();
  });

  it('opens Configure from the toolbar (or the caller’s handler) and can hide the toolbar', () => {
    const { unmount } = render(<DashboardScreen />);
    fireEvent.press(screen.getByTestId('dashboard-configure-button'));
    expect(router.push).toHaveBeenCalledWith('/configure');
    unmount();

    const onOpenConfigure = jest.fn();
    render(<DashboardScreen showToolbar={false} onOpenConfigure={onOpenConfigure} />);
    expect(screen.queryByTestId('dashboard-toolbar')).toBeNull();
  });

  it('loads only the data the widgets on the board read', () => {
    useDashboardStore.setState({
      widgets: [
        { id: 'a', type: 'calls', x: 0, y: 0, w: 2, h: 2 },
        { id: 'b', type: 'units_summary', x: 2, y: 0, w: 1, h: 1 },
      ],
    });
    render(<DashboardScreen />);
    expect(mocks.fetchCalls).toHaveBeenCalled();
    expect(mocks.fetchCallPriorities).toHaveBeenCalled();
    expect(mocks.fetchUnitInfos).toHaveBeenCalled();
    expect(mocks.fetchPersonnel).not.toHaveBeenCalled();
    expect(mocks.fetchNotes).not.toHaveBeenCalled();
    expect(mocks.fetchAcknowledgements).not.toHaveBeenCalled();
  });

  it('refetches on id-only realtime pings, bypassing caches', async () => {
    useDashboardStore.setState({ widgets: [{ id: 'b', type: 'units_summary', x: 0, y: 0, w: 1, h: 1 }] });
    render(<DashboardScreen />);
    mocks.fetchUnitInfos.mockClear();
    act(() => emitRealtimeEvent('unitStatusUpdated', '12'));
    await waitFor(() => expect(mocks.fetchUnitInfos).toHaveBeenCalledWith({ bypassCache: true }));
  });
});

describe('routes and nav', () => {
  it('builds configure links only for known widget types', () => {
    expect(dashboardRoutes.home()).toBe('/home');
    expect(dashboardRoutes.configure()).toBe('/configure');
    expect(dashboardRoutes.configure('unit_alerts')).toBe('/configure?widget=unit_alerts');
    expect(() => dashboardRoutes.configure('../x' as never)).toThrow();
    expect(parseConfigureWidgetParam(['map'])).toBe('map');
    expect(parseConfigureWidgetParam('nope')).toBeNull();
    expect(dashboardNav.map((entry) => entry.href)).toEqual(['/home', '/configure']);
  });
});
