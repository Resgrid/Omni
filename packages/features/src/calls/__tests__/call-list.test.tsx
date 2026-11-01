import './test-setup';

import { useNetInfo } from '@react-native-community/netinfo';
import { buildNewCallInput } from '@resgrid/api';
import { useCallsStore } from '@resgrid/data';
import { emitRealtimeEvent } from '@resgrid/realtime';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import CallListScreen from '../screens/call-list';
import { activateVariant, makeCall, setRights } from './test-utils';

const mockFetchCalls = jest.fn(async () => undefined);
const mockFetchPending = jest.fn(async () => undefined);
const mockFetchScheduled = jest.fn(async () => undefined);

const request = { name: 'Queued fire', nature: 'Smoke', priority: 1, address: '9 Elm St' };

beforeEach(() => {
  jest.mocked(useNetInfo).mockReturnValue({ isConnected: true, isInternetReachable: true } as never);
  setRights({});
  useCallsStore.setState({
    calls: [makeCall('1', { Name: 'Server call' }), makeCall('2', { Name: 'Pending-state call', State: 8 })],
    pendingCalls: [makeCall('p1', { Name: 'Waiting call', State: 8 })],
    scheduledCalls: [makeCall('s1', { Name: 'Tomorrow call' })],
    queuedCalls: { 'local-1': { localId: 'local-1', request, input: buildNewCallInput(request), createdAt: Date.parse('2026-10-31T11:00:00Z'), state: 'queued' } },
    syncedCalls: {},
    callPriorities: [],
    loading: {},
    errors: {},
    fetchCalls: mockFetchCalls,
    fetchCallPriorities: jest.fn(async () => undefined),
    fetchPendingCalls: mockFetchPending,
    fetchScheduledCalls: mockFetchScheduled,
    fetchCallDispatches: jest.fn(async () => undefined),
  });
});

describe('CallListScreen', () => {
  it('lists queued offline calls first with the "Queued — not dispatched yet" badge, then active calls (never Pending)', () => {
    activateVariant('responder');
    render(<CallListScreen realtime={false} />);
    const rows = screen.getAllByTestId(/^call-card-(local-1|1)$/);
    expect(rows.map((row) => row.props.testID)).toEqual(['call-card-local-1', 'call-card-1']);
    expect(within(screen.getByTestId('call-card-local-1')).getByText('calls.queued.badge')).toBeTruthy();
    expect(screen.getByText('Server call')).toBeTruthy();
    expect(screen.queryByText('Pending-state call')).toBeNull();
  });

  it('shows the Pending and Scheduled tabs only with capabilities.calls.queues', () => {
    activateVariant('responder');
    const { unmount } = render(<CallListScreen realtime={false} />);
    expect(screen.queryByTestId('call-list-tabs')).toBeNull();
    expect(mockFetchPending).not.toHaveBeenCalled();
    unmount();

    activateVariant('dispatch');
    render(<CallListScreen realtime={false} />);
    expect(screen.getByTestId('call-list-tab-pending')).toBeTruthy();
    expect(mockFetchPending).toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('call-list-tab-pending'));
    expect(screen.getByText('Waiting call')).toBeTruthy();
    expect(screen.queryByText('Server call')).toBeNull();
    fireEvent.press(screen.getByTestId('call-list-tab-scheduled'));
    expect(screen.getByText('Tomorrow call')).toBeTruthy();
  });

  it('shows the offline banner with the queued count while offline', () => {
    activateVariant('unit');
    jest.mocked(useNetInfo).mockReturnValue({ isConnected: false, isInternetReachable: false } as never);
    render(<CallListScreen realtime={false} />);
    expect(screen.getByTestId('offline-call-banner')).toBeTruthy();
    expect(screen.getByText('calls.offline.list_banner_queued:1')).toBeTruthy();
  });

  it('opens a rejected queued call in the correction form and a server call in its detail', () => {
    activateVariant('responder');
    useCallsStore.setState((state) => ({ queuedCalls: { 'local-1': { ...state.queuedCalls['local-1'], state: 'rejected' } } }));
    render(<CallListScreen realtime={false} />);
    fireEvent.press(within(screen.getByTestId('call-list')).getAllByRole('button')[0]);
    expect(router.push).toHaveBeenCalledWith('/call/new?correct=local-1');
    fireEvent.press(screen.getByLabelText(/Server call/));
    expect(router.push).toHaveBeenCalledWith('/call/1');
  });

  it('hides "New call" without calls.create or without the CanCreateCalls right', () => {
    activateVariant('bigboard');
    const { unmount } = render(<CallListScreen realtime={false} />);
    expect(screen.queryByTestId('call-list-new')).toBeNull();
    unmount();

    activateVariant('responder');
    setRights({ CanCreateCalls: false });
    const second = render(<CallListScreen realtime={false} />);
    expect(screen.queryByTestId('call-list-new')).toBeNull();
    second.unmount();

    setRights({});
    render(<CallListScreen realtime={false} />);
    fireEvent.press(screen.getByTestId('call-list-new'));
    expect(router.push).toHaveBeenCalledWith('/call/new');
  });

  it('flags a synced queued call as a possible duplicate', () => {
    activateVariant('responder');
    useCallsStore.setState({ syncedCalls: { 'local-9': { localId: 'local-9', callId: '55', number: '26-55', syncedAt: Date.now(), possibleDuplicate: true, duplicateCallIds: ['44'], acknowledged: false } } });
    render(<CallListScreen realtime={false} />);
    expect(screen.getByTestId('possible-duplicate-local-9')).toBeTruthy();
    expect(screen.getByText('calls.queued.synced_with_number:26-55')).toBeTruthy();
    fireEvent.press(screen.getByText('calls.queued.view_duplicate'));
    expect(router.push).toHaveBeenCalledWith('/call/44');
    fireEvent.press(screen.getByTestId('dismiss-synced-local-9'));
    expect(screen.queryByTestId('possible-duplicate-local-9')).toBeNull();
  });

  it('filters by search text', () => {
    activateVariant('responder');
    render(<CallListScreen realtime={false} />);
    fireEvent.changeText(screen.getByTestId('call-filters-search'), 'server');
    expect(screen.getByText('Server call')).toBeTruthy();
    expect(screen.queryByText('Queued fire')).toBeNull();
  });

  it('refetches bypassing caches on a call push', async () => {
    activateVariant('responder');
    render(<CallListScreen />);
    mockFetchCalls.mockClear();
    await act(async () => {
      emitRealtimeEvent('callAdded', '77');
      await Promise.resolve();
    });
    expect(mockFetchCalls).toHaveBeenCalledWith({ bypassCache: true });
  });
});
