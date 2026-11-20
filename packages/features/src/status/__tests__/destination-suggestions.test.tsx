import './test-setup';

import { usePoisStore } from '@resgrid/data';
import { setDepartmentConfig } from '@resgrid/features/department-config';
import {
  type CallResultData,
  DestinationSuggestionModes,
  type GetConfigResultData,
  PoiAvailabilityStatuses,
  type PoiResultData,
  type SuggestedDestinationResultData,
  type SuggestedDestinationsResultData,
} from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { StatusPicker, type StatusPickerProps, SUGGESTION_WAIT_MS } from '../components/status-picker';
import { ActionBaseTypes } from '../lib/base-types';
import { type StatusOption } from '../lib/status-flow';

/**
 * Destination rules in the status destination list (Core M0317, setting 127): a unit's POIs ranked by the rules for its
 * call and type, the suggestion marked (and pre-selected in "Suggest and fill"), and a chosen POI lacking a required
 * capability said plainly.
 */
const q = { includeHiddenElements: true } as const;

// SAFETY: test fixtures fill only the POI and call fields the picker reads.
const poi = (PoiId: number, Name: string, latitudeOffset: number, extra: Partial<PoiResultData> = {}): PoiResultData =>
  ({ PoiId, Name, Address: '', PoiTypeName: 'Hospital', Latitude: 50.8 + latitudeOffset, Longitude: 3.8, IsDestination: true, CapabilityIds: [], Capabilities: [], ...extra }) as PoiResultData;

// SAFETY: as above, a partial call row.
const call = (CallId: string, DestinationPoiId: number | null): CallResultData => ({ CallId, Name: `Call ${CallId}`, Number: CallId, DestinationPoiId, Latitude: '50.8', Longitude: '3.8' }) as CallResultData;

const GENERAL = poi(1, 'Near general', 0.01);
const BURNS = poi(2, 'Burn centre', 0.1, { CapabilityIds: ['burn'], Capabilities: ['Burn Center'] });

const BURNS_FULL = poi(3, 'Burn unit full', 0.05, {
  CapabilityIds: ['burn'],
  Capabilities: ['Burn Center'],
  AvailabilityStatus: PoiAvailabilityStatuses.Limited,
  UnavailableCapabilityIds: ['burn'],
});

const POIS = [GENERAL, BURNS, BURNS_FULL];

const row = (Poi: PoiResultData, extra: Partial<SuggestedDestinationResultData>): SuggestedDestinationResultData => ({
  Poi,
  DistanceMeters: 1000,
  TravelSeconds: 600,
  TravelDistanceMeters: 1500,
  CanProvide: true,
  Status: 0,
  MeetsRequirements: true,
  MissingCapabilityIds: [],
  PreferredCapabilityIds: [],
  Tier: 0,
  ...extra,
});

const ANSWER: SuggestedDestinationsResultData = {
  Mode: DestinationSuggestionModes.SuggestAndFill,
  PreferredWithinMinutes: 3,
  SuggestedPoiId: 2,
  Requirements: { PoiTypeIds: [], RequiredCapabilityIds: ['burn'], PreferredCapabilityIds: [], Rules: [{ DestinationRuleId: 'b', Name: 'Burns', Reason: null }], SetAsideRules: [] },
  Destinations: [
    row(BURNS, { TravelSeconds: 1200 }),
    row(BURNS_FULL, { TravelSeconds: 700, CanProvide: false, Status: PoiAvailabilityStatuses.Limited, Tier: 2 }),
    row(GENERAL, { TravelSeconds: 300, MeetsRequirements: false, MissingCapabilityIds: ['burn'], Tier: 2 }),
  ],
};

const status = (Id: number, Text: string, extra: Partial<StatusOption> = {}): StatusOption => ({ Id, Text, BColor: '#22c55e', Note: 0, Detail: 0, ...extra });
const DEPARTING = status(20, 'Departing to hospital', { BaseType: ActionBaseTypes.Transporting, Detail: 5 });

// Not a transport status: one offering POIs only, one offering calls and POIs.
const TO_POI = status(30, 'To a POI', { Detail: 4 });
const CALL_OR_POI = status(31, 'To a call or POI', { Detail: 5 });

// Stations only: the lenient rule (Unit, Dispatch console) also offers POIs.
const RETURNING = status(32, 'Returning', { Detail: 1 });

let fetchSuggestedDestinations: jest.Mock;
let fetchNearestDestinations: jest.Mock;

const setMode = (mode: DestinationSuggestionModes) => {
  // SAFETY: the config field the picker reads.
  setDepartmentConfig({ DestinationSuggestionMode: mode } as GetConfigResultData);
};

beforeEach(() => {
  useToastStore.getState().clearToasts();
  fetchSuggestedDestinations = jest.fn(async () => ANSWER);
  fetchNearestDestinations = jest.fn(async () => null);
  usePoisStore.setState({
    fetchSuggestedDestinations,
    fetchNearestDestinations,
    fetchPoiCapabilities: jest.fn(async () => undefined),
    poiCapabilities: [{ PoiCapabilityId: 'burn', Name: 'Burn Center', Sort: 1 }],
  });
});

afterEach(() => {
  setDepartmentConfig(null);
});

const renderPicker = async (props: Partial<StatusPickerProps> = {}, defaultCall: CallResultData = call('100', null)) => {
  const onSubmitStatus = jest.fn(async () => 'sent' as const);

  await render(
    <StatusPicker
      isOpen
      onClose={jest.fn()}
      subject="unit"
      statuses={[DEPARTING, TO_POI, CALL_OR_POI]}
      destinations={{ calls: [defaultCall], stations: [], pois: POIS }}
      defaultCall={defaultCall}
      destinationOrigin={{ latitude: 50.8, longitude: 3.8 }}
      destinationUnitId="7"
      onSubmitStatus={onSubmitStatus}
      {...props}
    />
  );

  return { onSubmitStatus };
};

const openDestinations = async (statusId: number) => {
  await fireEvent.press(screen.getByTestId(`status-option-${statusId}`, q));
  await fireEvent.press(screen.getByTestId('status-picker-next', q));
};

describe('status destination suggestions', () => {
  it('pre-selects the rules’ suggestion for a transport status once the list shows, and saves it', async () => {
    setMode(DestinationSuggestionModes.SuggestAndFill);
    const { onSubmitStatus } = await renderPicker();

    await fireEvent.press(screen.getByTestId('status-option-20', q));
    // Nothing is asked before the destination list is on screen.
    expect(fetchSuggestedDestinations).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('status-picker-next', q));

    await waitFor(() => expect(fetchSuggestedDestinations).toHaveBeenCalledWith(expect.objectContaining({ latitude: 50.8, longitude: 3.8, callId: '100', unitId: '7' }), expect.anything()));
    await waitFor(() => expect(screen.getByTestId('status-destination-poi-2', q).props.accessibilityState).toEqual({ selected: true }));
    expect(screen.getByTestId('status-destination-poi-2-suggested', q)).toHaveTextContent('pois.suggestions.suggested');
    expect(screen.getByTestId('status-destination-poi-1-missing', q)).toHaveTextContent('pois.suggestions.missing:Burn Center');
    expect(screen.getByTestId('status-destination-poi-3-down', q)).toHaveTextContent('pois.suggestions.down:Burn Center');
    expect(screen.queryByTestId('status-destination-poi-2-missing', q)).toBeNull();
    // The rules' order, not the nearest straight line: the suggestion is the "Nearest" one that meets the requirements.
    expect(screen.getByTestId('status-destination-poi-2-metrics', q)).toHaveTextContent(/pois.nearest/);
    expect(screen.queryByTestId('status-picker-destination-missing', q)).toBeNull();
    // The rules' answer ranks the list: the plain nearest ranking (more drive times) is never asked meanwhile.
    expect(fetchNearestDestinations).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('status-picker-submit', q));
    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ status: DEPARTING, respondingTo: '2', respondingToType: 3 })));
  });

  it('keeps the call’s assigned destination first and says what it lacks', async () => {
    setMode(DestinationSuggestionModes.SuggestAndFill);
    await renderPicker({}, call('100', 1));

    await openDestinations(20);

    await waitFor(() => expect(screen.getByTestId('status-picker-destination-missing', q)).toHaveTextContent('status.destination_missing:Near general,Burn Center'));
    expect(screen.getByTestId('status-destination-poi-1', q).props.accessibilityState).toEqual({ selected: true });

    await fireEvent.press(screen.getByTestId('status-destination-poi-3', q));

    expect(screen.getByTestId('status-picker-destination-required-down', q)).toHaveTextContent('status.destination_required_down:Burn unit full,Burn Center');
    expect(screen.queryByTestId('status-picker-destination-missing', q)).toBeNull();
  });

  it('only marks the suggestion when the department suggests without filling', async () => {
    setMode(DestinationSuggestionModes.Suggest);
    const { onSubmitStatus } = await renderPicker();

    await openDestinations(20);
    // Nothing to pre-select: nothing is asked until the POIs are shown.
    expect(fetchSuggestedDestinations).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('status-destination-tab-poi', q));

    await waitFor(() => expect(fetchSuggestedDestinations).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('status-destination-poi-2-suggested', q)).toBeTruthy());
    expect(screen.getByTestId('status-destination-poi-2', q).props.accessibilityState).toEqual({ selected: false });

    await fireEvent.press(screen.getByTestId('status-picker-submit', q));
    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '100', respondingToType: 2 })));
  });

  it('fills a status whose Detail is POIs only, never one that offers the call too', async () => {
    setMode(DestinationSuggestionModes.SuggestAndFill);
    await renderPicker();

    await openDestinations(30);
    await waitFor(() => expect(screen.getByTestId('status-destination-poi-2', q).props.accessibilityState).toEqual({ selected: true }));

    await fireEvent.press(screen.getByTestId('status-picker-back', q));
    await openDestinations(31);
    await fireEvent.press(screen.getByTestId('status-destination-tab-poi', q));
    await waitFor(() => expect(fetchSuggestedDestinations).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('status-destination-poi-2-suggested', q)).toBeTruthy());

    expect(screen.getByTestId('status-destination-poi-2', q).props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByTestId('status-picker-summary', q)).toHaveTextContent(/#100 Call 100/);
  });

  it('never sends a unit returning to quarters to a hospital (POIs offered only by the lenient rule)', async () => {
    setMode(DestinationSuggestionModes.SuggestAndFill);
    await renderPicker({ statuses: [RETURNING], lenientDestinations: true });

    await openDestinations(32);
    expect(fetchSuggestedDestinations).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('status-destination-tab-poi', q));
    await waitFor(() => expect(screen.getByTestId('status-destination-poi-2-suggested', q)).toBeTruthy());

    expect(screen.getByTestId('status-destination-poi-2', q).props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByTestId('status-destination-none', q).props.accessibilityState).toEqual({ selected: true });
  });

  it('never saves a hold to a suggestion the crew did not see', async () => {
    setMode(DestinationSuggestionModes.SuggestAndFill);
    let askedBeforeSave = -1;

    const onSubmitStatus = jest.fn(async () => {
      askedBeforeSave = fetchSuggestedDestinations.mock.calls.length;

      return 'sent' as const;
    });

    await renderPicker({ holdToConfirm: true, initialStatusId: 20, initialHoldConfirmed: true, onSubmitStatus });

    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '100', respondingToType: 2 })));
    expect(askedBeforeSave).toBe(0);
  });

  it('ranks by the plain nearest list when the rules cannot answer', async () => {
    setMode(DestinationSuggestionModes.SuggestAndFill);
    fetchSuggestedDestinations.mockResolvedValue(null);
    await renderPicker();

    await openDestinations(20);
    await waitFor(() => expect(fetchSuggestedDestinations).toHaveBeenCalled());
    await fireEvent.press(screen.getByTestId('status-destination-tab-poi', q));

    await waitFor(() => expect(fetchNearestDestinations).toHaveBeenCalledWith(expect.objectContaining({ unitId: '7', latitude: 50.8, longitude: 3.8 }), expect.anything()));
    expect(screen.queryByTestId('status-destination-poi-2-suggested', q)).toBeNull();
    expect(screen.getByTestId('status-picker-summary', q)).toHaveTextContent(/#100 Call 100/);
  });

  it('waits for the suggestion before it can save, then saves the suggested destination', async () => {
    setMode(DestinationSuggestionModes.SuggestAndFill);
    let answerWith: (value: SuggestedDestinationsResultData) => void = () => undefined;

    fetchSuggestedDestinations.mockImplementation(
      () =>
        new Promise<SuggestedDestinationsResultData>((resolve) => {
          answerWith = resolve;
        })
    );

    const { onSubmitStatus } = await renderPicker();

    await openDestinations(20);
    await waitFor(() => expect(fetchSuggestedDestinations).toHaveBeenCalled());

    expect(screen.getByTestId('status-picker-awaiting-suggestion', q)).toHaveTextContent('status.finding_suggested_destination');
    const submit = screen.getByTestId('status-picker-submit', q);

    expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBeTruthy();
    await fireEvent.press(submit);
    expect(onSubmitStatus).not.toHaveBeenCalled();

    await act(async () => answerWith(ANSWER));

    await waitFor(() => expect(screen.getByTestId('status-destination-poi-2', q).props.accessibilityState).toEqual({ selected: true }));
    expect(screen.queryByTestId('status-picker-awaiting-suggestion', q)).toBeNull();

    await fireEvent.press(screen.getByTestId('status-picker-submit', q));
    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '2', respondingToType: 3 })));
  });

  it('stops waiting after a while and saves the call', async () => {
    jest.useFakeTimers();

    try {
      setMode(DestinationSuggestionModes.SuggestAndFill);
      fetchSuggestedDestinations.mockImplementation(() => new Promise(() => undefined));
      const { onSubmitStatus } = await renderPicker();

      await openDestinations(20);
      await act(async () => {
        jest.advanceTimersByTime(0);
      });

      expect(fetchSuggestedDestinations).toHaveBeenCalled();
      expect(screen.getByTestId('status-picker-awaiting-suggestion', q)).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(SUGGESTION_WAIT_MS);
      });

      expect(screen.queryByTestId('status-picker-awaiting-suggestion', q)).toBeNull();

      await fireEvent.press(screen.getByTestId('status-picker-submit', q));
      await act(async () => undefined);

      expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '100', respondingToType: 2 }));
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not wait once the crew picks a destination', async () => {
    setMode(DestinationSuggestionModes.SuggestAndFill);
    fetchSuggestedDestinations.mockImplementation(() => new Promise(() => undefined));
    const { onSubmitStatus } = await renderPicker();

    await openDestinations(20);
    await waitFor(() => expect(fetchSuggestedDestinations).toHaveBeenCalled());
    await fireEvent.press(screen.getByTestId('status-destination-call-100', q));

    expect(screen.queryByTestId('status-picker-awaiting-suggestion', q)).toBeNull();

    await fireEvent.press(screen.getByTestId('status-picker-submit', q));
    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '100', respondingToType: 2 })));
  });

  it('asks nothing while the department’s suggestions are off', async () => {
    setMode(DestinationSuggestionModes.Off);
    await renderPicker();

    await openDestinations(20);
    await fireEvent.press(screen.getByTestId('status-destination-tab-poi', q));

    expect(fetchSuggestedDestinations).not.toHaveBeenCalled();
    expect(screen.queryByTestId('status-destination-poi-2-suggested', q)).toBeNull();
  });

  it.each([
    // SAFETY: a loaded config from a server that predates destination suggestions (no field).
    ['a loaded config without the mode (older server)', () => setDepartmentConfig({} as GetConfigResultData)],
    ['no config at all (its load failed)', () => setDepartmentConfig(null)],
  ])('asks nothing and never holds Set Status for %s', async (_label, configure) => {
    configure();
    const { onSubmitStatus } = await renderPicker();

    await openDestinations(20);
    await fireEvent.press(screen.getByTestId('status-destination-tab-poi', q));

    expect(fetchSuggestedDestinations).not.toHaveBeenCalled();
    expect(screen.queryByTestId('status-picker-awaiting-suggestion', q)).toBeNull();
    expect(screen.queryByTestId('status-destination-rules', q)).toBeNull();

    await fireEvent.press(screen.getByTestId('status-picker-submit', q));
    await waitFor(() => expect(onSubmitStatus).toHaveBeenCalledWith(expect.objectContaining({ respondingTo: '100', respondingToType: 2 })));
  });

  it('says on the POI list which rules applied, which were set aside and what they need', async () => {
    setMode(DestinationSuggestionModes.Suggest);
    fetchSuggestedDestinations.mockResolvedValue({
      ...ANSWER,
      Requirements: {
        PoiTypeIds: [],
        RequiredCapabilityIds: ['burn'],
        PreferredCapabilityIds: [],
        Rules: [{ DestinationRuleId: 'b', Name: 'Burns', Reason: null }],
        SetAsideRules: [{ DestinationRuleId: 't', Name: 'Tenders', Reason: 'TypeConflict' }],
      },
    });
    await renderPicker();

    await openDestinations(20);
    await fireEvent.press(screen.getByTestId('status-destination-tab-poi', q));

    await waitFor(() => expect(screen.getByTestId('status-destination-rules-applied', q)).toHaveTextContent('pois.suggestions.rules:Burns · pois.suggestions.needs:Burn Center'));
    expect(screen.getByTestId('status-destination-rules-set-aside', q)).toHaveTextContent('pois.suggestions.set_aside:pois.suggestions.set_aside_rule:Tenders,pois.suggestions.set_aside_type_conflict');
    expect(screen.queryByTestId('status-destination-rules-failed', q)).toBeNull();
  });

  it('says when the rules cannot answer, and asks again on retry', async () => {
    setMode(DestinationSuggestionModes.SuggestAndFill);
    fetchSuggestedDestinations.mockResolvedValueOnce(null).mockResolvedValueOnce(ANSWER);
    await renderPicker();

    await openDestinations(20);
    await waitFor(() => expect(fetchSuggestedDestinations).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByTestId('status-destination-tab-poi', q));

    await waitFor(() => expect(screen.getByTestId('status-destination-rules-failed', q)).toHaveTextContent(/pois\.suggestions\.failed/));
    expect(screen.queryByTestId('status-destination-poi-2-suggested', q)).toBeNull();

    await fireEvent.press(screen.getByTestId('status-destination-rules-failed-retry', q));

    await waitFor(() => expect(screen.getByTestId('status-destination-poi-2-suggested', q)).toBeTruthy());
    expect(fetchSuggestedDestinations).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('status-destination-rules-failed', q)).toBeNull();
    expect(screen.getByTestId('status-destination-rules-applied', q)).toHaveTextContent(/^pois\.suggestions\.rules:Burns · /);
  });
});
