import './test-setup';

import { type CallResultData, type GroupResultData } from '@resgrid/models';
import { getBottomSheetHeight, useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';

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

const renderPicker = async (props: Partial<StatusPickerProps> = {}) => {
  const onSubmitStatus = jest.fn(async () => 'sent' as const);
  const onClose = jest.fn();
  const utils = await render(<StatusPicker isOpen onClose={onClose} subject="unit" statuses={STATUSES} onSubmitStatus={onSubmitStatus} {...props} />);

  return { ...utils, onSubmitStatus: (props.onSubmitStatus as jest.Mock | undefined) ?? onSubmitStatus, onClose };
};

beforeEach(() => {
  useToastStore.getState().clearToasts();
});

describe('StatusPicker', () => {
  it('submits a status without destination or note and closes with a success toast', async () => {
    const { onSubmitStatus, onClose } = await renderPicker();

    await fireEvent.press(screen.getByTestId('status-option-10', q));
    await fireEvent.press(screen.getByTestId('status-picker-submit', q));

    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledTimes(1));
    expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: AVAILABLE, respondingTo: '', respondingToType: null, note: '' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(useToastStore.getState().toasts[0]).toEqual(expect.objectContaining({ type: 'success', message: 'status.status_saved_successfully' }));
  });

  it('titles the unit picker and shows who an on-behalf status is for', async () => {
    await renderPicker({ isOnBehalf: true, subjectName: 'Engine 1' });
    expect(screen.getByText('status.select_unit_status', q)).toBeTruthy();
    expect(screen.getByTestId('status-picker-on-behalf', q)).toHaveTextContent('status.on_behalf_of:Engine 1');
  });

  it('defaults a destination status to the active call and lets the crew pick a station instead (lenient Detail)', async () => {
    const calls = [call('100', 'Structure Fire'), call('101', 'Medical')];
    const { onSubmitStatus } = await renderPicker({ destinations: { calls, stations: [station('7', 'Station 7')], pois: [] }, defaultCall: calls[1], lenientDestinations: true });

    await fireEvent.press(screen.getByTestId('status-option-11', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));

    expect(screen.getByTestId('status-destination-call-101', q).props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(screen.getByTestId('status-destination-tab-station', q));
    await fireEvent.press(screen.getByTestId('status-destination-station-7', q));
    await fireEvent.press(screen.getByTestId('status-picker-submit', q));

    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '7', respondingToType: 1 })));
  });

  it('keeps an explicit "No destination" instead of re-applying the default call', async () => {
    const calls = [call('100', 'Structure Fire')];
    const { onSubmitStatus } = await renderPicker({ destinations: { calls, stations: [], pois: [] }, defaultCall: calls[0] });

    await fireEvent.press(screen.getByTestId('status-option-11', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));
    await fireEvent.press(screen.getByTestId('status-destination-none', q));
    await fireEvent.press(screen.getByTestId('status-picker-submit', q));

    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '', respondingToType: null })));
  });

  it('carries the default call silently for a status without a destination step', async () => {
    const calls = [call('100', 'Structure Fire')];
    const { onSubmitStatus } = await renderPicker({ destinations: { calls, stations: [], pois: [] }, defaultCall: calls[0] });

    await fireEvent.press(screen.getByTestId('status-option-10', q));
    await fireEvent.press(screen.getByTestId('status-picker-submit', q));

    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '100', respondingToType: 2 })));
  });

  it('requires a note when the status asks for one', async () => {
    const { onSubmitStatus } = await renderPicker();

    await fireEvent.press(screen.getByTestId('status-option-12', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));

    const submit = screen.getByTestId('status-picker-submit', q);
    expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBeTruthy();
    await fireEvent.press(submit);
    expect(onSubmitStatus).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('status-picker-note-input', q), '  Command established  ');
    await fireEvent.press(screen.getByTestId('status-picker-submit', q));
    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: ON_SCENE, note: 'Command established' })));
  });

  it('waits for the destination lists before submitting a status that may carry a call', async () => {
    const { onSubmitStatus } = await renderPicker({ isLoadingDestinations: true, hasPotentialDefaultCall: true });
    await fireEvent.press(screen.getByTestId('status-option-10', q));
    await fireEvent.press(screen.getByTestId('status-picker-submit', q));
    expect(onSubmitStatus).not.toHaveBeenCalled();
  });

  it('marks the current status by id, and by BaseType when the id is not in the set — never by text', async () => {
    const { rerender } = await renderPicker({ current: { StateId: 11 } });
    expect(screen.getByTestId('status-option-11', q).props.accessibilityLabel).toBe('Responding, status.current');

    // A department option named "Responding" with another meaning must not be matched by its text.
    await rerender(<StatusPicker isOpen onClose={jest.fn()} subject="unit" statuses={STATUSES} current={{ StateId: 999, BaseType: ActionBaseTypes.OnScene }} onSubmitStatus={jest.fn()} />);
    expect(screen.getByTestId('status-option-12', q).props.accessibilityLabel).toBe('On Scene, status.current');
    expect(screen.getByTestId('status-option-11', q).props.accessibilityLabel).toBe('Responding');
  });

  it('offers only the next statuses of the current one until "show all" is chosen', async () => {
    const withNext = [status(1, 'Available', { NextIds: [2] }), status(2, 'Responding'), status(3, 'Out of Service')];
    await renderPicker({ statuses: withNext, current: { StateId: 1 } });

    expect(screen.queryByTestId('status-option-3', q)).toBeNull();
    await fireEvent.press(screen.getByTestId('status-picker-show-all', q));
    expect(screen.getByTestId('status-option-3', q)).toBeTruthy();
  });

  it('saves a held status at once when nothing more is needed (hold-to-confirm)', async () => {
    const { onSubmitStatus } = await renderPicker({ holdToConfirm: true });

    expect(screen.queryByTestId('status-option-10', q)).toBeNull();
    await fireEvent(screen.getByTestId('status-hold-10', q), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: AVAILABLE })));
  });

  it('opens the note step after a hold when the held status needs a note', async () => {
    const { onSubmitStatus } = await renderPicker({ holdToConfirm: true });

    await fireEvent(screen.getByTestId('status-hold-12', q), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

    await waitFor(() => expect(screen.getByTestId('status-picker-note-input', q)).toBeTruthy());
    expect(onSubmitStatus).not.toHaveBeenCalled();
  });

  describe('a status chosen before the sheet opened (status buttons)', () => {
    it('opens on its destinations with Cancel, not on the list, and submits from there', async () => {
      const calls = [call('100', 'Structure Fire')];
      const { onSubmitStatus } = await renderPicker({ initialStatusId: 11, destinations: { calls, stations: [], pois: [] }, defaultCall: calls[0] });

      expect(screen.queryByTestId('status-option-11', q)).toBeNull();
      expect(screen.getByText('status.select_destination:Responding', q)).toBeTruthy();
      expect(screen.getByTestId('status-destination-call-100', q).props.accessibilityState).toEqual({ selected: true });
      expect(screen.getByTestId('status-picker-cancel', q)).toBeTruthy();
      expect(screen.queryByTestId('status-picker-back', q)).toBeNull();

      await fireEvent.press(screen.getByTestId('status-picker-submit', q));
      await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: RESPONDING, respondingTo: '100', respondingToType: 2 })));
    });

    it('goes on to the note step and back to the destinations, never to the list', async () => {
      const respondingWithNote = status(13, 'Responding', { Detail: 1, Note: 1 });
      await renderPicker({ statuses: [...STATUSES, respondingWithNote], initialStatusId: 13 });

      await fireEvent.press(screen.getByTestId('status-picker-next', q));
      expect(screen.getByTestId('status-picker-note-input', q)).toBeTruthy();
      await fireEvent.press(screen.getByTestId('status-picker-back', q));
      expect(screen.getByTestId('status-destination-none', q)).toBeTruthy();
      expect(screen.getByTestId('status-picker-cancel', q)).toBeTruthy();
    });

    it('opens on a confirm step when the status needs nothing more, and saves only when asked', async () => {
      const { onSubmitStatus } = await renderPicker({ initialStatusId: 10 });

      expect(screen.queryByTestId('status-option-10', q)).toBeNull();
      expect(screen.getByRole('header', q)).toHaveTextContent('status.set_status');
      expect(screen.getByTestId('status-picker-summary', q)).toHaveTextContent('status.selected_status: In Quarters', { exact: false });
      expect(onSubmitStatus).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByTestId('status-picker-submit', q));
      await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: AVAILABLE })));
    });

    it('opens on the note step when that is all the status asks for', async () => {
      await renderPicker({ initialStatusId: 12 });
      expect(screen.getByTestId('status-picker-note-input', q)).toBeTruthy();
      expect(screen.getByTestId('status-picker-cancel', q)).toBeTruthy();
    });

    it('scrolls a long destination list inside the sheet, keeping the buttons on it', async () => {
      const calls = Array.from({ length: 40 }, (_, index) => call(String(200 + index), `Call ${index}`));
      await renderPicker({ initialStatusId: 11, destinations: { calls, stations: [], pois: [] } });

      const { height } = StyleSheet.flatten(screen.getByTestId('status-picker-scroll', q).props.style);
      expect(height).toBeGreaterThan(0);
      expect(height).toBeLessThan(getBottomSheetHeight(Dimensions.get('window').height, 80));
      expect(screen.getByTestId('status-picker-submit', q)).toBeTruthy();
    });

    it('keeps the sheet one height when switching destination tabs, and sizes the note step to its content', async () => {
      const respondingWithNote = status(13, 'Responding', { Detail: 3, Note: 1 });
      const calls = Array.from({ length: 12 }, (_, index) => call(String(200 + index), `Call ${index}`));
      await renderPicker({ statuses: [...STATUSES, respondingWithNote], initialStatusId: 13, destinations: { calls, stations: [station('7', 'Station 7')], pois: [] }, lenientDestinations: true });
      const listStyle = () => StyleSheet.flatten(screen.getByTestId('status-picker-scroll', q).props.style);

      const onCalls = listStyle();
      await fireEvent.press(screen.getByTestId('status-destination-tab-station', q));
      expect(screen.getByTestId('status-destination-station-7', q)).toBeTruthy();
      expect(listStyle()).toEqual(onCalls);
      expect(onCalls.height).toBeGreaterThan(0);

      await fireEvent.press(screen.getByTestId('status-picker-next', q));
      expect(listStyle()).toEqual({ maxHeight: onCalls.height });
    });

    it('moves past the list once the status options arrive', async () => {
      const onSubmitStatus = jest.fn(async () => 'sent' as const);
      const { rerender } = await renderPicker({ statuses: [], initialStatusId: 11, onSubmitStatus });
      expect(screen.getByText('status.no_statuses_available', q)).toBeTruthy();

      await rerender(<StatusPicker isOpen onClose={jest.fn()} subject="unit" statuses={STATUSES} initialStatusId={11} onSubmitStatus={onSubmitStatus} />);
      expect(screen.getByTestId('status-destination-none', q)).toBeTruthy();
    });

    it('in hold mode, saves only on a hold of the save button: a tap explains instead', async () => {
      const { onSubmitStatus } = await renderPicker({ holdToConfirm: true, initialStatusId: 10 });

      expect(screen.queryByTestId('status-hold-10', q)).toBeNull();
      expect(screen.queryByTestId('status-picker-submit', q)).toBeNull();
      const holdSubmit = screen.getByTestId('status-picker-hold-submit', q);
      expect(holdSubmit).toHaveProp('accessibilityLabel', 'status.hold_to_submit');

      await fireEvent(holdSubmit, 'pressIn');
      await fireEvent(holdSubmit, 'pressOut');
      expect(screen.getByTestId('status-picker-hold-hint', q)).toHaveTextContent('status.hold_to_set_hint');
      expect(onSubmitStatus).not.toHaveBeenCalled();

      await fireEvent(holdSubmit, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
      await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: AVAILABLE })));
    });

    it('in hold mode, saves a held status at once when nothing more is needed', async () => {
      const { onSubmitStatus } = await renderPicker({ holdToConfirm: true, initialStatusId: 10, initialHoldConfirmed: true });
      await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: AVAILABLE })));
    });

    it('in hold mode, opens a held status on the step it still needs, saved with another hold', async () => {
      const { onSubmitStatus } = await renderPicker({ holdToConfirm: true, initialStatusId: 12, initialHoldConfirmed: true });
      await waitFor(() => expect(screen.getByTestId('status-picker-note-input', q)).toBeTruthy());
      expect(screen.getByTestId('status-picker-cancel', q)).toBeTruthy();
      expect(onSubmitStatus).not.toHaveBeenCalled();

      await fireEvent.changeText(screen.getByTestId('status-picker-note-input', q), 'Command established');
      await fireEvent(screen.getByTestId('status-picker-hold-submit', q), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
      await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: ON_SCENE, note: 'Command established' })));
    });

    it('in hold mode, keeps a plain Next on steps that do not save', async () => {
      const respondingWithNote = status(13, 'Responding', { Detail: 1, Note: 1 });
      await renderPicker({ holdToConfirm: true, statuses: [...STATUSES, respondingWithNote], initialStatusId: 13 });

      expect(screen.queryByTestId('status-picker-hold-submit', q)).toBeNull();
      await fireEvent.press(screen.getByTestId('status-picker-next', q));
      expect(screen.getByTestId('status-picker-hold-submit', q)).toBeTruthy();
    });
  });

  // Unit "Set Active" on a call's detail: the call is the destination, so the sheet asks for the status, then a note.
  describe('a call chosen before the sheet opened (Set Active)', () => {
    const FIRE = call('100', 'Structure Fire');

    it('names the call from the first step, skips the destination step and sends the call with the note', async () => {
      const { onSubmitStatus } = await renderPicker({ fixedCall: FIRE, destinations: { calls: [call('101', 'Medical')], stations: [station('7', 'Station 7')], pois: [] }, lenientDestinations: true });

      expect(screen.getByTestId('status-picker-summary', q)).toHaveTextContent('status.selected_destination: #100 Structure Fire');
      await fireEvent.press(screen.getByTestId('status-option-11', q));
      await fireEvent.press(screen.getByTestId('status-picker-next', q));

      expect(screen.queryByTestId('status-destination-call-101', q)).toBeNull();
      await fireEvent.changeText(screen.getByTestId('status-picker-note-input', q), ' Taking hydrant ');
      await fireEvent.press(screen.getByTestId('status-picker-submit', q));

      await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: RESPONDING, respondingTo: '100', respondingToType: 2, note: 'Taking hydrant' })));
    });

    it('offers a note even for a status that takes none, and keeps it optional', async () => {
      const { onSubmitStatus } = await renderPicker({ fixedCall: FIRE });

      await fireEvent.press(screen.getByTestId('status-option-10', q));
      expect(screen.queryByTestId('status-picker-submit', q)).toBeNull();
      await fireEvent.press(screen.getByTestId('status-picker-next', q));
      expect(screen.getByText('status.note_optional', q)).toBeTruthy();
      await fireEvent.press(screen.getByTestId('status-picker-submit', q));

      await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: AVAILABLE, respondingTo: '100', note: '' })));
    });

    it('sends no call with a status that only goes to stations or POIs, and says so', async () => {
      const toStations = status(13, 'Returning', { Detail: 1 });
      const { onSubmitStatus } = await renderPicker({ fixedCall: FIRE, statuses: [...STATUSES, toStations] });

      await fireEvent.press(screen.getByTestId('status-option-13', q));
      await fireEvent.press(screen.getByTestId('status-picker-next', q));
      expect(screen.getByTestId('status-picker-summary', q)).toHaveTextContent(/status\.selected_destination: status\.no_destination$/);
      await fireEvent.press(screen.getByTestId('status-picker-submit', q));

      await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: toStations, respondingTo: '', respondingToType: null })));
    });

    it('does not wait for the destination lists', async () => {
      const { onSubmitStatus } = await renderPicker({ fixedCall: FIRE, isLoadingDestinations: true, hasPotentialDefaultCall: true });

      await fireEvent.press(screen.getByTestId('status-option-10', q));
      await fireEvent.press(screen.getByTestId('status-picker-next', q));
      await fireEvent.press(screen.getByTestId('status-picker-submit', q));

      await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '100' })));
    });

    it('in hold mode, opens the note step after a hold instead of saving, and saves with another hold', async () => {
      const { onSubmitStatus } = await renderPicker({ fixedCall: FIRE, holdToConfirm: true });

      await fireEvent(screen.getByTestId('status-hold-10', q), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

      await waitFor(() => expect(screen.getByTestId('status-picker-note-input', q)).toBeTruthy());
      expect(onSubmitStatus).not.toHaveBeenCalled();
      expect(screen.getByTestId('status-picker-hold-submit', q)).toBeTruthy();
    });
  });

  it('shows the staffing tab and submits staffing separately', async () => {
    const onSubmitStaffing = jest.fn(async () => 'queued' as const);

    const { onClose } = await renderPicker({
      subject: 'personnel',
      showStaffing: true,
      staffingOptions: [status(0, 'Available'), status(2, 'Unavailable')],
      onSubmitStaffing,
    });

    await fireEvent.press(screen.getByTestId('status-picker-tab-staffing', q));
    await fireEvent.press(screen.getByTestId('staffing-option-2', q));
    await fireEvent.press(screen.getByTestId('status-picker-submit', q));

    await waitFor(() => expect(onSubmitStaffing).toHaveBeenCalledWith({ staffing: expect.objectContaining({ Id: 2 }), note: '' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(useToastStore.getState().toasts[0]).toEqual(expect.objectContaining({ type: 'warning', message: 'status.status_queued' }));
  });

  it('hides the staffing tab when the variant has no staffing capability', async () => {
    await renderPicker({ subject: 'personnel', showStaffing: false, staffingOptions: [status(0, 'Available')] });
    expect(screen.queryByTestId('status-picker-tab-staffing', q)).toBeNull();
  });

  it('stays open with an error when the server rejects the status', async () => {
    const onSubmitStatus = jest.fn(async () => 'rejected' as const);
    const { onClose } = await renderPicker({ onSubmitStatus });

    await fireEvent.press(screen.getByTestId('status-option-10', q));
    await fireEvent.press(screen.getByTestId('status-picker-submit', q));

    await waitFor(() => expect(screen.getByTestId('status-picker-error', q)).toHaveTextContent('status.failed_to_save_status'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('HoldToConfirmButton', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('confirms after the hold duration and treats a short press as a tap', async () => {
    const onConfirm = jest.fn();
    const onTap = jest.fn();
    await render(
      <HoldToConfirmButton onConfirm={onConfirm} onTap={onTap} backgroundColor="#000000" foregroundColor="#FFFFFF" testID="hold">
        <></>
      </HoldToConfirmButton>
    );

    await fireEvent(screen.getByTestId('hold'), 'pressIn');
    await fireEvent(screen.getByTestId('hold'), 'pressOut');
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    await fireEvent(screen.getByTestId('hold'), 'pressIn');
    await act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
