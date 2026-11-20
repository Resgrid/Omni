import './test-setup';

import { useCallsStore, useUnitRolesStore, useUnitsStore, useUnitStatusStore } from '@resgrid/data';
import { type CallResultData, type DispatchedEventResultData, type PoiResultData, type StatusesResultData, type UnitInfoResultData, type UnitResultData, type UnitTypeStatusResultData } from '@resgrid/models';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { StatusPicker, type StatusPickerProps } from '../components/status-picker';
import { UnitStatusSheet } from '../components/unit-status-sheet';
import { announceActiveCallChange, deferActiveCallEvents, onActiveCallChanged, resetActiveCallEventsForTests } from '../lib/active-call-events';
import { ActionBaseTypes } from '../lib/base-types';
import { resolveUnitWorkingCall } from '../lib/status-destination';
import type { StatusOption } from '../lib/status-flow';
import { StatusProvider, useStatusContext } from '../status-context';

jest.mock('@resgrid/location', () => ({
  acquireLocationFix: jest.fn(async () => ({ outcome: 'ok', fix: null })),
  getLocationFixErrorMessage: (outcome: string) => `location.${outcome}`,
}));

const q = { includeHiddenElements: true } as const;

// SAFETY: test fixtures fill only the call and POI fields the destination rules and picker read.
const call = (CallId: string, extra: Partial<CallResultData> = {}): CallResultData => ({ CallId, Name: `Call ${CallId}`, Number: CallId, State: 0, DestinationPoiId: null, ...extra }) as CallResultData;

// SAFETY: as above, a partial POI row.
const poi = (PoiId: number, Name: string): PoiResultData => ({ PoiId, Name, Address: '', PoiTypeName: 'Hospital' }) as PoiResultData;

const status = (Id: number, Text: string, extra: Partial<StatusOption> = {}): StatusOption => ({ Id, Text, BColor: '#22c55e', Note: 0, Detail: 0, ...extra });
const DEPARTING = status(20, 'Departing', { BaseType: ActionBaseTypes.Transporting, Detail: 5 });
const RESPONDING = status(22, 'Responding', { BaseType: ActionBaseTypes.Responding, Detail: 5 });

beforeEach(() => resetActiveCallEventsForTests());

describe('active call announcements', () => {
  it('reaches every listener, and waits while a status sheet holds them (newest call wins)', () => {
    const heard: string[] = [];
    const off = onActiveCallChanged((callId) => heard.push(callId));

    announceActiveCallChange('1');
    expect(heard).toEqual(['1']);

    const releaseA = deferActiveCallEvents();
    const releaseB = deferActiveCallEvents();
    announceActiveCallChange('2');
    announceActiveCallChange('3');
    releaseA();
    releaseA();
    expect(heard).toEqual(['1']);
    releaseB();
    expect(heard).toEqual(['1', '3']);

    off();
    announceActiveCallChange('4');
    expect(heard).toEqual(['1', '3']);
  });

  it('is announced by the StatusProvider only when the call changes', async () => {
    const heard: string[] = [];
    onActiveCallChanged((callId) => heard.push(callId));
    const onActiveCallChange = jest.fn();
    let change: ((callId: string) => void) | undefined;

    const Probe = () => {
      change = useStatusContext().onActiveCallChange;

      return null;
    };

    await render(
      <StatusProvider activeCallId="7" onActiveCallChange={onActiveCallChange}>
        <Probe />
      </StatusProvider>
    );

    await act(async () => change?.('7'));
    await act(async () => change?.('8'));
    await act(async () => change?.('8'));
    expect(onActiveCallChange).toHaveBeenCalledTimes(3);
    expect(heard).toEqual(['8']);
  });
});

describe('the call a unit is working (status on its behalf)', () => {
  const calls = [call('40'), call('41'), call('42')];
  // SAFETY: dispatch rows with only the fields the matching reads.
  const unitRow = (Id: string) => ({ Id, Type: 'Unit', Name: `Unit ${Id}` }) as DispatchedEventResultData;

  it('takes the server’s ActiveCallId, else the status’s call, else the one open dispatch', () => {
    expect(resolveUnitWorkingCall(calls, { UnitId: '5', Name: 'Medic 5', ActiveCallId: '41' }, null)?.CallId).toBe('41');
    expect(resolveUnitWorkingCall(calls, { UnitId: '5', Name: 'Medic 5', ActiveCallId: null }, { DestinationId: '42', DestinationType: 2 })?.CallId).toBe('42');
    expect(resolveUnitWorkingCall(calls, { UnitId: '5', Name: 'Medic 5' }, null, { '40': [unitRow('5')], '41': [unitRow('6')] })?.CallId).toBe('40');
  });

  it('names no call when none is open or the unit is on several', () => {
    expect(resolveUnitWorkingCall(calls, { UnitId: '5', Name: 'Medic 5', ActiveCallId: '99' }, null)).toBeNull();
    expect(resolveUnitWorkingCall(calls, { UnitId: '5', Name: 'Medic 5' }, null, { '40': [unitRow('5')], '41': [unitRow('5')] })).toBeNull();
    expect(resolveUnitWorkingCall(calls, null, null)).toBeNull();
  });
});

describe('a call with a free destination (Core M0322)', () => {
  const FREE = call('100', { DestinationAddress: '12 Harbour Rd', DestinationLatitude: 51.05, DestinationLongitude: 3.72, DestinationGeolocation: '51.05,3.72' });
  const HOSPITAL = poi(900, 'UZ Gent');

  const renderPicker = async (props: Partial<StatusPickerProps> = {}) => {
    const onSubmitStatus = jest.fn(async () => 'sent' as const);
    await render(
      <StatusPicker
        isOpen
        onClose={jest.fn()}
        subject="unit"
        statuses={[DEPARTING, RESPONDING]}
        destinations={{ calls: [FREE], stations: [], pois: [HOSPITAL] }}
        defaultCall={FREE}
        onSubmitStatus={onSubmitStatus}
        {...props}
      />
    );

    return { onSubmitStatus };
  };

  it('keeps a transport status on the call and shows its destination as the target, with no POI picked and no deviation', async () => {
    const { onSubmitStatus } = await renderPicker({ transportDestinationChecks: true });

    await fireEvent.press(screen.getByTestId('status-option-20', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));

    expect(screen.getByTestId('status-destination-call-100', q).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('status-picker-call-destination', q)).toHaveTextContent('status.call_assigned_destination:12 Harbour Rd');
    expect(screen.queryByTestId('status-picker-transport-deviation', q)).toBeNull();

    // No hospital is pre-selected: the POI tab offers them all, none picked.
    await fireEvent.press(screen.getByTestId('status-destination-tab-poi', q));
    expect(screen.getByTestId('status-destination-poi-900', q).props.accessibilityState).toEqual({ selected: false });
    await fireEvent.press(screen.getByTestId('status-destination-tab-call', q));

    await fireEvent.press(screen.getByTestId('status-picker-submit', q));
    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: DEPARTING, respondingTo: '100', respondingToType: 2, note: '' })));
  });

  it('shows the point when the free destination has no address', async () => {
    await renderPicker({ defaultCall: call('100', { DestinationLatitude: 51.05, DestinationLongitude: 3.72 }) });

    await fireEvent.press(screen.getByTestId('status-option-20', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));
    expect(screen.getByTestId('status-picker-call-destination', q)).toHaveTextContent('status.call_assigned_destination:51.05, 3.72');
  });

  it('shows nothing extra for a status that is not a transport status, nor for another POI picked', async () => {
    await renderPicker();

    await fireEvent.press(screen.getByTestId('status-option-22', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));
    expect(screen.queryByTestId('status-picker-call-destination', q)).toBeNull();
  });
});

describe('UnitStatusSheet on behalf (Dispatch, unit detail)', () => {
  const TRANSPORT_CALL = call('40', { DestinationPoiId: 900, DestinationName: 'UZ Gent' });
  const saveUnitStatus = jest.fn(async () => ({ outcome: 'sent' as const, id: 'evt-1' }));
  const option = (Id: number, Text: string, extra: Partial<StatusesResultData> = {}): StatusesResultData => ({ Id, Type: 0, StateId: 0, Text, BColor: '#000', Color: '#fff', Gps: false, Note: 0, Detail: 0, ...extra });

  beforeEach(() => {
    saveUnitStatus.mockClear();
    useUnitsStore.setState({
      // SAFETY: unit rows with only the fields the sheet reads.
      units: [{ UnitId: 'u5', Name: 'Medic 5', Type: 'Ambulance', CustomStatusSetId: '7' } as UnitResultData],
      // SAFETY: as above.
      unitInfos: [{ UnitId: 'u5', Name: 'Medic 5', ActiveCallId: '40', CurrentStatusId: '', CurrentDestinationId: '', CurrentDestinationType: null } as UnitInfoResultData],
      // SAFETY: a status set with only the fields the sheet reads.
      unitTypeStatuses: [{ UnitType: 'Ambulance', StatusId: '7', Statuses: [option(20, 'Departing', { BaseType: ActionBaseTypes.Transporting, Detail: 5 })] }] as UnitTypeStatusResultData[],
      fetchUnits: jest.fn(async () => undefined),
    });
    useUnitStatusStore.setState({
      destinationsByUnit: { u5: { calls: [call('39'), TRANSPORT_CALL], stations: [], pois: [poi(900, 'UZ Gent'), poi(901, 'AZ Zottegem')], poiTypes: [], statuses: [], fetchedAt: Date.now() } },
      currentStatusByUnit: {},
      fetchDestinationData: jest.fn(async () => undefined),
      fetchCurrentStatus: jest.fn(async () => undefined),
      saveUnitStatus,
    });
    useUnitRolesStore.setState({ assignmentsByUnit: { u5: [] } });
    useCallsStore.setState({ callDispatches: {} });
  });

  it("defaults to the call the unit is working, so a transport status pre-selects that call's hospital for the dispatcher", async () => {
    await render(
      <StatusProvider activeCallId="39">
        <UnitStatusSheet isOpen onClose={jest.fn()} unitId="u5" isOnBehalf />
      </StatusProvider>
    );

    await fireEvent.press(screen.getByTestId('status-option-20', q));
    await fireEvent.press(screen.getByTestId('unit-status-sheet-next', q));
    expect(screen.getByTestId('status-destination-poi-900', q).props.accessibilityState).toEqual({ selected: true });

    await fireEvent.press(screen.getByTestId('unit-status-sheet-submit', q));
    await waitFor(() => expect(saveUnitStatus).toHaveBeenCalledWith(expect.objectContaining({ unitId: 'u5', respondingTo: '900', respondingToType: 3 })));
  });
});

describe('UnitStatusSheet for the crew', () => {
  const saveUnitStatus = jest.fn(async () => ({ outcome: 'sent' as const, id: 'evt-1' }));

  beforeEach(() => {
    useUnitsStore.setState({
      // SAFETY: unit rows with only the fields the sheet reads.
      units: [{ UnitId: 'u1', Name: 'Engine 1', Type: 'Engine', CustomStatusSetId: '5' } as UnitResultData],
      unitInfos: [],
      // SAFETY: a status set with only the fields the sheet reads.
      unitTypeStatuses: [{ UnitType: 'Engine', StatusId: '5', Statuses: [{ Id: 31, Text: 'Responding', BaseType: ActionBaseTypes.Responding, Detail: 3, Note: 0, BColor: '#000' }] }] as UnitTypeStatusResultData[],
    });
    useUnitStatusStore.setState({
      destinationsByUnit: { u1: { calls: [call('7'), call('8')], stations: [], pois: [], poiTypes: [], statuses: [], fetchedAt: Date.now() } },
      currentStatusByUnit: {},
      fetchDestinationData: jest.fn(async () => undefined),
      fetchCurrentStatus: jest.fn(async () => undefined),
      saveUnitStatus,
    });
    useUnitRolesStore.setState({ assignmentsByUnit: { u1: [] } });
  });

  it('announces a call picked on the destination step only once the sheet closes', async () => {
    const heard: string[] = [];
    onActiveCallChanged((callId) => heard.push(callId));
    const onActiveCallChange = jest.fn();

    const Sheet = ({ isOpen }: { isOpen: boolean }) => (
      <StatusProvider activeUnitId="u1" activeCallId="7" onActiveCallChange={onActiveCallChange}>
        <UnitStatusSheet isOpen={isOpen} onClose={jest.fn()} />
      </StatusProvider>
    );

    const { rerender } = await render(<Sheet isOpen />);

    await fireEvent.press(screen.getByTestId('status-option-31', q));
    await fireEvent.press(screen.getByTestId('unit-status-sheet-next', q));
    await fireEvent.press(screen.getByTestId('status-destination-call-8', q));
    await fireEvent.press(screen.getByTestId('unit-status-sheet-submit', q));
    await waitFor(() => expect(saveUnitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '8' })));
    expect(onActiveCallChange).toHaveBeenCalledWith('8');
    expect(heard).toEqual([]);

    await rerender(<Sheet isOpen={false} />);
    expect(heard).toEqual(['8']);
  });
});
