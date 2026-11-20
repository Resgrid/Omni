import './test-setup';

import { featureFlagsStore } from '@resgrid/auth';
import { useAiDestinationAdviceStore, usePoisStore } from '@resgrid/data';
import { setDepartmentConfig } from '@resgrid/features/department-config';
import { AiDestinationAdviceStates, type CallResultData, DestinationSuggestionModes, type GetConfigResultData, type PoiResultData } from '@resgrid/models';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { StatusPicker, type StatusPickerProps } from '../components/status-picker';
import { ActionBaseTypes } from '../lib/base-types';
import { type StatusOption } from '../lib/status-flow';

/**
 * The status destination list and Enhanced AI destination advice (call intake plan §7): the POI open advice for the unit's call
 * recommends is marked, never selected; and a multi-unit selection keeps the plain list (no unit's rules for all of them).
 */
const q = { includeHiddenElements: true } as const;

// SAFETY: test fixtures fill only the POI and call fields the picker reads.
const poi = (PoiId: number, Name: string): PoiResultData =>
  ({
    PoiId,
    PoiTypeId: 1,
    Note: '',
    Color: '',
    ImagePath: '',
    Marker: '',
    Name,
    Address: '',
    PoiTypeName: 'Hospital',
    Latitude: 50.8,
    Longitude: 3.8,
    IsDestination: true,
    CapabilityIds: [],
    Capabilities: [],
  }) as PoiResultData;

// SAFETY: as above, a partial call row.
const call = (CallId: string, DestinationPoiId: number | null): CallResultData => ({ CallId, Name: `Call ${CallId}`, Number: CallId, DestinationPoiId, Latitude: '50.8', Longitude: '3.8' }) as CallResultData;

const POIS = [poi(1, 'General'), poi(2, 'Trauma Center')];
const DEPARTING: StatusOption = { Id: 20, Text: 'Departing to hospital', BColor: '#22c55e', Note: 0, Detail: 5, BaseType: ActionBaseTypes.Transporting };

let fetchAdvice: jest.Mock;
let fetchSuggestedDestinations: jest.Mock;

const openAdvice = (RecommendedPoiId: number | null) => ({
  available: true,
  canApply: true,
  fetchedAt: 1,
  advice: {
    Id: 'a1',
    CallId: 100,
    CurrentPoiId: 1,
    CurrentPoiName: 'General',
    RecommendedPoiId,
    RecommendedPoiName: 'Trauma Center',
    RecommendedPoiStatus: null,
    RequiredCapabilities: [],
    Rationale: null,
    Confidence: 0.9,
    IsChange: true,
    IsConfident: true,
    State: AiDestinationAdviceStates.Open,
    CreatedOn: '2026-11-19T10:00:00Z',
    Trigger: 2,
  },
});

beforeEach(() => {
  featureFlagsStore.setState({ flags: { 'Ai.DestinationAdvice': { enabled: true } }, isLoaded: true });
  fetchAdvice = jest.fn(async () => null);
  fetchSuggestedDestinations = jest.fn(async () => null);
  useAiDestinationAdviceStore.setState({ entries: { '100': openAdvice(2) }, unsupported: false, busy: {}, fetchAdvice });
  usePoisStore.setState({ fetchSuggestedDestinations, fetchNearestDestinations: jest.fn(async () => null), fetchPoiCapabilities: jest.fn(async () => undefined), poiCapabilities: [] });
});

afterEach(async () => {
  await act(() => featureFlagsStore.setState({ flags: {} }));
  setDepartmentConfig(null);
});

const renderPicker = (props: Partial<StatusPickerProps> = {}) =>
  render(
    <StatusPicker
      isOpen
      onClose={jest.fn()}
      subject="unit"
      statuses={[DEPARTING]}
      destinations={{ calls: [call('100', 1)], stations: [], pois: POIS }}
      defaultCall={call('100', 1)}
      destinationOrigin={{ latitude: 50.8, longitude: 3.8 }}
      destinationUnitId="7"
      onSubmitStatus={jest.fn(async () => 'sent' as const)}
      {...props}
    />
  );

const openDestinations = async () => {
  await fireEvent.press(screen.getByTestId('status-option-20', q));
  await fireEvent.press(screen.getByTestId('status-picker-next', q));
};

describe('status destination list and Enhanced AI advice', () => {
  it('marks the POI the call’s open advice recommends, keeping the call’s assigned destination selected', async () => {
    await renderPicker();
    await openDestinations();

    expect(fetchAdvice).toHaveBeenCalledWith('100');
    expect(screen.getByTestId('status-destination-poi-2-ai-suggested', q)).toHaveTextContent('pois.ai_advice.suggests');
    expect(screen.getByTestId('status-destination-poi-2', q).props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByTestId('status-destination-poi-1', q).props.accessibilityState).toEqual({ selected: true });
    expect(screen.queryByTestId('status-destination-poi-1-ai-suggested', q)).toBeNull();
  });

  it('marks nothing for "keep the current destination", with the flag off, or for a status that carries a fixed call', async () => {
    useAiDestinationAdviceStore.setState({ entries: { '100': openAdvice(null) } });
    const { rerender } = await renderPicker();

    await openDestinations();
    expect(screen.queryByTestId('status-destination-poi-2-ai-suggested', q)).toBeNull();

    await act(() => {
      useAiDestinationAdviceStore.setState({ entries: { '100': openAdvice(2) } });
      featureFlagsStore.setState({ flags: {} });
    });
    await rerender(
      <StatusPicker
        isOpen
        onClose={jest.fn()}
        subject="unit"
        statuses={[DEPARTING]}
        destinations={{ calls: [call('100', 1)], stations: [], pois: POIS }}
        defaultCall={call('100', 1)}
        destinationUnitId="7"
        onSubmitStatus={jest.fn(async () => 'sent' as const)}
      />
    );
    expect(screen.queryByTestId('status-destination-poi-2-ai-suggested', q)).toBeNull();
  });

  it('asks the destination rules for one unit, never for a multi-unit selection', async () => {
    // SAFETY: the config field the picker reads.
    setDepartmentConfig({ DestinationSuggestionMode: DestinationSuggestionModes.SuggestAndFill } as GetConfigResultData);
    const { unmount } = await renderPicker();

    await openDestinations();
    await waitFor(() => expect(fetchSuggestedDestinations).toHaveBeenCalledWith(expect.objectContaining({ callId: '100', unitId: '7' }), expect.anything()));
    await unmount();

    fetchSuggestedDestinations.mockClear();
    await renderPicker({ destinationUnitId: null, destinationOrigin: null });
    await openDestinations();
    await fireEvent.press(screen.getByTestId('status-destination-tab-poi', q));

    expect(screen.getByTestId('status-destination-poi-1', q)).toBeTruthy();
    expect(fetchSuggestedDestinations).not.toHaveBeenCalled();
  });
});
