import './test-setup';

import { type CallResultData, type GroupResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { HoldToConfirmButton } from '../components/hold-to-confirm-button';
import { StatusPicker, type StatusPickerProps } from '../components/status-picker';
import { ActionBaseTypes } from '../lib/base-types';
import { type StatusOption } from '../lib/status-flow';

const q = { includeHiddenElements: true } as const;

const status = (Id: number, Text: string, extra: Partial<StatusOption> = {}): StatusOption => ({ Id, Text, BColor: '#22c55e', Note: 0, Detail: 0, ...extra });

const AVAILABLE = status(10, 'In Quarters', { BaseType: ActionBaseTypes.Available });
const RESPONDING = status(11, 'Responding', { BaseType: ActionBaseTypes.Responding, Detail: 3 });
const ON_SCENE = status(12, 'On Scene', { BaseType: ActionBaseTypes.OnScene, Note: 2 });
const STATUSES = [AVAILABLE, RESPONDING, ON_SCENE];

const call = (CallId: string, Name: string): CallResultData => ({ CallId, Name, Number: CallId }) as CallResultData;
const station = (GroupId: string, Name: string): GroupResultData => ({ GroupId, Name, TypeId: '2' }) as GroupResultData;

const renderPicker = (props: Partial<StatusPickerProps> = {}) => {
  const onSubmitStatus = jest.fn(async () => 'sent' as const);
  const onClose = jest.fn();
  const utils = render(<StatusPicker isOpen onClose={onClose} subject="unit" statuses={STATUSES} onSubmitStatus={onSubmitStatus} {...props} />);
  return { ...utils, onSubmitStatus: (props.onSubmitStatus as jest.Mock | undefined) ?? onSubmitStatus, onClose };
};

beforeEach(() => {
  useToastStore.getState().clearToasts();
});

describe('StatusPicker', () => {
  it('submits a status without destination or note and closes with a success toast', async () => {
    const { onSubmitStatus, onClose } = renderPicker();

    fireEvent.press(screen.getByTestId('status-option-10', q));
    fireEvent.press(screen.getByTestId('status-picker-submit', q));

    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledTimes(1));
    expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: AVAILABLE, respondingTo: '', respondingToType: null, note: '' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(useToastStore.getState().toasts[0]).toEqual(expect.objectContaining({ type: 'success', message: 'status.status_saved_successfully' }));
  });

  it('titles the unit picker and shows who an on-behalf status is for', () => {
    renderPicker({ isOnBehalf: true, subjectName: 'Engine 1' });
    expect(screen.getByText('status.select_unit_status', q)).toBeTruthy();
    expect(screen.getByTestId('status-picker-on-behalf', q)).toHaveTextContent('status.on_behalf_of:Engine 1');
  });

  it('defaults a destination status to the active call and lets the crew pick a station instead (lenient Detail)', async () => {
    const calls = [call('100', 'Structure Fire'), call('101', 'Medical')];
    const { onSubmitStatus } = renderPicker({ destinations: { calls, stations: [station('7', 'Station 7')], pois: [] }, defaultCall: calls[1], lenientDestinations: true });

    fireEvent.press(screen.getByTestId('status-option-11', q));
    fireEvent.press(screen.getByTestId('status-picker-next', q));

    expect(screen.getByTestId('status-destination-call-101', q).props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId('status-destination-tab-station', q));
    fireEvent.press(screen.getByTestId('status-destination-station-7', q));
    fireEvent.press(screen.getByTestId('status-picker-submit', q));

    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '7', respondingToType: 1 })));
  });

  it('keeps an explicit "No destination" instead of re-applying the default call', async () => {
    const calls = [call('100', 'Structure Fire')];
    const { onSubmitStatus } = renderPicker({ destinations: { calls, stations: [], pois: [] }, defaultCall: calls[0] });

    fireEvent.press(screen.getByTestId('status-option-11', q));
    fireEvent.press(screen.getByTestId('status-picker-next', q));
    fireEvent.press(screen.getByTestId('status-destination-none', q));
    fireEvent.press(screen.getByTestId('status-picker-submit', q));

    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '', respondingToType: null })));
  });

  it('carries the default call silently for a status without a destination step', async () => {
    const calls = [call('100', 'Structure Fire')];
    const { onSubmitStatus } = renderPicker({ destinations: { calls, stations: [], pois: [] }, defaultCall: calls[0] });

    fireEvent.press(screen.getByTestId('status-option-10', q));
    fireEvent.press(screen.getByTestId('status-picker-submit', q));

    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '100', respondingToType: 2 })));
  });

  it('requires a note when the status asks for one', async () => {
    const { onSubmitStatus } = renderPicker();

    fireEvent.press(screen.getByTestId('status-option-12', q));
    fireEvent.press(screen.getByTestId('status-picker-next', q));

    const submit = screen.getByTestId('status-picker-submit', q);
    expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBeTruthy();
    fireEvent.press(submit);
    expect(onSubmitStatus).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('status-picker-note-input', q), '  Command established  ');
    fireEvent.press(screen.getByTestId('status-picker-submit', q));
    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: ON_SCENE, note: 'Command established' })));
  });

  it('waits for the destination lists before submitting a status that may carry a call', () => {
    const { onSubmitStatus } = renderPicker({ isLoadingDestinations: true, hasPotentialDefaultCall: true });
    fireEvent.press(screen.getByTestId('status-option-10', q));
    fireEvent.press(screen.getByTestId('status-picker-submit', q));
    expect(onSubmitStatus).not.toHaveBeenCalled();
  });

  it('marks the current status by id, and by BaseType when the id is not in the set — never by text', () => {
    const { rerender } = renderPicker({ current: { StateId: 11 } });
    expect(screen.getByTestId('status-option-11', q).props.accessibilityLabel).toBe('Responding, status.current');

    // A department option named "Responding" with another meaning must not be matched by its text.
    rerender(<StatusPicker isOpen onClose={jest.fn()} subject="unit" statuses={STATUSES} current={{ StateId: 999, BaseType: ActionBaseTypes.OnScene }} onSubmitStatus={jest.fn()} />);
    expect(screen.getByTestId('status-option-12', q).props.accessibilityLabel).toBe('On Scene, status.current');
    expect(screen.getByTestId('status-option-11', q).props.accessibilityLabel).toBe('Responding');
  });

  it('offers only the next statuses of the current one until "show all" is chosen', () => {
    const withNext = [status(1, 'Available', { NextIds: [2] }), status(2, 'Responding'), status(3, 'Out of Service')];
    renderPicker({ statuses: withNext, current: { StateId: 1 } });

    expect(screen.queryByTestId('status-option-3', q)).toBeNull();
    fireEvent.press(screen.getByTestId('status-picker-show-all', q));
    expect(screen.getByTestId('status-option-3', q)).toBeTruthy();
  });

  it('saves a held status at once when nothing more is needed (hold-to-confirm)', async () => {
    const { onSubmitStatus } = renderPicker({ holdToConfirm: true });

    expect(screen.queryByTestId('status-option-10', q)).toBeNull();
    fireEvent(screen.getByTestId('status-hold-10', q), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: AVAILABLE })));
  });

  it('opens the note step after a hold when the held status needs a note', async () => {
    const { onSubmitStatus } = renderPicker({ holdToConfirm: true });

    fireEvent(screen.getByTestId('status-hold-12', q), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

    await waitFor(() => expect(screen.getByTestId('status-picker-note-input', q)).toBeTruthy());
    expect(onSubmitStatus).not.toHaveBeenCalled();
  });

  it('shows the staffing tab and submits staffing separately', async () => {
    const onSubmitStaffing = jest.fn(async () => 'queued' as const);
    const { onClose } = renderPicker({
      subject: 'personnel',
      showStaffing: true,
      staffingOptions: [status(0, 'Available'), status(2, 'Unavailable')],
      onSubmitStaffing,
    });

    fireEvent.press(screen.getByTestId('status-picker-tab-staffing', q));
    fireEvent.press(screen.getByTestId('staffing-option-2', q));
    fireEvent.press(screen.getByTestId('status-picker-submit', q));

    await waitFor(() => expect(onSubmitStaffing).toHaveBeenCalledWith({ staffing: expect.objectContaining({ Id: 2 }), note: '' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(useToastStore.getState().toasts[0]).toEqual(expect.objectContaining({ type: 'warning', message: 'status.status_queued' }));
  });

  it('hides the staffing tab when the variant has no staffing capability', () => {
    renderPicker({ subject: 'personnel', showStaffing: false, staffingOptions: [status(0, 'Available')] });
    expect(screen.queryByTestId('status-picker-tab-staffing', q)).toBeNull();
  });

  it('stays open with an error when the server rejects the status', async () => {
    const onSubmitStatus = jest.fn(async () => 'rejected' as const);
    const { onClose } = renderPicker({ onSubmitStatus });

    fireEvent.press(screen.getByTestId('status-option-10', q));
    fireEvent.press(screen.getByTestId('status-picker-submit', q));

    await waitFor(() => expect(screen.getByTestId('status-picker-error', q)).toHaveTextContent('status.failed_to_save_status'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('HoldToConfirmButton', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('confirms after the hold duration and treats a short press as a tap', () => {
    const onConfirm = jest.fn();
    const onTap = jest.fn();
    render(
      <HoldToConfirmButton onConfirm={onConfirm} onTap={onTap} backgroundColor="#000000" foregroundColor="#FFFFFF" testID="hold">
        <></>
      </HoldToConfirmButton>
    );

    fireEvent(screen.getByTestId('hold'), 'pressIn');
    fireEvent(screen.getByTestId('hold'), 'pressOut');
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent(screen.getByTestId('hold'), 'pressIn');
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
