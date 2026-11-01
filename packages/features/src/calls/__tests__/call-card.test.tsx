import './test-setup';

import type { CallListItem } from '@resgrid/data';
import type { DispatchedEventResultData } from '@resgrid/models';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { CallCard } from '../components/call-card';
import { makeCall } from './test-utils';

const NOW = Date.parse('2026-10-31T12:00:00Z');
const dispatches = [
  { Id: '7', Type: 'Unit', Name: 'Engine 7', GroupId: '', Group: '', Note: '', StatusId: 0, Location: '', StatusText: '', StatusColor: '', Timestamp: '' },
  { Id: 'u1', Type: 'User', Name: 'Pat Smith', GroupId: '', Group: '', Note: '', StatusId: 0, Location: '', StatusText: '', StatusColor: '', Timestamp: '' },
] as DispatchedEventResultData[];

describe('CallCard', () => {
  it('comfortable: number, name, address, plain-text nature, dispatch ticker and time ago', () => {
    render(<CallCard call={makeCall('1', { Nature: '<p>Smoke <b>showing</b></p><script>x()</script>' })} priorityColor="#DC2626" dispatches={dispatches} now={NOW} />);
    expect(screen.getByText('#C-1')).toBeTruthy();
    expect(screen.getByText('Call 1')).toBeTruthy();
    expect(screen.getByText('1 Main St')).toBeTruthy();
    expect(screen.getByText(/Smoke\s+showing/)).toBeTruthy();
    expect(screen.queryByText(/x\(\)/)).toBeNull();
    expect(screen.getByTestId('call-card-1-ticker')).toBeTruthy();
    expect(screen.getByText('calls.time.hours_ago:1')).toBeTruthy();
    // List rows never render server HTML in a WebView.
    expect(screen.queryByTestId('native-webview')).toBeNull();
  });

  it('compact: one dense row without nature or ticker', () => {
    render(<CallCard call={makeCall('2')} density="compact" dispatches={dispatches} now={NOW} />);
    expect(screen.getByText('Call 2')).toBeTruthy();
    expect(screen.queryByText(/Smoke/)).toBeNull();
    expect(screen.queryByTestId('call-card-2-ticker')).toBeNull();
  });

  it('wall: large board row with the ticker and no nature', () => {
    render(<CallCard call={makeCall('3')} density="wall" dispatches={dispatches} now={NOW} />);
    expect(screen.getByText('#C-3')).toBeTruthy();
    expect(screen.getByTestId('call-card-3-ticker')).toBeTruthy();
    expect(screen.queryByText(/Smoke/)).toBeNull();
  });

  it('shows a queued call with its badge and no call number', () => {
    const call: CallListItem = { ...makeCall('local-1', { Number: '' }), queued: { localId: 'local-1', state: 'queued' } };
    render(<CallCard call={call} now={NOW} />);
    expect(screen.getByText('calls.queued.badge')).toBeTruthy();
    expect(screen.queryByText(/^#/)).toBeNull();
  });

  it('marks a rejected queued call', () => {
    render(<CallCard call={{ ...makeCall('local-2'), queued: { localId: 'local-2', state: 'rejected' } }} now={NOW} />);
    expect(screen.getByText('calls.queued.rejected_badge')).toBeTruthy();
  });

  it('outlines a call the user is assigned to', () => {
    render(<CallCard call={makeCall('4')} dispatches={dispatches} assignmentContext={{ userId: 'u1', groupId: null, roleIds: [], roleNames: [], unitIds: [] }} now={NOW} />);
    expect(screen.getByTestId('call-card-4-assigned')).toBeTruthy();
  });

  it('shows the protected label instead of a withheld name', () => {
    render(<CallCard call={makeCall('5', { Name: 'REDACTED', RedactedFields: ['calls.name'] })} now={NOW} />);
    expect(screen.getByText('data_protection.protected_value')).toBeTruthy();
    expect(screen.queryByText('REDACTED')).toBeNull();
  });

  it('shows check-in timer attention (Unit/IC timer props)', () => {
    render(<CallCard call={makeCall('6', { CheckInTimersEnabled: true })} timerState={{ overdue: 2, warning: 1 }} now={NOW} />);
    expect(screen.getByTestId('call-card-6-timer-icon')).toBeTruthy();
    expect(screen.getByText('calls.card.timers_attention:2,1')).toBeTruthy();
  });

  it('is one accessible button with a descriptive label', () => {
    const onPress = jest.fn();
    render(<CallCard call={makeCall('7')} priorityLabel="High" onPress={onPress} now={NOW} />);
    const button = screen.getByRole('button');
    expect(button.props.accessibilityLabel).toBe('#C-7, Call 7, 7 Main St, High, calls.time.hours_ago:1');
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ CallId: '7' }));
  });
});
