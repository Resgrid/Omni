import '../../calls/__tests__/test-setup';

import { featureFlagsStore } from '@resgrid/auth';
import { useNavigationEtaStore, useUnitsStore } from '@resgrid/data';
import type { MapMakerInfoData, UnitNavigationData } from '@resgrid/models';
import { emitRealtimeEvent, getRealtimeListenerCount } from '@resgrid/realtime';
import { act, render, renderHook, screen } from '@testing-library/react-native';
import React from 'react';

import { activateVariant } from '../../calls/__tests__/test-utils';
import { CallNavigationEtas, NavigationEtaChip, UnitNavigationEtaChip } from '../components/navigation-eta-chip';
import { getNavigationEtaSyncHolders, NAVIGATION_ETA_RESYNC_MS, NAVIGATION_ETA_TICK_MS, retainNavigationEtaSync, useIsNavigationEtaEnabled, useNavigationEtaPins, useNavigationEtaSync } from '../hooks/use-navigation-eta';
import { withNavigationEtaLabels } from '../lib/eta-pins';
import { navigationEtaParts, navigationEtaText } from '../lib/eta-text';

const T0 = Date.parse('2026-11-01T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
/** The calls test-setup's `t`: keys verbatim, interpolation values appended. */
const t = (key: string, options?: Record<string, unknown>) => (options && 'count' in options ? `${key}:${String(options.count)}` : key);

const nav = (UnitId: number, overrides: Partial<UnitNavigationData> = {}): UnitNavigationData => ({
  UnitId,
  CallId: 12,
  RouteInstanceId: null,
  RouteInstanceStopId: null,
  State: 1,
  EtaUtc: iso(T0 + 4 * 60_000),
  RemainingSeconds: 240,
  RemainingMeters: 3200,
  IsTrafficAware: true,
  Provider: 'valhalla',
  ReportedOn: iso(T0),
  IsStale: false,
  ...overrides,
});

const pin = (Id: string, Type: number, Title: string): MapMakerInfoData => ({ Id, Type, Title, Latitude: 39.5, Longitude: -119.8 }) as MapMakerInfoData;

const mocks = {
  fetchActiveNavigations: jest.fn(async () => undefined),
  handleUnitNavigationUpdated: jest.fn(() => null),
  requestRefresh: jest.fn(),
  cancelPendingRefresh: jest.fn(),
};

const setNavigations = (rows: UnitNavigationData[], serverClockOffsetMs = 0) => useNavigationEtaStore.setState({ navigations: Object.fromEntries(rows.map((row) => [String(row.UnitId), row])), serverClockOffsetMs });

const setFlag = (enabled: boolean) => featureFlagsStore.setState({ flags: enabled ? ({ 'Navigation.InApp': { enabled: true } } as never) : {}, isLoaded: true });

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(T0);
  jest.clearAllMocks();
  useNavigationEtaStore.setState({ navigations: {}, serverClockOffsetMs: 0, ...mocks });
  useUnitsStore.setState({ unitInfos: [] });
  setFlag(false);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ETA text', () => {
  it('reads "ETA n min · traffic", "Arriving" when due, and marks stale reports', () => {
    expect(navigationEtaText(t, { minutes: 4, isTrafficAware: true, isStale: false })).toBe('navigation_eta.minutes:4 · navigation_eta.traffic');
    expect(navigationEtaText(t, { minutes: 0, isTrafficAware: false, isStale: false })).toBe('navigation_eta.arriving');
    expect(navigationEtaParts(t, { minutes: 2, isTrafficAware: true, isStale: true })).toEqual(['navigation_eta.minutes:2', 'navigation_eta.traffic', 'navigation_eta.stale']);
    expect(navigationEtaText(t, { minutes: 2, isTrafficAware: true, isStale: true }, { traffic: false })).toBe('navigation_eta.minutes:2 · navigation_eta.stale');
  });
});

describe('map labels', () => {
  it('adds the ETA as a second label line to navigating unit pins only, keeping every other pin', () => {
    const call = pin('c12', 0, 'Fire');
    const engine = pin('u7', 1, 'Engine 7');
    const idle = pin('u8', 1, 'Engine 8');
    const pins = [call, engine, idle];
    const labelled = withNavigationEtaLabels(pins, (unitId) => (unitId === '7' ? 'ETA 4 min' : null));
    expect(labelled.map((entry) => entry.Title)).toEqual(['Fire', 'Engine 7\nETA 4 min', 'Engine 8']);
    expect(labelled[0]).toBe(call);
    expect(labelled[2]).toBe(idle);
    expect(engine.Title).toBe('Engine 7');
    // Nothing navigating: the same array (the pin layer is not rebuilt).
    expect(withNavigationEtaLabels(pins, () => null)).toBe(pins);
  });

  it('labels the pins from the store and counts down', async () => {
    const pins = [pin('u7', 1, 'Engine 7'), pin('c12', 0, 'Fire')];
    setNavigations([nav(7)]);
    const { result } = await renderHook(() => useNavigationEtaPins(pins));
    expect(result.current[0].Title).toBe('Engine 7\nnavigation_eta.minutes:4');
    expect(result.current[1]).toBe(pins[1]);

    await act(async () => {
      jest.advanceTimersByTime(NAVIGATION_ETA_TICK_MS * 7);
    });
    expect(result.current[0].Title).toBe('Engine 7\nnavigation_eta.minutes:3 · navigation_eta.stale');
  });

  it('hands back the same pins while no unit navigates', async () => {
    const pins = [pin('u7', 1, 'Engine 7')];
    const { result } = await renderHook(() => useNavigationEtaPins(pins));
    expect(result.current).toBe(pins);
  });
});

describe('ETA chips', () => {
  it('shows the ETA with traffic and greys it out after 60 s without a report', async () => {
    setNavigations([nav(7)]);
    await render(<UnitNavigationEtaChip unitId="7" />);
    expect(screen.getByTestId('navigation-eta-7')).toHaveTextContent('navigation_eta.minutes:4 · navigation_eta.traffic');

    await act(async () => {
      jest.advanceTimersByTime(NAVIGATION_ETA_TICK_MS * 3);
    });
    expect(screen.getByTestId('navigation-eta-7')).toHaveTextContent('navigation_eta.minutes:4 · navigation_eta.traffic');

    await act(async () => {
      jest.advanceTimersByTime(NAVIGATION_ETA_TICK_MS * 4);
    });
    expect(screen.getByTestId('navigation-eta-7-stale')).toHaveTextContent('navigation_eta.minutes:3 · navigation_eta.traffic · navigation_eta.stale');
    expect(screen.getByLabelText(/navigation_eta\.stale_hint/)).toBeOnTheScreen();
  });

  it('follows a new report at once, and goes away when the unit stops navigating', async () => {
    setNavigations([nav(7)]);
    await render(<UnitNavigationEtaChip unitId={7} testID="row-eta" />);
    await act(async () => {
      setNavigations([nav(7, { EtaUtc: iso(T0 + 90_000), IsTrafficAware: false })]);
    });
    expect(screen.getByTestId('row-eta')).toHaveTextContent('navigation_eta.minutes:2');
    await act(async () => {
      setNavigations([]);
    });
    expect(screen.queryByTestId('row-eta')).toBeNull();
  });

  it('renders nothing for a unit that is not navigating, or not to the asked call', async () => {
    setNavigations([nav(7, { CallId: 13 })]);
    await render(
      <>
        <UnitNavigationEtaChip unitId="8" />
        <UnitNavigationEtaChip unitId="7" callId="12" testID="other-call" />
        <UnitNavigationEtaChip unitId="7" callId={13} testID="this-call" />
      </>
    );
    expect(screen.queryByTestId('navigation-eta-8')).toBeNull();
    expect(screen.queryByTestId('other-call')).toBeNull();
    expect(screen.getByTestId('this-call')).toBeOnTheScreen();
  });

  it('shows "Arriving" once the ETA has passed', async () => {
    await render(<NavigationEtaChip eta={{ unitId: '7', callId: 12, remainingSeconds: -5, minutes: 0, etaAt: T0, isTrafficAware: false, isStale: false }} />);
    expect(screen.getByTestId('navigation-eta-7')).toHaveTextContent('navigation_eta.arriving');
  });

  it("lists a call's navigating units with their names from the dispatches, then the units list", async () => {
    useUnitsStore.setState({ unitInfos: [{ UnitId: '9', Name: 'Medic 9' }] as never });
    setNavigations([nav(7), nav(9), nav(11, { CallId: 30 })]);
    await render(<CallNavigationEtas callId="12" dispatches={[{ Id: '7', Type: 'Unit', Name: 'Engine 7' }] as never} />);
    expect(screen.getByTestId('call-navigation-etas-12')).toBeOnTheScreen();
    expect(screen.getByTestId('navigation-eta-7')).toHaveTextContent('Engine 7 · navigation_eta.minutes:4 · navigation_eta.traffic');
    expect(screen.getByTestId('navigation-eta-9')).toHaveTextContent('Medic 9 · navigation_eta.minutes:4 · navigation_eta.traffic');
    expect(screen.queryByTestId('navigation-eta-11')).toBeNull();
  });

  it('renders nothing for a call nobody navigates to', async () => {
    setNavigations([nav(7, { CallId: 30 })]);
    await render(<CallNavigationEtas callId="12" />);
    expect(screen.queryByTestId('call-navigation-etas-12')).toBeNull();
  });
});

describe('gating', () => {
  const enabledFor = async (variant: 'dispatch' | 'bigboard' | 'unit' | 'responder', flag: boolean): Promise<boolean> => {
    setFlag(flag);
    activateVariant(variant);
    const { result, unmount } = await renderHook(() => useIsNavigationEtaEnabled());
    const value = result.current;
    await unmount();
    return value;
  };

  it('shows ETAs only in apps with an ETA module (never by app id) and with Navigation.InApp', async () => {
    expect(await enabledFor('dispatch', true)).toBe(true);
    expect(await enabledFor('bigboard', true)).toBe(true);
    expect(await enabledFor('unit', true)).toBe(false);
    expect(await enabledFor('responder', true)).toBe(false);
    expect(await enabledFor('dispatch', false)).toBe(false);
  });
});

describe('store lifecycle', () => {
  it('loads once for every holder, forwards pushes and rejoins, and unsubscribes with the last holder', async () => {
    const baseline = getRealtimeListenerCount('unitNavigationUpdated');
    const releaseConsole = retainNavigationEtaSync();
    const releaseDetail = retainNavigationEtaSync();
    expect(getNavigationEtaSyncHolders()).toBe(2);
    expect(mocks.fetchActiveNavigations).toHaveBeenCalledTimes(1);
    expect(mocks.fetchActiveNavigations).toHaveBeenCalledWith({ bypassCache: true });
    expect(getRealtimeListenerCount('unitNavigationUpdated')).toBe(baseline + 1);

    emitRealtimeEvent('unitNavigationUpdated', '7', '{"unitId":7,"state":3}');
    expect(mocks.handleUnitNavigationUpdated).toHaveBeenCalledWith('7', '{"unitId":7,"state":3}');
    emitRealtimeEvent('eventingHubJoined', { hub: 'eventing', rejoin: true, at: T0 });
    expect(mocks.requestRefresh).toHaveBeenCalledTimes(1);

    releaseConsole();
    releaseConsole();
    expect(getNavigationEtaSyncHolders()).toBe(1);
    expect(getRealtimeListenerCount('unitNavigationUpdated')).toBe(baseline + 1);
    releaseDetail();
    expect(getNavigationEtaSyncHolders()).toBe(0);
    expect(getRealtimeListenerCount('unitNavigationUpdated')).toBe(baseline);
    expect(mocks.cancelPendingRefresh).toHaveBeenCalledTimes(1);

    emitRealtimeEvent('unitNavigationUpdated', '7', null);
    expect(mocks.handleUnitNavigationUpdated).toHaveBeenCalledTimes(1);
  });

  it('re-reads every minute while a unit is listed (Core expires a silent unit without a push), and stops with the last holder', async () => {
    const release = retainNavigationEtaSync();
    jest.advanceTimersByTime(NAVIGATION_ETA_RESYNC_MS);
    expect(mocks.requestRefresh).not.toHaveBeenCalled();

    setNavigations([nav(7)]);
    jest.advanceTimersByTime(NAVIGATION_ETA_RESYNC_MS);
    expect(mocks.requestRefresh).toHaveBeenCalledTimes(1);

    release();
    jest.advanceTimersByTime(NAVIGATION_ETA_RESYNC_MS * 3);
    expect(mocks.requestRefresh).toHaveBeenCalledTimes(1);
  });

  it('holds the sync while a screen that shows ETAs is mounted and enabled', async () => {
    const { rerender, unmount } = await renderHook(({ enabled }: { enabled: boolean }) => useNavigationEtaSync(enabled), { initialProps: { enabled: false } });
    expect(getNavigationEtaSyncHolders()).toBe(0);
    expect(mocks.fetchActiveNavigations).not.toHaveBeenCalled();
    await rerender({ enabled: true });
    expect(getNavigationEtaSyncHolders()).toBe(1);
    expect(mocks.fetchActiveNavigations).toHaveBeenCalledTimes(1);
    await unmount();
    expect(getNavigationEtaSyncHolders()).toBe(0);
  });
});
