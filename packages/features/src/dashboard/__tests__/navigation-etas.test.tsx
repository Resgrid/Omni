import './test-setup';

import { featureFlagsStore } from '@resgrid/auth';
import { useCallsStore, useNavigationEtaStore, useUnitsStore } from '@resgrid/data';
import type { CallResultData, UnitInfoResultData, UnitNavigationData } from '@resgrid/models';
import { act, render, renderHook, screen, within } from '@testing-library/react-native';
import React from 'react';

import { CallsWidget } from '../components/widgets/calls-widget';
import { UnitsWidget } from '../components/widgets/units-widget';
import { useDashboardData } from '../hooks/use-dashboard-data';
import { dataSourcesFor } from '../lib/widget-types';
import { stubDataStores, utcAgo } from './fixtures';

/** Big Board shows the live ETAs of units navigating in the Unit app (MapLibre plan §9.4). */
const props = { isEditMode: false, width: 600, height: 400 };

const navigation = (UnitId: number, CallId: number, overrides: Partial<UnitNavigationData> = {}): UnitNavigationData => ({
  UnitId,
  CallId,
  RouteInstanceId: null,
  RouteInstanceStopId: null,
  State: 1,
  EtaUtc: new Date(Date.now() + 5 * 60_000).toISOString(),
  RemainingSeconds: 300,
  RemainingMeters: 4000,
  IsTrafficAware: true,
  Provider: 'valhalla',
  ReportedOn: new Date().toISOString(),
  IsStale: false,
  ...overrides,
});

const unit = (UnitId: string, Name: string): UnitInfoResultData => ({ UnitId, Name, GroupName: 'Station 1', Type: 'Engine', CurrentStatus: 'Responding', CurrentStatusColor: '#00aa00' }) as UnitInfoResultData;
const call = (CallId: string): CallResultData => ({ CallId, Number: CallId, Name: `Call ${CallId}`, Address: '1 Main St', Priority: 1, State: 0, LoggedOnUtc: utcAgo(300) }) as CallResultData;

const fetchActiveNavigations = jest.fn(async () => undefined);

beforeEach(() => {
  stubDataStores();
  fetchActiveNavigations.mockClear();
  useNavigationEtaStore.setState({ navigations: { '7': navigation(7, 1) }, serverClockOffsetMs: 0, fetchActiveNavigations });
});

// Still mounted here (RNTL unmounts after): reset inside act.
afterEach(async () => {
  await act(() => {
    featureFlagsStore.setState({ flags: {} });
    useNavigationEtaStore.setState(useNavigationEtaStore.getInitialState());
  });
});

describe('Big Board live ETAs', () => {
  it('needs the navigations for the units, calls and map widgets only', () => {
    expect(dataSourcesFor(['units']).has('navigations')).toBe(true);
    expect(dataSourcesFor(['calls']).has('navigations')).toBe(true);
    expect(dataSourcesFor(['map']).has('navigations')).toBe(true);
    expect(dataSourcesFor(['personnel', 'units_summary', 'calls_summary', 'unit_alerts']).has('navigations')).toBe(false);
  });

  it('keeps the ETAs live for those widgets when the department has Navigation.InApp', async () => {
    const off = await renderHook(() => useDashboardData(['map']));
    expect(fetchActiveNavigations).not.toHaveBeenCalled();
    await off.unmount();

    featureFlagsStore.setState({ flags: { 'Navigation.InApp': { enabled: true } } as never, isLoaded: true });
    const notes = await renderHook(() => useDashboardData(['notes']));
    expect(fetchActiveNavigations).not.toHaveBeenCalled();
    await notes.unmount();

    await renderHook(() => useDashboardData(['map', 'units']));
    expect(fetchActiveNavigations).toHaveBeenCalledTimes(1);
    expect(fetchActiveNavigations).toHaveBeenCalledWith({ bypassCache: true });
  });

  it('shows the ETA under a navigating unit in the units widget', async () => {
    useUnitsStore.setState({ unitInfos: [unit('7', 'Engine 7'), unit('8', 'Engine 8')] });
    await render(<UnitsWidget {...props} />);
    expect(screen.getByTestId('units-widget-eta-7')).toHaveTextContent('navigation_eta.minutes:5 · navigation_eta.traffic');
    expect(screen.queryByTestId('units-widget-eta-8')).toBeNull();
  });

  it("shows a call's responding units with their ETAs under its dispatches in the calls list", async () => {
    useCallsStore.setState({ calls: [call('1'), call('2')], callDispatches: { '1': [{ Id: '7', Type: 'Unit', Name: 'Engine 7' } as never] } });
    await render(<CallsWidget {...props} />);
    expect(within(screen.getByTestId('calls-widget-etas-1')).getByTestId('navigation-eta-7')).toHaveTextContent('Engine 7 · navigation_eta.minutes:5 · navigation_eta.traffic');
    expect(screen.queryByTestId('calls-widget-etas-2')).toBeNull();
  });

  it('greys out an ETA whose unit stopped reporting', async () => {
    useNavigationEtaStore.setState({ navigations: { '7': navigation(7, 1, { IsStale: true }) } });
    useUnitsStore.setState({ unitInfos: [unit('7', 'Engine 7')] });
    await render(<UnitsWidget {...props} />);
    expect(screen.getByTestId('units-widget-eta-7-stale')).toHaveTextContent('navigation_eta.minutes:5 · navigation_eta.traffic · navigation_eta.stale');
  });
});
