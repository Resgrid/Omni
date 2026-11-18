import '../../calls/__tests__/test-setup';

import { useRecurringCallAlertsStore, useRecurringCallsStore } from '@resgrid/data';
import { getCallFormHookPoints } from '@resgrid/features/calls';
import type { RecurringCallAlertResultData } from '@resgrid/models';
import { notificationSoundService } from '@resgrid/notifications';
import { emitRealtimeEvent } from '@resgrid/realtime';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { activateVariant, hidden, makeCall, setRights } from '../../calls/__tests__/test-utils';
import { RecurringCallAlertsBanner } from '../components/recurring-call-alerts-banner';
import { RecurringCallAlertsHost } from '../components/recurring-call-alerts-host';
import { RecurringCallNotice } from '../components/recurring-call-notice';
import { registerRecurringCallsHookPoints } from '../register';
import RecurringCallAlertsScreen from '../screens/recurring-call-alerts';

jest.mock('@resgrid/notifications', () => ({ notificationSoundService: { playForNotification: jest.fn(async () => undefined) } }));

const alert = (AlertId: string, overrides: Partial<RecurringCallAlertResultData> = {}): RecurringCallAlertResultData => ({
  AlertId,
  RecurringCallId: 4,
  ScheduleName: 'Transfers',
  DispatcherMode: false,
  ScheduleDeleted: false,
  Kind: 'Missed',
  KindId: 2,
  Reason: null,
  OccurrenceOn: '2026-11-18T13:00:00Z',
  OccurrenceOnLocal: '2026-11-18T08:00:00',
  CallId: null,
  CallNumber: null,
  CallState: null,
  CallDispatched: false,
  UnavailableUnits: [],
  UnavailablePeople: [],
  CreatedOn: '2026-11-18T13:05:00Z',
  AcknowledgedOn: null,
  AcknowledgedByUserId: null,
  AcknowledgedByName: null,
  IsOpen: true,
  ResolvedOn: null,
  Resolution: null,
  ResolvedByName: null,
  ResolutionNote: null,
  CanSend: true,
  CanAct: true,
  ...overrides,
});

const fetchAlerts = jest.fn(async () => undefined);
const acknowledgeAlert = jest.fn(async () => ({ ok: true, message: null, error: null }));
const dismissAlert = jest.fn(async () => ({ ok: true, message: null, error: null }));
const markAlertsSeen = jest.fn();
const disable = jest.fn();
const runOccurrenceAction = jest.fn(async () => ({ ok: true, outcome: 'Dispatched', callId: 60, callNumber: '26-60', callState: 0, error: null }));

beforeEach(() => {
  jest.clearAllMocks();
  activateVariant('dispatch');
  setRights({});
  useToastStore.setState({ toasts: [] });
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  useRecurringCallAlertsStore.setState({
    alerts: [
      alert('a1'),
      alert('a2', { Kind: 'NoResources', KindId: 3, Reason: 'NoneAvailable', CallId: 55, CallNumber: '26-55', CallState: 8, CanSend: false, UnavailableUnits: [{ Id: '7', Name: 'Medic 7' }] }),
      alert('a3', { Kind: 'DispatchDue', KindId: 5, AcknowledgedOn: '2026-11-18T13:06:00Z', AcknowledgedByName: 'Ann Lee', CanAct: false, CanSend: true }),
    ],
    newAlertIds: ['a2'],
    lastNewAt: 0,
    busyKey: null,
    unsupported: false,
    loading: {},
    errors: {},
    fetchedAt: { alerts: 1 },
    fetchAlerts,
    acknowledgeAlert,
    dismissAlert,
    markAlertsSeen,
    disable,
  });
  useRecurringCallsStore.setState({ busyKey: null, runOccurrenceAction, fetchRecurringCalls: jest.fn(async () => undefined), schedules: [], fetchedAt: {} });
});

afterEach(() => useToastStore.getState().clearToasts());

describe('RecurringCallAlertsScreen', () => {
  it('lists each alert with its kind, schedule, time, call, reason and the resources left off', async () => {
    const { unmount } = await render(<RecurringCallAlertsScreen />);

    expect(fetchAlerts).toHaveBeenCalledWith({ bypassCache: true });
    expect(screen.getByText('recurring_calls.alerts.kind_missed')).toBeTruthy();
    expect(screen.getByTestId('recurring-alert-a1-when')).toHaveTextContent(/^recurring_calls\.alerts\.occurrence_at:.*08:00$/);
    expect(screen.getByTestId('recurring-alert-a2-call')).toHaveTextContent('recurring_calls.alerts.call_held:26-55');
    expect(screen.getByTestId('recurring-alert-a2-reason')).toHaveTextContent('recurring_calls.alerts.reason_none_available');
    expect(screen.getByTestId('recurring-alert-a2-unavailable')).toHaveTextContent('recurring_calls.alerts.unavailable:Medic 7');
    expect(screen.getByTestId('recurring-alert-a2-new')).toBeTruthy();
    expect(screen.queryByTestId('recurring-alert-a1-new')).toBeNull();
    expect(screen.getByTestId('recurring-alert-a3-acknowledged')).toHaveTextContent('recurring_calls.alerts.acknowledged_by:Ann Lee');

    // Seen once the dispatcher leaves the list.
    await unmount();
    expect(markAlertsSeen).toHaveBeenCalled();
  });

  it('sends a missed occurrence now after asking, and reports it dispatched', async () => {
    await render(<RecurringCallAlertsScreen />);
    await fireEvent.press(screen.getByTestId('recurring-alert-a1-occurrence-dispatch'));
    await act(async () => fireEvent.press(screen.getByTestId('occurrence-send-confirm-confirm', hidden)));

    expect(runOccurrenceAction).toHaveBeenCalledWith('dispatch', { RecurringCallId: 4, OccurrenceOn: '2026-11-18T13:00:00Z' });
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'success', message: 'recurring_calls.occurrence.dispatched:26-60' });
  });

  it('creates the call or skips the occurrence without asking', async () => {
    await render(<RecurringCallAlertsScreen />);
    await act(async () => fireEvent.press(screen.getByTestId('recurring-alert-a1-occurrence-create')));
    expect(runOccurrenceAction).toHaveBeenCalledWith('create', { RecurringCallId: 4, OccurrenceOn: '2026-11-18T13:00:00Z' });
    await act(async () => fireEvent.press(screen.getByTestId('recurring-alert-a1-occurrence-skip')));
    expect(runOccurrenceAction).toHaveBeenCalledWith('skip', { RecurringCallId: 4, OccurrenceOn: '2026-11-18T13:00:00Z' });
  });

  it('acknowledges, dismisses with a note and opens the held call', async () => {
    await render(<RecurringCallAlertsScreen />);

    await act(async () => fireEvent.press(screen.getByTestId('recurring-alert-a2-acknowledge')));
    expect(acknowledgeAlert).toHaveBeenCalledWith('a2');
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'success', message: 'recurring_calls.alerts.acknowledge_success' });

    await fireEvent.press(screen.getByTestId('recurring-alert-a2-dismiss'));
    await fireEvent.changeText(screen.getByTestId('dismiss-alert-note', hidden), ' covered by mutual aid ');
    await act(async () => fireEvent.press(screen.getByTestId('dismiss-alert-dialog-confirm', hidden)));
    expect(dismissAlert).toHaveBeenCalledWith('a2', 'covered by mutual aid');

    // A held call has no occurrence to send: it is sent like any pending call.
    expect(screen.queryByTestId('recurring-alert-a2-occurrence-dispatch')).toBeNull();
    expect(screen.getByTestId('recurring-alert-a2-send-held')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('recurring-alert-a2-open-call'));
    expect(router.push).toHaveBeenCalledWith('/call/55');

    await fireEvent.press(screen.getByTestId('recurring-alert-a2-schedule'));
    expect(router.push).toHaveBeenCalledWith('/recurring-calls/4');
  });

  it('offers no actions without the right to act', async () => {
    await render(<RecurringCallAlertsScreen />);
    expect(screen.queryByTestId('recurring-alert-a3-occurrence-dispatch')).toBeNull();
    expect(screen.queryByTestId('recurring-alert-a3-dismiss')).toBeNull();
    expect(screen.queryByTestId('recurring-alert-a3-acknowledge')).toBeNull();
  });

  it('picks out the alert a push opened', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ alertId: 'a1' });
    await render(<RecurringCallAlertsScreen />);
    expect(screen.getByTestId('recurring-alert-a1-new')).toBeTruthy();
  });

  it('shows the empty state with a refresh', async () => {
    await act(() => {
      useRecurringCallAlertsStore.setState({ alerts: [] });
    });
    await render(<RecurringCallAlertsScreen />);
    expect(screen.getByText('recurring_calls.alerts.empty_title')).toBeTruthy();
  });
});

describe('banner, host and the call detail notice', () => {
  it('shows the banner while alerts are open, stronger with unseen ones, and opens the list', async () => {
    const { rerender } = await render(<RecurringCallAlertsBanner />);
    expect(screen.getByText('recurring_calls.alerts.banner:3')).toBeTruthy();
    expect(screen.getByTestId('recurring-call-alerts-banner-new')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('recurring-call-alerts-banner'));
    expect(router.push).toHaveBeenCalledWith('/recurring-call-alerts');

    await rerender(<RecurringCallAlertsBanner hidden />);
    expect(screen.queryByTestId('recurring-call-alerts-banner')).toBeNull();

    activateVariant('ic');
    await rerender(<RecurringCallAlertsBanner />);
    expect(screen.queryByTestId('recurring-call-alerts-banner')).toBeNull();
  });

  it('keeps the alerts live: loads them, reloads on the hub ping and announces new ones', async () => {
    await render(<RecurringCallAlertsHost />);
    expect(fetchAlerts).toHaveBeenCalledWith();

    await act(() => emitRealtimeEvent('recurringCallAlertsUpdated', '4', '{"alertId":"a9","kind":2,"raised":true}'));
    expect(fetchAlerts).toHaveBeenCalledWith({ bypassCache: true });

    await act(() => {
      useRecurringCallAlertsStore.setState({ lastNewAt: 1234, newAlertIds: ['a9', 'a2'] });
    });
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'warning', message: 'recurring_calls.alerts.new_toast:2' });
    expect(notificationSoundService.playForNotification).toHaveBeenCalledWith({ kind: 'recurringCallAlert' });
  });

  it('clears the alerts where the app has no recurring calls', async () => {
    activateVariant('responder');
    await render(<RecurringCallAlertsHost />);
    expect(disable).toHaveBeenCalled();
    expect(fetchAlerts).not.toHaveBeenCalled();
  });

  it('notes on a call which schedule created it, linking to it where the app has recurring calls', async () => {
    // SAFETY: the notice reads the schedule's id and name only.
    useRecurringCallsStore.setState({ schedules: [{ RecurringCallId: 4, Name: 'Transfers' } as never], fetchedAt: { list: 1 } });
    const { rerender } = await render(<RecurringCallNotice call={makeCall('55', { RecurringCallId: 4 })} />);
    expect(screen.getByText('recurring_calls.created_by_schedule:Transfers')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('recurring-call-notice-open'));
    expect(router.push).toHaveBeenCalledWith('/recurring-calls/4');

    activateVariant('responder');
    await rerender(<RecurringCallNotice call={makeCall('55', { RecurringCallId: 4 })} />);
    expect(screen.queryByTestId('recurring-call-notice-open')).toBeNull();
    expect(screen.getByTestId('recurring-call-notice')).toBeTruthy();

    await rerender(<RecurringCallNotice call={makeCall('56')} />);
    expect(screen.queryByTestId('recurring-call-notice')).toBeNull();
  });

  it('registers the notice with the call detail', () => {
    const unregister = registerRecurringCallsHookPoints();
    expect(getCallFormHookPoints().CallDetailNotice).toBe(RecurringCallNotice);
    unregister();
    expect(getCallFormHookPoints().CallDetailNotice).toBeUndefined();
  });
});
