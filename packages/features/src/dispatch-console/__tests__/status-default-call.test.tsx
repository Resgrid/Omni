import '../../calls/__tests__/test-setup';

import { useCallsStore, usePersonnelStore, usePoisStore, useUnitsStore, useUnitStatusStore } from '@resgrid/data';
import { ActionBaseTypes } from '@resgrid/features/status';
import { type PoiResultData, type StatusesResultData, type UnitInfoResultData, type UnitTypeStatusResultData } from '@resgrid/models';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { activateVariant, hidden, makeCall } from '../../calls/__tests__/test-utils';
import { ConsoleUnitStatusSheet } from '../components/console-status-sheets';

jest.mock('@resgrid/location', () => ({
  acquireLocationFix: jest.fn(async () => ({ outcome: 'ok', fix: null })),
  getLocationFixErrorMessage: (outcome: string) => `location.${outcome}`,
}));

/**
 * A dispatcher setting a unit's status with no call filtered on the console gets the call the unit is working as the
 * default (its ActiveCallId, its status's call, else its one open dispatch), so a transport status pre-selects that call's
 * destination for the dispatcher as it does for the crew — or, for a free destination (Core M0322), stays on the call.
 */
const option = (Id: number, Text: string, extra: Partial<StatusesResultData> = {}): StatusesResultData => ({ Id, Type: 0, StateId: 0, Text, BColor: '#000', Color: '#fff', Gps: false, Note: 0, Detail: 0, ...extra });

// SAFETY: POI rows with only the fields the destination list reads.
const poi = (PoiId: number, Name: string): PoiResultData => ({ PoiId, Name, Address: '', PoiTypeName: 'Hospital' }) as PoiResultData;

// SAFETY: a unit row with only the fields the sheet reads.
const medic = (extra: Partial<UnitInfoResultData> = {}): UnitInfoResultData =>
  ({ UnitId: '5', Name: 'Medic 5', Type: 'Ambulance', CustomStatusSetId: '7', ActiveCallId: '40', CurrentDestinationId: '', CurrentDestinationType: null, CurrentStatusBaseType: null, ...extra }) as UnitInfoResultData;

const saveUnitStatus = jest.fn(async () => ({ outcome: 'sent' as const, id: 'evt-1' }));
const fetchCallDispatches = jest.fn(async () => undefined);

beforeEach(() => {
  activateVariant('dispatch');
  saveUnitStatus.mockClear();
  fetchCallDispatches.mockClear();
  useUnitsStore.setState({
    unitInfos: [medic()],
    // SAFETY: a status set with only the fields the sheet reads.
    unitTypeStatuses: [{ UnitType: 'Ambulance', StatusId: '7', Statuses: [option(20, 'Departing', { BaseType: ActionBaseTypes.Transporting, Detail: 5 })] }] as UnitTypeStatusResultData[],
    fetchUnits: jest.fn(async () => undefined),
  });
  useCallsStore.setState({ calls: [makeCall('39'), makeCall('40', { DestinationPoiId: 900, DestinationName: 'UZ Gent' })], callDispatches: {}, loading: {}, fetchCallDispatches });
  usePoisStore.setState({ destinationPois: [poi(900, 'UZ Gent'), poi(901, 'AZ Zottegem')], fetchDestinationPois: jest.fn(async () => undefined) });
  usePersonnelStore.setState({ groups: [], fetchGroups: jest.fn(async () => undefined) });
  useUnitStatusStore.setState({ saveUnitStatus });
});

const pickDeparting = async () => {
  await fireEvent.press(screen.getByTestId('status-option-20', hidden));
  await fireEvent.press(screen.getByTestId('console-unit-status-sheet-next', hidden));
};

describe('ConsoleUnitStatusSheet without a filtered call', () => {
  it('pre-selects the hospital of the call the unit is working and sends it', async () => {
    await render(<ConsoleUnitStatusSheet isOpen onClose={jest.fn()} unitIds={['5']} />);

    await pickDeparting();
    expect(screen.getByTestId('status-destination-poi-900', hidden).props.accessibilityState).toEqual({ selected: true });

    await fireEvent.press(screen.getByTestId('console-unit-status-sheet-submit', hidden));
    await waitFor(() => expect(saveUnitStatus).toHaveBeenCalledWith(expect.objectContaining({ unitId: '5', statusType: '20', respondingTo: '900', respondingToType: 3 })));
  });

  it('keeps a free destination on the call and shows it as the target', async () => {
    useCallsStore.setState({ calls: [makeCall('40', { DestinationPoiId: null, DestinationName: '', DestinationAddress: '12 Harbour Rd', DestinationLatitude: 51.05, DestinationLongitude: 3.72 })] });
    await render(<ConsoleUnitStatusSheet isOpen onClose={jest.fn()} unitIds={['5']} />);

    await pickDeparting();
    expect(screen.getByTestId('console-unit-status-sheet-call-destination', hidden)).toHaveTextContent('status.call_assigned_destination:12 Harbour Rd');
    expect(screen.queryByTestId('console-unit-status-sheet-transport-deviation', hidden)).toBeNull();

    await fireEvent.press(screen.getByTestId('console-unit-status-sheet-submit', hidden));
    await waitFor(() => expect(saveUnitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '40', respondingToType: 2 })));
  });

  it('finds the working call from the unit’s one open dispatch when the server names none', async () => {
    useUnitsStore.setState({ unitInfos: [medic({ ActiveCallId: null })] });
    // SAFETY: dispatch rows with only the fields the matching reads.
    useCallsStore.setState({ callDispatches: { '39': [], '40': [{ Id: '5', Type: 'Unit', Name: 'Medic 5' }] as never } });
    await render(<ConsoleUnitStatusSheet isOpen onClose={jest.fn()} unitIds={['5']} />);
    expect(fetchCallDispatches).toHaveBeenCalledWith(['39', '40']);

    await pickDeparting();
    expect(screen.getByTestId('status-destination-poi-900', hidden).props.accessibilityState).toEqual({ selected: true });
  });

  it('names no working call while another open call’s dispatches are not loaded', async () => {
    useUnitsStore.setState({ unitInfos: [medic({ ActiveCallId: null })] });
    // SAFETY: dispatch rows with only the fields the matching reads.
    useCallsStore.setState({ callDispatches: { '40': [{ Id: '5', Type: 'Unit', Name: 'Medic 5' }] as never } });
    await render(<ConsoleUnitStatusSheet isOpen onClose={jest.fn()} unitIds={['5']} />);

    await pickDeparting();
    expect(screen.getByTestId('status-destination-none', hidden).props.accessibilityState).toEqual({ selected: true });
  });

  it('defaults to nothing for a unit that works no call', async () => {
    useUnitsStore.setState({ unitInfos: [medic({ ActiveCallId: null })] });
    await render(<ConsoleUnitStatusSheet isOpen onClose={jest.fn()} unitIds={['5']} />);

    await pickDeparting();
    expect(screen.getByTestId('status-destination-none', hidden).props.accessibilityState).toEqual({ selected: true });
  });
});
