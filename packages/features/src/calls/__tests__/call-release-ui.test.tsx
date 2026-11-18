import './test-setup';

import { useNetInfo } from '@react-native-community/netinfo';
import { ApiError } from '@resgrid/api';
import { useAuthStore } from '@resgrid/auth';
import { type CallReleaseOutcome, useCallDetailStore, useCallsStore, usePersonnelStore, useUnitsStore } from '@resgrid/data';
import type { DispatchedEventResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { CallDispatchedPanel } from '../components/detail/call-dispatched-panel';
import { activateVariant, hidden, makeCall, setRights } from './test-utils';

const DIALOG = 'call-dispatched-release-dialog';

// SAFETY: dispatch rows carry only the fields the panel reads.
const entry = (Type: string, Id: string, Name: string, extra: Partial<DispatchedEventResultData> = {}) => ({ Type, Id, Name, ...extra }) as DispatchedEventResultData;

const dispatches = [entry('Unit', '45', 'MUG 1'), entry('User', 'u-1', 'Pat Doe'), entry('Group', '7', 'Station 7'), entry('Role', 'r1', 'Paramedic')];

const mockRelease = jest.fn();
const lastToast = () => useToastStore.getState().toasts.at(-1);

const renderPanel = async (props: Partial<React.ComponentProps<typeof CallDispatchedPanel>> = {}) =>
  render(<CallDispatchedPanel dispatches={dispatches} callId="123" call={makeCall('123', { Number: '26-118' })} {...props} />);

beforeEach(() => {
  activateVariant('dispatch');
  setRights({});
  useAuthStore.setState({ userId: 'me' });
  // SAFETY: NetInfo's hook state with only the two fields `isNetInfoOnline` reads.
  jest.mocked(useNetInfo).mockReturnValue({ isConnected: true, isInternetReachable: true } as never);
  useToastStore.getState().clearToasts();
  mockRelease.mockReset();
  useCallDetailStore.setState({ releaseFromCall: mockRelease, fetchCallDetail: jest.fn(async () => undefined) });
  useCallsStore.setState({ fetchCallDispatches: jest.fn(async () => undefined) });
  useUnitsStore.setState({ fetchUnitInfos: jest.fn(async () => undefined) });
  usePersonnelStore.setState({ fetchPersonnel: jest.fn(async () => undefined) });
});

describe('releasing from the call detail (Dispatch, IC)', () => {
  it('offers Release on each unit and person, never on a group or role', async () => {
    await renderPanel();

    expect(screen.getByTestId('call-dispatched-45-release').props.accessibilityLabel).toBe('calls.release.action_named:MUG 1');
    expect(screen.getByTestId('call-dispatched-u-1-release')).toBeTruthy();
    expect(screen.queryByTestId('call-dispatched-7-release')).toBeNull();
    expect(screen.queryByTestId('call-dispatched-r1-release')).toBeNull();
  });

  it('confirms with Notify on, releases the unit and says when it kept its status', async () => {
    mockRelease.mockResolvedValue({ releasedOn: '2026-11-16T10:32:00Z', statusApplied: false });
    await renderPanel();

    await fireEvent.press(screen.getByTestId('call-dispatched-45-release'));
    expect(screen.getByText('calls.release.title:MUG 1,26-118', hidden)).toBeTruthy();
    expect(screen.getByTestId(`${DIALOG}-message`, hidden)).toHaveTextContent('calls.release.message:MUG 1');

    await fireEvent.press(screen.getByTestId(`${DIALOG}-confirm`, hidden));

    expect(mockRelease).toHaveBeenCalledWith({ kind: 'unit', callId: '123', resourceId: '45', notify: true });
    expect(lastToast()).toMatchObject({ type: 'success', message: 'calls.release.unit_success_status_kept:MUG 1' });
    expect(useCallsStore.getState().fetchCallDispatches).toHaveBeenCalledWith(['123'], { bypassCache: true });
    expect(useUnitsStore.getState().fetchUnitInfos).toHaveBeenCalledWith({ bypassCache: true });
    expect(screen.queryByText('calls.release.title:MUG 1,26-118', hidden)).toBeNull();
  });

  it('releases a person without a notice when Notify is unticked', async () => {
    mockRelease.mockResolvedValue({ releasedOn: '2026-11-16T10:40:00Z', statusApplied: true });
    await renderPanel();

    await fireEvent.press(screen.getByTestId('call-dispatched-u-1-release'));
    await fireEvent.press(screen.getByTestId(`${DIALOG}-notify`, hidden));
    await fireEvent.press(screen.getByTestId(`${DIALOG}-confirm`, hidden));

    expect(mockRelease).toHaveBeenCalledWith({ kind: 'personnel', callId: '123', resourceId: 'u-1', notify: false });
    expect(lastToast()).toMatchObject({ type: 'success', message: 'calls.release.person_success:Pat Doe' });
    expect(usePersonnelStore.getState().fetchPersonnel).toHaveBeenCalledWith({ bypassCache: true });
  });

  it("shows the server's reason for a refusal and a no-permission message on 401", async () => {
    mockRelease.mockRejectedValueOnce(new ApiError({ kind: 'http', status: 400, data: 'That unit was already released from this call.' }));
    await renderPanel();

    await fireEvent.press(screen.getByTestId('call-dispatched-45-release'));
    await fireEvent.press(screen.getByTestId(`${DIALOG}-confirm`, hidden));
    expect(lastToast()).toMatchObject({ type: 'error', message: 'That unit was already released from this call.' });
    // A refusal cannot change on a retry: the dialog closes and the call is read again.
    expect(screen.queryByTestId(`${DIALOG}-confirm`, hidden)).toBeNull();
    expect(useCallDetailStore.getState().fetchCallDetail).toHaveBeenCalledWith('123', { bypassCache: true });

    mockRelease.mockRejectedValueOnce(new ApiError({ kind: 'http', status: 401 }));
    await fireEvent.press(screen.getByTestId('call-dispatched-u-1-release'));
    await fireEvent.press(screen.getByTestId(`${DIALOG}-confirm`, hidden));
    expect(lastToast()).toMatchObject({ type: 'error', message: 'calls.release.not_allowed:Pat Doe' });
  });

  it('keeps the dialog open with confirm disabled while the request runs, and open after a network failure', async () => {
    let finish: (outcome: CallReleaseOutcome) => void = () => undefined;
    mockRelease.mockReturnValueOnce(
      new Promise<CallReleaseOutcome>((resolve) => {
        finish = resolve;
      })
    );
    await renderPanel();

    await fireEvent.press(screen.getByTestId('call-dispatched-45-release'));
    await fireEvent.press(screen.getByTestId(`${DIALOG}-confirm`, hidden));
    expect(screen.getByTestId(`${DIALOG}-confirm`, hidden)).toBeDisabled();
    await fireEvent.press(screen.getByTestId(`${DIALOG}-confirm`, hidden));
    expect(mockRelease).toHaveBeenCalledTimes(1);

    await act(async () => finish({ releasedOn: '2026-11-16T10:32:00Z', statusApplied: true }));
    expect(lastToast()).toMatchObject({ message: 'calls.release.unit_success:MUG 1' });

    mockRelease.mockRejectedValueOnce(new ApiError({ kind: 'network' }));
    await fireEvent.press(screen.getByTestId('call-dispatched-45-release'));
    await fireEvent.press(screen.getByTestId(`${DIALOG}-confirm`, hidden));
    expect(lastToast()).toMatchObject({ type: 'error', message: 'calls.release.offline' });
    expect(screen.getByTestId(`${DIALOG}-confirm`, hidden)).not.toBeDisabled();
  });

  it('is online only: offline the dialog says so and confirm stays disabled', async () => {
    // SAFETY: as in beforeEach, with no connection.
    jest.mocked(useNetInfo).mockReturnValue({ isConnected: false, isInternetReachable: false } as never);
    await renderPanel();

    await fireEvent.press(screen.getByTestId('call-dispatched-45-release'));
    expect(screen.getByTestId(`${DIALOG}-offline`, hidden)).toHaveTextContent('calls.release.offline');
    expect(screen.getByTestId(`${DIALOG}-confirm`, hidden)).toBeDisabled();
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it('offers no release where the app does not release resources, to a member who may not edit the call, or on a call not yet out', async () => {
    for (const variant of ['responder', 'unit', 'bigboard'] as const) {
      activateVariant(variant);
      await renderPanel();
      expect(screen.queryByTestId('call-dispatched-45-release')).toBeNull();
    }

    activateVariant('ic');
    await renderPanel();
    expect(screen.getByTestId('call-dispatched-45-release')).toBeTruthy();

    activateVariant('dispatch');
    await renderPanel({ call: makeCall('123', { ReportingUserId: 'someone-else' }) });
    expect(screen.queryByTestId('call-dispatched-45-release')).toBeNull();

    await renderPanel({ call: makeCall('123', { State: 8 }) });
    expect(screen.queryByTestId('call-dispatched-45-release')).toBeNull();
  });

  it('lists released units and people apart, with when and by whom', async () => {
    await renderPanel({
      releasedUnits: [entry('Unit', '44', 'MUG 2', { ReleasedOn: '2026-11-16T10:32:00Z', ReleasedBy: 'Dana Dispatcher' })],
      releasedPersonnel: [entry('User', 'u-9', 'Sam Medic', { ReleasedOn: '2026-11-16T10:40:00Z' }), entry('User', 'u-8', 'Ria Medic')],
    });

    expect(screen.getByText('calls.release.released_heading')).toBeTruthy();
    expect(screen.getByTestId('call-released-unit-44-time').props.children).toMatch(/^calls\.release\.unit_released_on_by:.+,Dana Dispatcher$/);
    expect(screen.getByTestId('call-released-personnel-u-9-time').props.children).toMatch(/^calls\.release\.person_released_on:.+$/);
    expect(screen.getByTestId('call-released-personnel-u-8-time')).toHaveTextContent('calls.release.person_released');
  });

  it('lists nothing released for a server that sends no released lists', async () => {
    await renderPanel();
    expect(screen.queryByTestId('call-released')).toBeNull();
  });
});
