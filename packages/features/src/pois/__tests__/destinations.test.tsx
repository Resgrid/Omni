import '../../status/__tests__/test-setup';

import { usePoisStore } from '@resgrid/data';
import { NavigationHandoffProvider } from '@resgrid/features/contacts';
import { type NearestDestinationResultData, PoiAvailabilityStatuses, type PoiResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { activateVariant } from '../../calls/__tests__/test-utils';
import { PoiAvailabilitySheet } from '../components/poi-availability-sheet';
import { PoiCard } from '../components/poi-card';
import {
  availabilityBadgeKeys,
  availabilityExpiresAt,
  canPoiProvide,
  collectCapabilityOptions,
  hasCapabilityId,
  isPoiCapabilityUnavailable,
  minutesUntil,
  poiAvailabilityStatus,
  poiOffersCapability,
  rankDestinations,
  straightLineMeters,
  toDestinationOrigin,
  toggleCapabilityId,
} from '../lib/poi-availability';
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

  it('reads an expiry without a zone designator as UTC', () => {
    const report = { AvailabilityStatus: PoiAvailabilityStatuses.Closed, AvailabilityExpiresOnUtc: '2026-11-13T10:00:00' };

    expect(poiAvailabilityStatus(report, Date.UTC(2026, 10, 13, 9, 30))).toBe(PoiAvailabilityStatuses.Closed);
    expect(poiAvailabilityStatus(report, Date.UTC(2026, 10, 13, 10, 30))).toBe(PoiAvailabilityStatuses.Open);
    expect(availabilityExpiresAt(report, Date.UTC(2026, 10, 13, 9, 30))).toBe(Date.UTC(2026, 10, 13, 10, 0));
    expect(availabilityExpiresAt(report, Date.UTC(2026, 10, 13, 10, 30))).toBeNull();
    expect(availabilityExpiresAt({ AvailabilityStatus: PoiAvailabilityStatuses.Closed, AvailabilityExpiresOnUtc: null })).toBeNull();
    expect(minutesUntil(Date.UTC(2026, 10, 13, 10, 0), Date.UTC(2026, 10, 13, 9, 30, 20))).toBe(30);
    expect(minutesUntil(Date.UTC(2026, 10, 13, 10, 0), Date.UTC(2026, 10, 13, 10, 0))).toBe(1);
  });

  it('matches capability ids without case when checking and toggling', () => {
    expect(hasCapabilityId(['CATH'], 'cath')).toBe(true);
    expect(toggleCapabilityId(['CATH', 'stroke'], 'cath')).toEqual(['stroke']);
    expect(toggleCapabilityId(['stroke'], 'cath')).toEqual(['stroke', 'cath']);
  });

  it('lists what the availability badge says', () => {
    expect(availabilityBadgeKeys(CATH_2)).toEqual([]);
    expect(availabilityBadgeKeys(CATH_2, { showOpen: true })).toEqual(['pois.availability.open']);
    expect(availabilityBadgeKeys(CATH_DIVERSION, { capabilityId: 'cath' })).toEqual(['pois.availability.diversion']);
    expect(availabilityBadgeKeys(CATH_DOWN, { capabilityId: 'cath' })).toEqual(['pois.availability.limited', 'pois.availability.capability_unavailable']);
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

  it("takes what the server's ranking says each destination can provide", () => {
    // The server answered after both reports changed: the cath lab nearby is down, the one on diversion is back.
    const ranking: NearestDestinationResultData[] = [
      { Poi: CATH_2, DistanceMeters: 2200, TravelSeconds: 300, CanProvide: false },
      { Poi: CATH_DOWN, DistanceMeters: 1700, TravelSeconds: 500, CanProvide: true },
    ];

    const ranked = rankDestinations(ALL, { origin: ORIGIN, capabilityId: 'cath', ranking });

    expect(ranked.find((row) => row.poi.PoiId === 2)?.canProvide).toBe(false);
    expect(ranked.find((row) => row.poi.PoiId === 5)).toMatchObject({ canProvide: true, isNearest: true });
    // Rows the ranking left out keep the local rule.
    expect(ranked.find((row) => row.poi.PoiId === 4)?.canProvide).toBe(false);
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

  it('keeps a report’s expiry when only its note or capabilities change', async () => {
    const expiring = { ...CATH_DOWN, AvailabilityNote: 'CT down', AvailabilityExpiresOnUtc: new Date(Date.now() + 90 * 60000).toISOString() };
    const setPoiAvailability = jest.fn(async () => ({ ok: true as const, poi: expiring }));
    usePoisStore.setState({ setPoiAvailability });

    await render(<PoiAvailabilitySheet isOpen onClose={jest.fn()} poi={expiring} />);

    expect(screen.getByTestId('poi-availability-expires-keep', q).props.accessibilityState).toMatchObject({ selected: true });
    // Checked by the capability's own case ("CATH" stored, "cath" offered): pressing it clears it.
    await fireEvent.press(screen.getByTestId('poi-availability-capability-cath', q));
    await fireEvent.press(screen.getByTestId('poi-availability-save', q));

    await waitFor(() => expect(setPoiAvailability).toHaveBeenCalledWith({ PoiId: 5, Status: PoiAvailabilityStatuses.Limited, UnavailableCapabilityIds: [], Note: 'CT down', ExpiresInMinutes: 90 }));
  });

  it('does not renew a report that lapsed while the sheet was open: the dispatcher picks a new expiry', async () => {
    const expiresAt = Date.now() + 30 * 60000;
    const expiring = { ...CATH_DIVERSION, AvailabilityExpiresOnUtc: new Date(expiresAt).toISOString() };
    const setPoiAvailability = jest.fn(async () => ({ ok: true as const, poi: expiring }));
    usePoisStore.setState({ setPoiAvailability });

    await render(<PoiAvailabilitySheet isOpen onClose={jest.fn()} poi={expiring} />);
    expect(screen.getByTestId('poi-availability-expires-keep', q).props.accessibilityState).toMatchObject({ selected: true });
    const now = jest.spyOn(Date, 'now').mockReturnValue(expiresAt + 1000);

    try {
      await fireEvent.press(screen.getByTestId('poi-availability-save', q));

      expect(setPoiAvailability).not.toHaveBeenCalled();
      expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error', message: 'pois.availability.expiry_passed' });
      expect(screen.queryByTestId('poi-availability-expires-keep', q)).toBeNull();

      await fireEvent.press(screen.getByTestId('poi-availability-expires-60', q));
      await fireEvent.press(screen.getByTestId('poi-availability-save', q));

      await waitFor(() => expect(setPoiAvailability).toHaveBeenCalledWith(expect.objectContaining({ PoiId: 3, Status: PoiAvailabilityStatuses.Diversion, ExpiresInMinutes: 60 })));
    } finally {
      now.mockRestore();
    }
  });

  it('keeps the edits when the same destination is re-read while the sheet is open', async () => {
    const setPoiAvailability = jest.fn(async () => ({ ok: true as const, poi: CATH_DIVERSION }));
    usePoisStore.setState({ setPoiAvailability });

    const { rerender } = await render(<PoiAvailabilitySheet isOpen onClose={jest.fn()} poi={CATH_DIVERSION} />);
    await fireEvent.press(screen.getByTestId('poi-availability-status-3', q));
    await rerender(<PoiAvailabilitySheet isOpen onClose={jest.fn()} poi={{ ...CATH_DIVERSION }} />);
    await fireEvent.press(screen.getByTestId('poi-availability-save', q));

    await waitFor(() => expect(setPoiAvailability).toHaveBeenCalledWith(expect.objectContaining({ PoiId: 3, Status: PoiAvailabilityStatuses.Closed, ExpiresInMinutes: null })));
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
