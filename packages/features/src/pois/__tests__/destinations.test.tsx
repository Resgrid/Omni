import '../../status/__tests__/test-setup';

import { usePoisStore } from '@resgrid/data';
import { NavigationHandoffProvider } from '@resgrid/features/contacts';
import { type NearestDestinationResultData, PoiAvailabilityStatuses, type PoiResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { activateVariant } from '../../calls/__tests__/test-utils';
import { PoiCard } from '../components/poi-card';
import { canPoiProvide, collectCapabilityOptions, isPoiCapabilityUnavailable, poiAvailabilityStatus, poiOffersCapability, rankDestinations, straightLineMeters, toDestinationOrigin } from '../lib/poi-availability';
import PoiDetailScreen from '../screens/poi-detail';

/**
 * Destination capabilities and availability (Belgian EMS, 2026-11-13): "the nearest cath lab", and hospitals on diversion.
 */
const q = { includeHiddenElements: true } as const;

// SAFETY: test fixtures fill only the POI fields the destination helpers and screens read.
const poi = (PoiId: number, Name: string, latitudeOffset: number, extra: Partial<PoiResultData> = {}): PoiResultData =>
  ({
    PoiId,
    PoiTypeId: 1,
    PoiTypeName: 'Hospital',
    Name,
    Address: '',
    Note: '',
    Latitude: 50.8 + latitudeOffset,
    Longitude: 3.8,
    IsDestination: true,
    CapabilityIds: [],
    Capabilities: [],
    ...extra,
  }) as PoiResultData;

const ORIGIN = { latitude: 50.8, longitude: 3.8 };
const HANDOFF = { navigateTo: jest.fn(async () => true) };
const CATH = { CapabilityIds: ['cath'], Capabilities: ['Cath Lab'] };

const NEAR_STROKE = poi(1, 'Near stroke centre', 0.01, { CapabilityIds: ['stroke'], Capabilities: ['Stroke Center'] });
const CATH_2 = poi(2, 'Cath two', 0.02, CATH);
const CATH_DIVERSION = poi(3, 'Cath on diversion', 0.03, { ...CATH, AvailabilityStatus: PoiAvailabilityStatuses.Diversion, AvailabilityNote: 'ED full' });
const CATH_CLOSED = poi(4, 'Cath closed', 0.04, { ...CATH, AvailabilityStatus: PoiAvailabilityStatuses.Closed });
const CATH_DOWN = poi(5, 'Cath lab down', 0.015, { ...CATH, AvailabilityStatus: PoiAvailabilityStatuses.Limited, UnavailableCapabilityIds: ['CATH'] });
const ALL = [NEAR_STROKE, CATH_2, CATH_DIVERSION, CATH_CLOSED, CATH_DOWN];

describe('destination availability rules', () => {
  it('reads an expired or unknown report as open', () => {
    expect(poiAvailabilityStatus(CATH_DIVERSION)).toBe(PoiAvailabilityStatuses.Diversion);
    expect(poiAvailabilityStatus({ AvailabilityStatus: 3, AvailabilityExpiresOnUtc: new Date(Date.now() - 60000).toISOString() })).toBe(PoiAvailabilityStatuses.Open);
    expect(poiAvailabilityStatus({ AvailabilityStatus: 9 })).toBe(PoiAvailabilityStatuses.Open);
    expect(poiAvailabilityStatus(undefined)).toBe(PoiAvailabilityStatuses.Open);
  });

  it('knows what a destination can still take', () => {
    expect(canPoiProvide(CATH_CLOSED)).toBe(false);
    expect(canPoiProvide(CATH_DIVERSION, 'cath')).toBe(true);
    expect(canPoiProvide(CATH_DOWN, 'cath')).toBe(false);
    expect(canPoiProvide(CATH_DOWN)).toBe(true);
    expect(isPoiCapabilityUnavailable(CATH_DOWN, 'Cath')).toBe(true);
    expect(poiOffersCapability(CATH_2, 'CATH')).toBe(true);
    // Servers that send names only: the name stands in for the id.
    expect(poiOffersCapability(poi(9, 'Old server', 0, { CapabilityIds: undefined, Capabilities: ['Trauma Center'] }), 'Trauma Center')).toBe(true);
  });

  it('collects each capability once, by name', () => {
    expect(collectCapabilityOptions(ALL)).toEqual([
      { id: 'cath', name: 'Cath Lab' },
      { id: 'stroke', name: 'Stroke Center' },
    ]);
  });

  it('parses a unit position sent as text', () => {
    expect(toDestinationOrigin('50.8', '3.8')).toEqual(ORIGIN);
    expect(toDestinationOrigin('', '3.8')).toBeNull();
    expect(toDestinationOrigin('0', '0')).toBeNull();
    expect(straightLineMeters(50.8, 3.8, 50.81, 3.8)).toBeGreaterThan(1100);
  });

  it('ranks by availability then straight line without the server, nearest first', () => {
    const ranked = rankDestinations(ALL, { origin: ORIGIN, capabilityId: 'cath' });

    expect(ranked.map((row) => row.poi.PoiId)).toEqual([2, 3, 5, 4]);
    expect(ranked[0].isNearest).toBe(true);
    expect(ranked.find((row) => row.poi.PoiId === 5)?.canProvide).toBe(false);
  });

  it("follows the server's ranking with its drive times", () => {
    const ranking: NearestDestinationResultData[] = [
      { Poi: CATH_DIVERSION, DistanceMeters: 3300, TravelSeconds: 400, CanProvide: true },
      { Poi: CATH_2, DistanceMeters: 2200, TravelSeconds: 900, CanProvide: true },
    ];

    const ranked = rankDestinations(ALL, { origin: ORIGIN, capabilityId: 'cath', ranking });

    expect(ranked.map((row) => row.poi.PoiId)).toEqual([3, 2, 5, 4]);
    expect(ranked[0].travelSeconds).toBe(400);
  });

  it('keeps list order without an origin', () => {
    expect(rankDestinations(ALL, {}).map((row) => row.poi.PoiId)).toEqual([1, 2, 3, 4, 5]);
    expect(rankDestinations(ALL, {})[0].distanceMeters).toBeNull();
  });
});

describe('POI availability on screen', () => {
  beforeEach(() => {
    useToastStore.getState().clearToasts();
    usePoisStore.setState({ pois: ALL, poiDetailsById: {}, fetchPoi: jest.fn(async (id: number) => ALL.find((item) => item.PoiId === id) ?? null) });
  });

  it('badges a destination on diversion in lists', async () => {
    await render(<PoiCard poi={CATH_DIVERSION} />);

    expect(screen.getByTestId('poi-card-3-availability', q)).toHaveTextContent('pois.availability.diversion');
  });

  it('shows availability on the detail screen and lets a dispatcher change it', async () => {
    activateVariant('dispatch');
    const setPoiAvailability = jest.fn(async () => ({ ok: true as const, poi: { ...CATH_DIVERSION, AvailabilityStatus: PoiAvailabilityStatuses.Closed } }));
    usePoisStore.setState({ setPoiAvailability });

    await render(
      <NavigationHandoffProvider value={HANDOFF}>
        <PoiDetailScreen poiId={3} />
      </NavigationHandoffProvider>
    );

    await waitFor(() => expect(screen.getByTestId('poi-detail-availability-badge', q)).toHaveTextContent('pois.availability.diversion'));
    expect(screen.getByText('ED full', q)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('poi-detail-set-availability', q));
    await fireEvent.press(screen.getByTestId('poi-availability-status-3', q));
    await fireEvent.press(screen.getByTestId('poi-availability-capability-cath', q));
    await fireEvent.press(screen.getByTestId('poi-availability-expires-120', q));
    await fireEvent.press(screen.getByTestId('poi-availability-save', q));

    await waitFor(() => expect(setPoiAvailability).toHaveBeenCalledWith({ PoiId: 3, Status: PoiAvailabilityStatuses.Closed, UnavailableCapabilityIds: ['cath'], Note: 'ED full', ExpiresInMinutes: 120 }));
    await waitFor(() => expect(screen.getByTestId('poi-detail-availability-badge', q)).toHaveTextContent('pois.availability.closed'));
  });

  it('does not offer the change outside the dispatch desks', async () => {
    activateVariant('unit');

    await render(
      <NavigationHandoffProvider value={HANDOFF}>
        <PoiDetailScreen poiId={3} />
      </NavigationHandoffProvider>
    );

    await waitFor(() => expect(screen.getByTestId('poi-detail-availability', q)).toBeTruthy());
    expect(screen.queryByTestId('poi-detail-set-availability', q)).toBeNull();
  });

  it('marks a capability that is down', async () => {
    activateVariant('responder');

    await render(
      <NavigationHandoffProvider value={HANDOFF}>
        <PoiDetailScreen poiId={5} />
      </NavigationHandoffProvider>
    );

    await waitFor(() => expect(screen.getByTestId('poi-detail-capability-cath', q)).toBeTruthy());
    expect(screen.getByTestId('poi-detail-availability-badge', q)).toHaveTextContent('pois.availability.limited');
  });
});
