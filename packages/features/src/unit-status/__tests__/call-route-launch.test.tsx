import './test-setup';

import { parseVariantManifest, resetActiveVariantForTests, setActiveVariant } from '@resgrid/config';
import { RouteInstanceStatus, type StartCallRouteResult, useCallDetailStore, useCallsStore, useRoutesStore, useUnitRolesStore, useUnitsStore, useUnitStatusStore } from '@resgrid/data';
import { NavigationHandoffProvider } from '@resgrid/features/contacts';
import { resetActiveCallEventsForTests, StatusProvider, useStatusContext } from '@resgrid/features/status';
import { CallResultData, type RouteInstanceResultData, type StatusesResultData, UnitResultData, UnitTypeStatusResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React, { useState } from 'react';

import responderManifest from '../../../../../apps/omni/variants/responder/variant.json';
import { ActiveCallCard } from '../components/active-call-card';
import { CallRouteDetailAction } from '../components/call-route-actions';
import { CallRouteLauncher } from '../components/call-route-launcher';
import { SetActiveCallButton } from '../components/set-active-call-button';
import { isCallRouteLaunching, requestCallRouteLaunch, resetCallRouteLaunchForTests, runScreenPath, useCallRouteLaunchStore } from '../lib/call-route-launch';
import { activateUnitVariant, hidden } from './test-helpers';

// In-app navigation availability (maps routing context + Navigation.InApp flag), switched per test.
const mockInAppNavigation = { available: true };

jest.mock('@resgrid/features/navigation/hooks/use-in-app-navigation', () => ({ useInAppNavigationAvailable: () => mockInAppNavigation.available }));

/**
 * A call's pre-defined route on the Unit (Core M0322): making a call with a route the active call — from the picker, the
 * status sheet or "Set Active" (once its sheet closes) — or tapping its Route action starts the unit's run and opens in-app
 * navigation through its stops (else the running route screen); a run of another route asks to end, cancel or keep it.
 */
const makeCall = (CallId: string, overrides: Partial<CallResultData> = {}): CallResultData =>
  Object.assign(new CallResultData(), { CallId, Priority: 1, Name: `Call ${CallId}`, Number: `C-${CallId}`, State: 0, Type: 'Fire', LoggedOnUtc: '2026-11-19T10:00:00Z', ...overrides });

const ROUTED = makeCall('8', { RoutePlanId: 'p1', RoutePlanName: 'Transfer run' });
const PLAIN = makeCall('9');

const run = (overrides: Partial<RouteInstanceResultData> = {}): RouteInstanceResultData => ({
  RouteInstanceId: 'ri-8',
  RoutePlanId: 'p1',
  RoutePlanName: 'Transfer run',
  UnitId: 10,
  Status: RouteInstanceStatus.InProgress,
  ActualStartOn: '2026-11-19T10:00:00Z',
  ActualEndOn: null,
  StopsCompleted: 0,
  StopsTotal: 3,
  TotalDistanceMeters: null,
  TotalDurationSeconds: null,
  Notes: null,
  AddedOn: '2026-11-19T10:00:00Z',
  CallId: 8,
  StartReachedOn: null,
  ...overrides,
});

const option = (Id: number, Text: string, extra: Partial<StatusesResultData> = {}): StatusesResultData => ({
  Id,
  Type: 0,
  StateId: 0,
  Text,
  BColor: '#22c55e',
  Color: '#ffffff',
  Gps: false,
  Note: 0,
  Detail: 0,
  ...extra,
});

const started = (instance: RouteInstanceResultData): StartCallRouteResult => ({ status: 'started', instance });

const startCallRoute = jest.fn(async (): Promise<StartCallRouteResult> => started(run()));
const fetchActiveRoute = jest.fn(async () => undefined);
const resumeRouteInstance = jest.fn(async () => true);
const endRouteInstance = jest.fn(async () => true);
const cancelRouteInstance = jest.fn(async () => true);
const saveUnitStatus = jest.fn(async () => ({ outcome: 'sent' as const, id: 'evt-1' }));

/** The shell's active call, held in state as the app shell holds it. */
const Shell: React.FC<{ activeCallId?: string | null; unitId?: string; children?: React.ReactNode }> = ({ activeCallId: initial = null, unitId = '10', children }) => {
  const [activeCallId, setActiveCallId] = useState<string | null>(initial);

  return (
    <NavigationHandoffProvider value={{ navigateTo: jest.fn(async () => true) }}>
      <StatusProvider activeUnitId={unitId} activeCallId={activeCallId} onActiveCallChange={setActiveCallId}>
        <CallRouteLauncher />
        {children}
      </StatusProvider>
    </NavigationHandoffProvider>
  );
};

/** The console's active call card, bound to the shell's active call. */
const Card: React.FC = () => {
  const { activeCallId, onActiveCallChange } = useStatusContext();

  return <ActiveCallCard activeCallId={activeCallId} onSelectCall={onActiveCallChange} />;
};

beforeEach(() => {
  activateUnitVariant();
  resetActiveCallEventsForTests();
  resetCallRouteLaunchForTests();
  mockInAppNavigation.available = true;
  [startCallRoute, fetchActiveRoute, resumeRouteInstance, endRouteInstance, cancelRouteInstance, saveUnitStatus].forEach((fn) => fn.mockClear());
  startCallRoute.mockImplementation(async () => started(run()));
  jest.mocked(router.push).mockClear();
  useToastStore.getState().clearToasts();
  useCallsStore.setState({ calls: [ROUTED, PLAIN], callPriorities: [], callDispatches: {}, loading: {}, errors: {}, fetchCalls: jest.fn(async () => undefined), fetchCallDispatches: jest.fn(async () => undefined) });
  useCallDetailStore.setState({ details: {}, loading: {}, errors: {}, fetchCallDetail: jest.fn(async () => undefined) });
  useRoutesStore.setState({ activeInstance: null, instanceStops: [], callRoutePlans: [], actionError: null, startCallRoute, fetchActiveRoute, resumeRouteInstance, endRouteInstance, cancelRouteInstance });
  useUnitsStore.setState({
    units: [Object.assign(new UnitResultData(), { UnitId: '10', Name: 'Engine 10', Type: 'Engine', CustomStatusSetId: '5' })],
    unitInfos: [],
    unitTypeStatuses: [
      Object.assign(new UnitTypeStatusResultData(), { UnitType: 'Engine', StatusId: '5', Statuses: [option(31, 'Responding', { BaseType: 1, Detail: 3, Note: 0 }), option(32, 'On scene', { BaseType: 3, Note: 0 })] }),
    ],
    fetchUnits: jest.fn(async () => undefined),
    fetchUnitInfos: jest.fn(async () => undefined),
  });
  useUnitStatusStore.setState({
    currentStatusByUnit: {},
    queuedStatuses: {},
    destinationsByUnit: { '10': { calls: [ROUTED, PLAIN], stations: [], pois: [], poiTypes: [], statuses: [], fetchedAt: Date.now() } },
    fetchCurrentStatus: jest.fn(async () => undefined),
    fetchDestinationData: jest.fn(async () => undefined),
    saveUnitStatus,
  });
  useUnitRolesStore.setState({ assignmentsByUnit: { '10': [] }, fetchAllForUnit: jest.fn(async () => undefined) });
});

describe('picking a call with a route as the active call', () => {
  it('starts the unit’s run and opens in-app navigation through its stops', async () => {
    await render(
      <Shell activeCallId="9">
        <Card />
      </Shell>
    );
    // The unit's running route is picked up again at start.
    expect(fetchActiveRoute).toHaveBeenCalledWith('10');

    await fireEvent.press(screen.getByTestId('unit-active-call-change'));
    await fireEvent.press(screen.getByTestId('active-call-sheet-call-8', hidden));

    await waitFor(() => expect(startCallRoute).toHaveBeenCalledWith('8', '10'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/navigate?instanceId=ri-8'));
  });

  it('opens the running route screen where the app cannot navigate in-app', async () => {
    mockInAppNavigation.available = false;
    await render(
      <Shell activeCallId="9">
        <Card />
      </Shell>
    );

    await fireEvent.press(screen.getByTestId('unit-active-call-change'));
    await fireEvent.press(screen.getByTestId('active-call-sheet-call-8', hidden));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/routes/active?planId=p1&instanceId=ri-8'));
  });

  it('does nothing for a call without a route', async () => {
    await render(
      <Shell activeCallId="8">
        <Card />
      </Shell>
    );

    await fireEvent.press(screen.getByTestId('unit-active-call-change'));
    await fireEvent.press(screen.getByTestId('active-call-sheet-call-9', hidden));
    await act(async () => undefined);
    expect(startCallRoute).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('resumes a paused run of the call before navigating', async () => {
    startCallRoute.mockImplementation(async () => started(run({ Status: RouteInstanceStatus.Paused })));
    await render(<Shell />);

    await act(async () => requestCallRouteLaunch('8'));
    await waitFor(() => expect(resumeRouteInstance).toHaveBeenCalledWith('ri-8'));
    expect(router.push).toHaveBeenCalledWith('/navigate?instanceId=ri-8');
  });

  it('opens a run the device already knows when the server cannot be reached, else says why', async () => {
    // SAFETY: errors and stop rows with only the fields the launcher and the card read.
    startCallRoute.mockImplementation(async () => ({ status: 'failed', error: { code: 'network', messageKey: 'errors.data.network' } as never }));
    await render(<Shell />);

    await act(async () => requestCallRouteLaunch('8'));
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ type: 'error', message: 'errors.data.network' }));
    expect(router.push).not.toHaveBeenCalled();

    useRoutesStore.setState({ activeInstance: run() });
    await act(async () => requestCallRouteLaunch('8'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/navigate?instanceId=ri-8'));
  });

  it('opens nothing for a unit the crew changed from while the route was starting', async () => {
    let answer: ((result: StartCallRouteResult) => void) | undefined;
    startCallRoute.mockImplementationOnce(
      () =>
        new Promise<StartCallRouteResult>((resolve) => {
          answer = resolve;
        })
    );
    const { rerender } = await render(<Shell />);

    await act(async () => requestCallRouteLaunch('8'));
    await waitFor(() => expect(startCallRoute).toHaveBeenCalledWith('8', '10'));
    await rerender(<Shell unitId="11" />);
    await act(async () => answer?.(started(run())));

    expect(router.push).not.toHaveBeenCalled();
    expect(useCallRouteLaunchStore.getState().launchingCallIds).toEqual([]);
  });

  it('keeps each call busy until its own launch finishes', async () => {
    const answers = new Map<string, () => void>();
    startCallRoute.mockImplementation(
      // SAFETY: the mock receives the store action's arguments; only the call id is read.
      ((callId: string) =>
        new Promise<StartCallRouteResult>((resolve) => {
          answers.set(callId, () => resolve(started(run({ RouteInstanceId: `ri-${callId}`, CallId: Number(callId) }))));
        })) as never
    );
    const OTHER = makeCall('12', { RoutePlanId: 'p2', RoutePlanName: 'Second run' });
    useCallsStore.setState({ calls: [ROUTED, PLAIN, OTHER] });
    await render(<Shell />);

    await act(async () => requestCallRouteLaunch('8'));
    await act(async () => requestCallRouteLaunch('12'));
    await waitFor(() => expect(startCallRoute).toHaveBeenCalledTimes(2));
    // A second ask for call 8 while its launch is under way starts nothing.
    await act(async () => requestCallRouteLaunch('8'));
    expect(startCallRoute).toHaveBeenCalledTimes(2);

    await act(async () => answers.get('12')?.());
    await waitFor(() => expect(isCallRouteLaunching(useCallRouteLaunchStore.getState(), '12')).toBe(false));
    expect(isCallRouteLaunching(useCallRouteLaunchStore.getState(), '8')).toBe(true);

    await act(async () => answers.get('8')?.());
    await waitFor(() => expect(useCallRouteLaunchStore.getState().launchingCallIds).toEqual([]));
  });

  it('is inert where the device does not report status for a unit', async () => {
    resetActiveVariantForTests();
    setActiveVariant(parseVariantManifest(responderManifest));
    await render(<Shell />);

    await act(async () => requestCallRouteLaunch('8'));
    expect(startCallRoute).not.toHaveBeenCalled();
    expect(fetchActiveRoute).not.toHaveBeenCalled();
  });
});

describe('the unit runs another route (409 route_in_progress)', () => {
  beforeEach(() => {
    // SAFETY: errors and stop rows with only the fields the launcher and the card read.
    startCallRoute.mockImplementationOnce(async () => ({ status: 'route_in_progress', existingInstanceId: 'ri-old', error: { code: 'conflict', messageKey: 'errors.data.conflict' } as never }));
    fetchActiveRoute.mockImplementation(async () => {
      useRoutesStore.setState({ activeInstance: run({ RouteInstanceId: 'ri-old', RoutePlanName: 'Hydrant loop', CallId: null }) });
    });
  });

  afterEach(() => fetchActiveRoute.mockImplementation(async () => undefined));

  it('ends the other route and starts the call’s', async () => {
    await render(<Shell />);
    await act(async () => requestCallRouteLaunch('8'));

    await waitFor(() => expect(screen.getByTestId('call-route-conflict-message', hidden)).toHaveTextContent('unit_status.route.conflict_message:Hydrant loop'));
    await fireEvent.press(screen.getByTestId('call-route-conflict-end', hidden));

    await waitFor(() => expect(endRouteInstance).toHaveBeenCalledWith('ri-old'));
    await waitFor(() => expect(startCallRoute).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/navigate?instanceId=ri-8'));
    expect(cancelRouteInstance).not.toHaveBeenCalled();
  });

  it('cancels the other route and starts the call’s', async () => {
    await render(<Shell />);
    await act(async () => requestCallRouteLaunch('8'));

    await waitFor(() => expect(screen.getByTestId('call-route-conflict-cancel', hidden)).toBeTruthy());
    await fireEvent.press(screen.getByTestId('call-route-conflict-cancel', hidden));
    await waitFor(() => expect(cancelRouteInstance).toHaveBeenCalledWith('ri-old'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/navigate?instanceId=ri-8'));
  });

  it('drops the conflict when another unit is chosen, never ending the first unit’s route', async () => {
    const { rerender } = await render(<Shell />);
    await act(async () => requestCallRouteLaunch('8'));
    await waitFor(() => expect(useCallRouteLaunchStore.getState().conflict).toMatchObject({ callId: '8', unitId: '10', existingInstanceId: 'ri-old' }));

    await rerender(<Shell unitId="11" />);
    await waitFor(() => expect(useCallRouteLaunchStore.getState().conflict).toBeNull());
    expect(endRouteInstance).not.toHaveBeenCalled();
    expect(cancelRouteInstance).not.toHaveBeenCalled();
  });

  it('keeps the current route', async () => {
    await render(<Shell />);
    await act(async () => requestCallRouteLaunch('8'));

    await waitFor(() => expect(screen.getByTestId('call-route-conflict-keep', hidden)).toBeTruthy());
    await fireEvent.press(screen.getByTestId('call-route-conflict-keep', hidden));
    expect(endRouteInstance).not.toHaveBeenCalled();
    expect(cancelRouteInstance).not.toHaveBeenCalled();
    expect(startCallRoute).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('a status sheet that changes the active call', () => {
  it('Set Active starts the route only once its status sheet closes', async () => {
    await render(
      <Shell activeCallId="9">
        <SetActiveCallButton call={ROUTED} />
      </Shell>
    );

    await fireEvent.press(screen.getByTestId('call-detail-set-active'));
    await act(async () => undefined);
    expect(startCallRoute).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('unit-status-sheet-cancel', hidden));
    await waitFor(() => expect(startCallRoute).toHaveBeenCalledWith('8', '10'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/navigate?instanceId=ri-8'));
  });
});

describe('the route on the active call card and the call detail', () => {
  it('offers Start route with the route’s name and preview, then Continue route with the run’s progress', async () => {
    await render(
      <Shell activeCallId="8">
        <Card />
        <CallRouteDetailAction call={ROUTED} />
      </Shell>
    );

    expect(screen.getByTestId('unit-active-call-route').props.accessibilityLabel).toBe('unit_status.route.start');
    expect(screen.getByTestId('unit-active-call-route-strip-name')).toHaveTextContent('unit_status.route.name:Transfer run');
    expect(screen.getByTestId('call-detail-route-run')).toHaveTextContent('unit_status.route.start');

    // SAFETY: errors and stop rows with only the fields the launcher and the card read.
    await act(async () => useRoutesStore.setState({ activeInstance: run({ StopsCompleted: 1 }), instanceStops: [{ Status: 2 }, { Status: 0 }, { Status: 0 }] as never }));
    expect(screen.getByTestId('unit-active-call-route').props.accessibilityLabel).toBe('unit_status.route.continue');
    expect(screen.getByTestId('unit-active-call-route-strip-progress')).toHaveTextContent('unit_routes.stops_done:1,3');
    expect(screen.getByTestId('call-detail-route-progress')).toHaveTextContent('unit_routes.stops_done:1,3');

    await fireEvent.press(screen.getByTestId('unit-active-call-route-strip-preview'));
    expect(router.push).toHaveBeenCalledWith('/route-plans/p1');

    await fireEvent.press(screen.getByTestId('unit-active-call-route'));
    await waitFor(() => expect(startCallRoute).toHaveBeenCalledWith('8', '10'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/navigate?instanceId=ri-8'));
  });

  it('shows the detail action only for the active call, and nothing for a call without a route', async () => {
    await render(
      <Shell activeCallId="9">
        <CallRouteDetailAction call={ROUTED} />
        <Card />
      </Shell>
    );

    expect(screen.queryByTestId('call-detail-route')).toBeNull();
    expect(screen.queryByTestId('unit-active-call-route')).toBeNull();
    expect(screen.queryByTestId('unit-active-call-route-strip')).toBeNull();
  });
});

describe('runScreenPath', () => {
  it('opens in-app navigation where available, else the running route screen', () => {
    expect(runScreenPath(run(), true)).toBe('/navigate?instanceId=ri-8');
    expect(runScreenPath(run(), false)).toBe('/routes/active?planId=p1&instanceId=ri-8');
  });
});
