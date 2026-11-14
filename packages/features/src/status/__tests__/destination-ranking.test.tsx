import './test-setup';

import { usePoisStore } from '@resgrid/data';
import { type CallResultData, type NearestDestinationResultData, PoiAvailabilityStatuses, type PoiResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { DestinationPoiPicker } from '../../calls/components/call-form/destination-poi-picker';
import { StatusPicker, type StatusPickerProps } from '../components/status-picker';
import { ActionBaseTypes } from '../lib/base-types';
import { type StatusOption } from '../lib/status-flow';

/**
 * "We request transport to the nearest cath lab" (Belgian EMS, 2026-11-13): the destination lists narrow by capability,
 * rank from the unit or the call location, and say when a hospital is on diversion.
 */
const q = { includeHiddenElements: true } as const;

// SAFETY: test fixtures fill only the POI and call fields the pickers read.
const poi = (PoiId: number, Name: string, latitudeOffset: number, extra: Partial<PoiResultData> = {}): PoiResultData =>
  ({ PoiId, Name, Address: '', PoiTypeName: 'Hospital', Latitude: 50.8 + latitudeOffset, Longitude: 3.8, IsDestination: true, CapabilityIds: [], Capabilities: [], ...extra }) as PoiResultData;

// SAFETY: as above, a partial call row.
const call = (CallId: string, DestinationPoiId: number | null): CallResultData => ({ CallId, Name: `Call ${CallId}`, Number: CallId, DestinationPoiId }) as CallResultData;

const STROKE = poi(1, 'Near stroke centre', 0.01, { CapabilityIds: ['stroke'], Capabilities: ['Stroke Center'] });
const CATH_FAR = poi(2, 'Far cath lab', 0.2, { CapabilityIds: ['cath'], Capabilities: ['Cath Lab'] });
const CATH_DIVERSION = poi(3, 'Cath on diversion', 0.05, { CapabilityIds: ['cath'], Capabilities: ['Cath Lab'], AvailabilityStatus: PoiAvailabilityStatuses.Diversion });
const POIS = [STROKE, CATH_FAR, CATH_DIVERSION];

const status = (Id: number, Text: string, extra: Partial<StatusOption> = {}): StatusOption => ({ Id, Text, BColor: '#22c55e', Note: 0, Detail: 0, ...extra });
const DEPARTING = status(20, 'Vertrek ZH', { BaseType: ActionBaseTypes.Transporting, Detail: 5 });
const AT_HOSPITAL = status(21, 'Aankomst ZH', { BaseType: ActionBaseTypes.AtHospital, Detail: 4 });

let fetchNearestDestinations: jest.Mock;

beforeEach(() => {
  useToastStore.getState().clearToasts();
  fetchNearestDestinations = jest.fn(async (): Promise<NearestDestinationResultData[] | null> => null);
  usePoisStore.setState({ fetchNearestDestinations });
});

const renderPicker = async (props: Partial<StatusPickerProps> = {}) => {
  const onSubmitStatus = jest.fn(async () => 'sent' as const);
  const defaultCall = call('100', null);

  await render(
    <StatusPicker
      isOpen
      onClose={jest.fn()}
      subject="unit"
      statuses={[DEPARTING, AT_HOSPITAL]}
      destinations={{ calls: [defaultCall], stations: [], pois: POIS }}
      defaultCall={defaultCall}
      onSubmitStatus={onSubmitStatus}
      {...props}
    />
  );

  return { onSubmitStatus };
};

describe('status destination ranking', () => {
  it('narrows POIs to a capability and ranks them from the unit, drive times from the server', async () => {
    fetchNearestDestinations.mockImplementation(async (query: { capabilityId?: string | null }) =>
      query.capabilityId === 'cath'
        ? [
            { Poi: CATH_FAR, DistanceMeters: 22000, TravelSeconds: 1260, CanProvide: true },
            { Poi: CATH_DIVERSION, DistanceMeters: 5500, TravelSeconds: 480, CanProvide: true },
          ]
        : null
    );
    await renderPicker({ destinationOrigin: { latitude: 50.8, longitude: 3.8 }, destinationUnitId: '7' });

    await fireEvent.press(screen.getByTestId('status-option-21', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));

    // No capability chosen: every POI, nearest first by straight line.
    expect(screen.getByTestId('status-destination-poi-1-metrics', q)).toHaveTextContent(/pois.nearest/);

    await fireEvent.press(screen.getByTestId('status-destination-capabilities-cath', q));

    await waitFor(() => expect(fetchNearestDestinations).toHaveBeenLastCalledWith(expect.objectContaining({ capabilityId: 'cath', unitId: '7', latitude: 50.8, longitude: 3.8 }), expect.anything()));
    expect(screen.queryByTestId('status-destination-poi-1', q)).toBeNull();
    await waitFor(() => expect(screen.getByTestId('status-destination-poi-2-metrics', q)).toHaveTextContent('pois.nearest · 22.2 km · 21:00 min'));
    expect(screen.getByTestId('status-destination-poi-3-availability', q)).toHaveTextContent('pois.availability.diversion');
  });

  it('says plainly when the chosen hospital is on diversion', async () => {
    await renderPicker();

    await fireEvent.press(screen.getByTestId('status-option-21', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));
    await fireEvent.press(screen.getByTestId('status-destination-poi-3', q));

    expect(screen.getByTestId('status-picker-destination-availability', q)).toHaveTextContent('status.destination_availability:Cath on diversion,pois.availability.diversion');
  });

  it('asks the server nothing without a unit position', async () => {
    await renderPicker();

    await fireEvent.press(screen.getByTestId('status-option-21', q));
    await fireEvent.press(screen.getByTestId('status-picker-next', q));

    expect(fetchNearestDestinations).not.toHaveBeenCalled();
    expect(screen.queryByTestId('status-destination-poi-1-metrics', q)).toBeNull();
  });
});

describe('call form destination picker', () => {
  it('filters destinations by capability and ranks them from the call location', async () => {
    const onSelect = jest.fn();

    await render(<DestinationPoiPicker isOpen onClose={jest.fn()} pois={POIS} selectedId={null} onSelect={onSelect} origin={{ latitude: 50.8, longitude: 3.8 }} />);

    expect(screen.getByTestId('call-destination-poi-1-capabilities', q)).toHaveTextContent('Stroke Center');

    await fireEvent.press(screen.getByTestId('call-destination-capabilities-cath', q));

    expect(screen.queryByTestId('call-destination-poi-1', q)).toBeNull();
    // The diversion is nearer but ranks after the open cath lab.
    await waitFor(() => expect(screen.getByTestId('call-destination-poi-2-metrics', q)).toHaveTextContent(/pois.nearest/));
    expect(screen.getByTestId('call-destination-poi-3-availability', q)).toHaveTextContent('pois.availability.diversion');

    await fireEvent.press(screen.getByTestId('call-destination-poi-3', q));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it('names a destination on diversion as such to screen readers', async () => {
    await render(<DestinationPoiPicker isOpen onClose={jest.fn()} pois={POIS} selectedId={null} onSelect={jest.fn()} />);

    expect(screen.getByTestId('call-destination-poi-3', q).props.accessibilityLabel).toBe('Cath on diversion, Hospital, pois.availability.diversion');
    expect(screen.getByTestId('call-destination-poi-2', q).props.accessibilityLabel).toBe('Far cath lab, Hospital');
  });

  it('stays alphabetical without a call location', async () => {
    await render(<DestinationPoiPicker isOpen onClose={jest.fn()} pois={POIS} selectedId={null} onSelect={jest.fn()} />);

    expect(screen.queryByTestId('call-destination-poi-1-metrics', q)).toBeNull();
    expect(fetchNearestDestinations).not.toHaveBeenCalled();
  });
});
