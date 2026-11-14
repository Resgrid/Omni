import './test-setup';

import { type CallResultData, type PoiResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { StatusPicker, type StatusPickerProps } from '../components/status-picker';
import { ActionBaseTypes } from '../lib/base-types';
import {
  findPoiById,
  getCurrentTransportPoiId,
  isTransportBaseType,
  isTransportDestinationDeviation,
  isTransportReasonRequired,
  resolveAssignedDestinationPoi,
  resolveEffectiveDestination,
} from '../lib/status-destination';
import { canSubmitStatusWithoutInput, type StatusOption } from '../lib/status-flow';

/**
 * Transport destination checks (Belgian EMS, 2026-11-13): a Transporting / At Hospital status starts on the call's assigned
 * destination (`DestinationPoiId`), a different POI is flagged, and with the department setting on it needs a reason.
 */
const q = { includeHiddenElements: true } as const;

// SAFETY: test fixtures fill only the POI and call fields the destination rules and picker read.
const poi = (PoiId: number, Name: string): PoiResultData => ({ PoiId, Name, Address: '', PoiTypeName: 'Hospital' }) as PoiResultData;

// SAFETY: as above, a partial call row.
const call = (CallId: string, DestinationPoiId: number | null): CallResultData => ({ CallId, Name: `Call ${CallId}`, Number: CallId, DestinationPoiId }) as CallResultData;

const ZOTTEGEM = poi(900, 'AZ Sint-Elisabeth Zottegem');
const GENT = poi(901, 'UZ Gent');
const POIS = [ZOTTEGEM, GENT];

// CustomStateDetailTypes: 5 calls + POIs, 4 POIs only.
const status = (Id: number, Text: string, extra: Partial<StatusOption> = {}): StatusOption => ({ Id, Text, BColor: '#22c55e', Note: 0, Detail: 0, ...extra });
const DEPARTING = status(20, 'Vertrek ZH', { BaseType: ActionBaseTypes.Transporting, Detail: 5 });
const AT_HOSPITAL = status(21, 'Aankomst ZH', { BaseType: ActionBaseTypes.AtHospital, Detail: 4 });
const RESPONDING = status(22, 'Vertrokken', { BaseType: ActionBaseTypes.Responding, Detail: 5 });
const STATUSES = [DEPARTING, AT_HOSPITAL, RESPONDING];

describe('transport destination rules', () => {
  it('treats only Transporting and At Hospital as transport statuses', () => {
    expect(isTransportBaseType(ActionBaseTypes.Transporting)).toBe(true);
    expect(isTransportBaseType('15')).toBe(true);
    expect(isTransportBaseType(ActionBaseTypes.Delivering)).toBe(false);
    expect(isTransportBaseType(ActionBaseTypes.OnScene)).toBe(false);
    expect(isTransportBaseType(null)).toBe(false);
    expect(isTransportBaseType('')).toBe(false);
  });

  it('resolves the assigned destination only from the loaded POI list', () => {
    expect(resolveAssignedDestinationPoi(call('1', 900), POIS)).toBe(ZOTTEGEM);
    expect(resolveAssignedDestinationPoi({ DestinationPoiId: 901 }, POIS)).toBe(GENT);
    expect(resolveAssignedDestinationPoi(call('1', 999), POIS)).toBeNull();
    expect(resolveAssignedDestinationPoi(call('1', 0), POIS)).toBeNull();
    expect(resolveAssignedDestinationPoi(call('1', null), POIS)).toBeNull();
    expect(resolveAssignedDestinationPoi(null, POIS)).toBeNull();
  });

  it('flags only another POI on a transport status', () => {
    expect(isTransportDestinationDeviation(ActionBaseTypes.Transporting, { type: 'poi', poi: GENT }, ZOTTEGEM)).toBe(true);
    expect(isTransportDestinationDeviation(ActionBaseTypes.Transporting, { type: 'poi', poi: ZOTTEGEM }, ZOTTEGEM)).toBe(false);
    expect(isTransportDestinationDeviation(ActionBaseTypes.Transporting, { type: 'call', call: call('1', 900) }, ZOTTEGEM)).toBe(false);
    expect(isTransportDestinationDeviation(ActionBaseTypes.Transporting, { type: 'none' }, ZOTTEGEM)).toBe(false);
    expect(isTransportDestinationDeviation(ActionBaseTypes.OnScene, { type: 'poi', poi: GENT }, ZOTTEGEM)).toBe(false);
    expect(isTransportDestinationDeviation(ActionBaseTypes.Transporting, { type: 'poi', poi: GENT }, null)).toBe(false);
  });

  it('prefers the assigned POI over the call until the user chooses', () => {
    const defaultCall = call('1', 900);
    const base = { detail: 5, lenient: false, selection: { type: 'none' } as const, defaultCall, defaultPoi: ZOTTEGEM };

    expect(resolveEffectiveDestination({ ...base, hasExplicitChoice: false })).toEqual({ type: 'poi', poi: ZOTTEGEM });
    expect(resolveEffectiveDestination({ ...base, hasExplicitChoice: true })).toEqual({ type: 'none' });
    expect(resolveEffectiveDestination({ ...base, hasExplicitChoice: true, selection: { type: 'poi', poi: GENT } })).toEqual({ type: 'poi', poi: GENT });
    // A status that offers no POIs keeps the call; no destination step keeps carrying the call silently.
    expect(resolveEffectiveDestination({ ...base, detail: 2, hasExplicitChoice: false })).toEqual({ type: 'call', call: defaultCall });
    expect(resolveEffectiveDestination({ ...base, detail: 0, hasExplicitChoice: false })).toEqual({ type: 'call', call: defaultCall });
  });

  it('finds the POI a unit is already transporting to from its current status', () => {
    expect(getCurrentTransportPoiId({ baseType: ActionBaseTypes.Transporting, destinationId: 901, destinationType: 3 })).toBe('901');
    expect(getCurrentTransportPoiId({ baseType: '15', destinationId: '901', destinationType: '3' })).toBe('901');
    expect(getCurrentTransportPoiId({ baseType: ActionBaseTypes.OnScene, destinationId: 901, destinationType: 3 })).toBeNull();
    expect(getCurrentTransportPoiId({ baseType: ActionBaseTypes.Transporting, destinationId: 40, destinationType: 2 })).toBeNull();
    expect(getCurrentTransportPoiId({ baseType: ActionBaseTypes.Transporting, destinationId: 0, destinationType: 3 })).toBeNull();
    expect(getCurrentTransportPoiId(null)).toBeNull();
    expect(findPoiById(POIS, '901')).toBe(GENT);
    expect(findPoiById(POIS, 999)).toBeNull();
    expect(findPoiById(POIS, null)).toBeNull();
  });

  it("asks for a reason only when the checks are on and the hospital is neither the call's nor the one already reported", () => {
    const toGent = { type: 'poi', poi: GENT } as const;

    expect(isTransportReasonRequired(true, true, toGent, null)).toBe(true);
    expect(isTransportReasonRequired(false, true, toGent, null)).toBe(false);
    expect(isTransportReasonRequired(true, false, toGent, null)).toBe(false);
    expect(isTransportReasonRequired(true, true, toGent, GENT)).toBe(false);
    expect(isTransportReasonRequired(true, true, toGent, ZOTTEGEM)).toBe(true);
  });

  it('lets a hold save a POI-only transport status that has its assigned destination', () => {
    expect(canSubmitStatusWithoutInput(AT_HOSPITAL, { allowsCalls: false, hasDefaultCall: true })).toBe(false);
    expect(canSubmitStatusWithoutInput(AT_HOSPITAL, { allowsCalls: false, hasDefaultCall: true, hasDefaultPoi: true })).toBe(true);
  });
});

const renderPicker = async (props: Partial<StatusPickerProps> = {}) => {
  const onSubmitStatus = jest.fn(async () => 'sent' as const);
  const defaultCall = call('100', 900);

  const utils = await render(
    <StatusPicker isOpen onClose={jest.fn()} subject="unit" statuses={STATUSES} destinations={{ calls: [defaultCall], stations: [], pois: POIS }} defaultCall={defaultCall} onSubmitStatus={onSubmitStatus} {...props} />
  );

  return { ...utils, onSubmitStatus };
};

beforeEach(() => {
  useToastStore.getState().clearToasts();
});

describe('StatusPicker transport destinations', () => {
  it("pre-selects the call's assigned hospital for a transport status and sends it as a POI", async () => {
    const { onSubmitStatus } = await renderPicker();

    await fireEvent.press(screen.getByTestId('status-option-20', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));

    expect(screen.getByTestId('status-destination-poi-900', q).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('status-destination-poi-900-badge', q)).toHaveTextContent('status.assigned_to_call');
    expect(screen.queryByTestId('status-picker-transport-deviation', q)).toBeNull();

    await fireEvent.press(screen.getByTestId('status-picker-submit', q));
    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: DEPARTING, respondingTo: '900', respondingToType: 3 })));
  });

  it('keeps the call default for a status that is not a transport status', async () => {
    const { onSubmitStatus } = await renderPicker();

    await fireEvent.press(screen.getByTestId('status-option-22', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));
    await fireEvent.press(screen.getByTestId('status-picker-submit', q));

    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '100', respondingToType: 2 })));
  });

  it('flags another hospital but does not require a reason while the checks are off', async () => {
    const { onSubmitStatus } = await renderPicker();

    await fireEvent.press(screen.getByTestId('status-option-21', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));
    await fireEvent.press(screen.getByTestId('status-destination-poi-901', q));

    expect(screen.getByTestId('status-picker-transport-deviation', q)).toHaveTextContent('status.transport_destination_differs:AZ Sint-Elisabeth Zottegem');
    await fireEvent.press(screen.getByTestId('status-picker-submit', q));
    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: AT_HOSPITAL, respondingTo: '901', respondingToType: 3, note: '' })));
  });

  it('requires a reason for another hospital when the department turned the checks on', async () => {
    const { onSubmitStatus } = await renderPicker({ transportDestinationChecks: true });

    await fireEvent.press(screen.getByTestId('status-option-21', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));
    await fireEvent.press(screen.getByTestId('status-destination-poi-901', q));

    // The status has no note of its own: the reason adds the note step.
    await fireEvent.press(screen.getByTestId('status-picker-next', q));
    expect(screen.getByTestId('status-picker-transport-reason-required', q)).toHaveTextContent('status.transport_reason_required:AZ Sint-Elisabeth Zottegem');

    const submit = screen.getByTestId('status-picker-submit', q);
    expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBeTruthy();
    await fireEvent.press(submit);
    expect(onSubmitStatus).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('status-picker-note-input', q), '  STEMI, cath lab  ');
    await fireEvent.press(screen.getByTestId('status-picker-submit', q));
    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '901', respondingToType: 3, note: 'STEMI, cath lab' })));
  });

  it('asks nothing extra when the crew keeps the assigned hospital with the checks on', async () => {
    const { onSubmitStatus } = await renderPicker({ transportDestinationChecks: true });

    await fireEvent.press(screen.getByTestId('status-option-21', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));
    await fireEvent.press(screen.getByTestId('status-picker-submit', q));

    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '900', respondingToType: 3 })));
  });

  it('keeps the hospital the crew already changed to for At Hospital, without asking for the reason again', async () => {
    const { onSubmitStatus } = await renderPicker({ transportDestinationChecks: true, currentTransportPoiId: '901' });

    await fireEvent.press(screen.getByTestId('status-option-21', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));

    expect(screen.getByTestId('status-destination-poi-901', q).props.accessibilityState).toEqual({ selected: true });
    // Still not the call's hospital: the dispatcher keeps seeing that.
    expect(screen.getByTestId('status-picker-transport-deviation', q)).toHaveTextContent('status.transport_destination_differs:AZ Sint-Elisabeth Zottegem');

    await fireEvent.press(screen.getByTestId('status-picker-submit', q));
    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: AT_HOSPITAL, respondingTo: '901', respondingToType: 3, note: '' })));
  });

  it('falls back to the assigned hospital when the reported one is no longer listed', async () => {
    const { onSubmitStatus } = await renderPicker({ currentTransportPoiId: '999' });

    await fireEvent.press(screen.getByTestId('status-option-21', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));
    await fireEvent.press(screen.getByTestId('status-picker-submit', q));

    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '900', respondingToType: 3 })));
  });

  it('never applies transport rules to personnel statuses', async () => {
    const { onSubmitStatus } = await renderPicker({ subject: 'personnel', transportDestinationChecks: true });

    await fireEvent.press(screen.getByTestId('status-option-20', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));
    await fireEvent.press(screen.getByTestId('status-picker-submit', q));

    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '100', respondingToType: 2 })));
  });

  it('falls back to the call when the assigned hospital is not in the destination list', async () => {
    const { onSubmitStatus } = await renderPicker({ defaultCall: call('100', 999), destinations: { calls: [call('100', 999)], stations: [], pois: POIS } });

    await fireEvent.press(screen.getByTestId('status-option-20', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));
    await fireEvent.press(screen.getByTestId('status-picker-submit', q));

    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '100', respondingToType: 2 })));
  });
});
