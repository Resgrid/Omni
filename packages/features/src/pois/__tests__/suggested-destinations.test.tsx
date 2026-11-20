import '../../status/__tests__/test-setup';

import { usePoisStore } from '@resgrid/data';
import { setDepartmentConfig } from '@resgrid/features/department-config';
import { DestinationSuggestionModes, type GetConfigResultData, PoiAvailabilityStatuses, type PoiResultData, type SuggestedDestinationsResultData } from '@resgrid/models';
import { Pressable, Text } from '@resgrid/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React, { useState } from 'react';

import { SuggestedDestinationsPanel } from '../components/suggested-destinations-panel';
import { decideDestinationFill, initialDestinationFillState, observeDestinationChange, resumeDestinationFill, withdrawDestinationFill } from '../lib/destination-fill';
import { configuredDestinationSuggestionMode } from '../lib/destination-suggestion-mode';

/** Call-form destination suggestions (destination rules, Core M0317): the panel and "Suggest and fill". */
const q = { includeHiddenElements: true } as const;

// SAFETY: test fixtures fill only the POI fields the panel reads.
const poi = (PoiId: number, Name: string, extra: Partial<PoiResultData> = {}): PoiResultData =>
  ({ PoiId, PoiTypeId: 1, PoiTypeName: 'Hospitals', Name, Address: '', Note: '', Latitude: 39.2, Longitude: -119.8, IsDestination: true, CapabilityIds: [], Capabilities: [], ...extra }) as PoiResultData;

const answer = (extra: Partial<SuggestedDestinationsResultData> = {}): SuggestedDestinationsResultData => ({
  Mode: DestinationSuggestionModes.SuggestAndFill,
  PreferredWithinMinutes: 3,
  SuggestedPoiId: 1,
  Requirements: { PoiTypeIds: [1], RequiredCapabilityIds: ['burn'], PreferredCapabilityIds: ['heli'], Rules: [{ DestinationRuleId: 'b', Name: 'Burns', Reason: null }], SetAsideRules: [] },
  Destinations: [
    {
      Poi: poi(1, 'Renown'),
      DistanceMeters: 40000,
      TravelSeconds: 2040,
      TravelDistanceMeters: 53000,
      CanProvide: true,
      Status: 0,
      MeetsRequirements: true,
      MissingCapabilityIds: [],
      PreferredCapabilityIds: ['heli'],
      Tier: 0,
    },
    {
      Poi: poi(2, 'CTRMC', { AvailabilityStatus: PoiAvailabilityStatuses.Diversion }),
      DistanceMeters: 6000,
      TravelSeconds: 720,
      TravelDistanceMeters: 11000,
      CanProvide: true,
      Status: 2,
      MeetsRequirements: false,
      MissingCapabilityIds: ['burn'],
      PreferredCapabilityIds: [],
      Tier: 2,
    },
  ],
  ...extra,
});

const ORIGIN = { latitude: 39.143, longitude: -119.756 };

describe('destination fill rules', () => {
  const selectable = () => true;

  it('fills an empty destination and follows a better suggestion', () => {
    let state = initialDestinationFillState(null);
    let decision = decideDestinationFill(state, { enabled: true, mode: 2, selectedPoiId: null, suggestedPoiId: 1, isSelectable: selectable });

    expect(decision.action).toEqual({ kind: 'fill', poiId: 1 });
    state = observeDestinationChange(decision.state, 1);
    decision = decideDestinationFill(state, { enabled: true, mode: 2, selectedPoiId: 1, suggestedPoiId: 4, isSelectable: selectable });
    expect(decision.action).toEqual({ kind: 'fill', poiId: 4 });
  });

  it('never fills over the dispatcher’s choice, a destination set on open, or with suggestions only', () => {
    const picked = observeDestinationChange({ autoFilledId: 1, touched: false }, 7);

    expect(picked.touched).toBe(true);
    expect(decideDestinationFill(picked, { enabled: true, mode: 2, selectedPoiId: 7, suggestedPoiId: 1, isSelectable: selectable }).action.kind).toBe('none');
    expect(decideDestinationFill(initialDestinationFillState(5), { enabled: true, mode: 2, selectedPoiId: 5, suggestedPoiId: 1, isSelectable: selectable }).action.kind).toBe('none');
    expect(decideDestinationFill(initialDestinationFillState(null), { enabled: true, mode: 1, selectedPoiId: null, suggestedPoiId: 1, isSelectable: selectable }).action.kind).toBe('none');
    expect(decideDestinationFill(initialDestinationFillState(null), { enabled: false, mode: 2, selectedPoiId: null, suggestedPoiId: 1, isSelectable: selectable }).action.kind).toBe('none');
    // A destination that appeared before the first answer (a route's end) is not ours either.
    expect(decideDestinationFill(initialDestinationFillState(null), { enabled: true, mode: 2, selectedPoiId: 9, suggestedPoiId: 1, isSelectable: selectable }).action.kind).toBe('none');
  });

  it('takes back its own fill when nothing meets the requirements any more, and a clear by hand stops it', () => {
    const filled = { autoFilledId: 1, touched: false };

    expect(decideDestinationFill(filled, { enabled: true, mode: 2, selectedPoiId: 1, suggestedPoiId: null, isSelectable: selectable }).action).toEqual({ kind: 'clear' });
    expect(observeDestinationChange(filled, null).touched).toBe(true);
    expect(observeDestinationChange({ autoFilledId: null, touched: false }, null).touched).toBe(false);
  });

  it('does not fill a destination the form cannot show', () => {
    expect(decideDestinationFill(initialDestinationFillState(null), { enabled: true, mode: 2, selectedPoiId: null, suggestedPoiId: 1, isSelectable: () => false }).action.kind).toBe('none');
  });

  it('keeps a clear or pick by hand across a switch of the destination kind, and resumes a fill the switch only took out', () => {
    // Filled, cleared by hand, then the kind switched to an address or point and back (the field shows again, empty).
    const cleared = observeDestinationChange({ autoFilledId: 1, touched: false }, null);
    const back = resumeDestinationFill(cleared, null);

    expect(back.touched).toBe(true);
    expect(decideDestinationFill(back, { enabled: true, mode: 2, selectedPoiId: null, suggestedPoiId: 1, isSelectable: selectable }).action.kind).toBe('none');

    // A pick by hand stays the dispatcher's too.
    expect(resumeDestinationFill(observeDestinationChange({ autoFilledId: 1, touched: false }, 9), 9)).toEqual({ autoFilledId: null, touched: true });

    // Filled, then the switch alone took it out: the fill carries on once the POI field is back.
    const switched = resumeDestinationFill({ autoFilledId: 1, touched: false }, null);

    expect(switched).toEqual({ autoFilledId: null, touched: false });
    expect(decideDestinationFill(switched, { enabled: true, mode: 2, selectedPoiId: null, suggestedPoiId: 1, isSelectable: selectable }).action).toEqual({ kind: 'fill', poiId: 1 });

    // A POI picked while the field was away (the destination picker) is the dispatcher's; a first showing starts clean.
    expect(resumeDestinationFill({ autoFilledId: null, touched: false }, 4).touched).toBe(true);
    expect(resumeDestinationFill(null, null)).toEqual(initialDestinationFillState(null));
    expect(resumeDestinationFill(null, 5)).toEqual(initialDestinationFillState(5));
  });

  it('takes its own fill back out when the suggestions for new inputs cannot be had, never the dispatcher’s choice', () => {
    expect(withdrawDestinationFill({ autoFilledId: 1, touched: false }, 1)).toEqual({ action: { kind: 'clear' }, state: { autoFilledId: null, touched: false } });
    expect(withdrawDestinationFill({ autoFilledId: null, touched: true }, 7).action.kind).toBe('none');
    expect(withdrawDestinationFill({ autoFilledId: null, touched: false }, null).action.kind).toBe('none');
  });
});

describe('configured destination suggestion mode', () => {
  it('reads a loaded config, and a loaded config without the field (an older server) as off', () => {
    // SAFETY: the config field the helper reads.
    const config = (mode?: number | null) => ({ DestinationSuggestionMode: mode }) as GetConfigResultData;

    expect(configuredDestinationSuggestionMode(config(DestinationSuggestionModes.Suggest))).toBe(DestinationSuggestionModes.Suggest);
    expect(configuredDestinationSuggestionMode(config(DestinationSuggestionModes.SuggestAndFill))).toBe(DestinationSuggestionModes.SuggestAndFill);
    expect(configuredDestinationSuggestionMode(config(DestinationSuggestionModes.Off))).toBe(DestinationSuggestionModes.Off);
    // SAFETY: a server that predates the field sends none.
    expect(configuredDestinationSuggestionMode({} as GetConfigResultData)).toBe(DestinationSuggestionModes.Off);
    expect(configuredDestinationSuggestionMode(config(null))).toBe(DestinationSuggestionModes.Off);
    expect(configuredDestinationSuggestionMode(config(7))).toBe(DestinationSuggestionModes.Off);
  });

  it('leaves a config that could not be loaded unknown', () => {
    expect(configuredDestinationSuggestionMode(null)).toBeNull();
    expect(configuredDestinationSuggestionMode(undefined)).toBeNull();
  });
});

/** The panel inside a stand-in form holding the destination POI id. */
const Form: React.FC<{ canFill?: boolean; initial?: number | null; callType?: string }> = ({ canFill = true, initial = null, callType = 'Burns' }) => {
  const [selected, setSelected] = useState<number | null>(initial);

  return (
    <>
      <SuggestedDestinationsPanel origin={ORIGIN} callType={callType} priority={3} selectedPoiId={selected} canFill={canFill} onSelect={setSelected} />
      <SelectedProbe value={selected} onPick={setSelected} />
    </>
  );
};

const SelectedProbe: React.FC<{ value: number | null; onPick: (poiId: number | null) => void }> = ({ value, onPick }) => {
  return (
    <>
      <Text testID="probe-selected">{value === null ? 'none' : String(value)}</Text>
      <Pressable testID="probe-pick-9" onPress={() => onPick(9)} />
      <Pressable testID="probe-clear" onPress={() => onPick(null)} />
    </>
  );
};

describe('Suggested destinations panel', () => {
  const fetchSuggestedDestinations = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    fetchSuggestedDestinations.mockReset();
    // SAFETY: the config fields the panel reads.
    setDepartmentConfig({ DestinationSuggestionMode: DestinationSuggestionModes.SuggestAndFill } as GetConfigResultData);
    usePoisStore.setState({
      fetchSuggestedDestinations,
      poiCapabilities: [
        { PoiCapabilityId: 'burn', Name: 'Burn Center', Sort: 1 },
        { PoiCapabilityId: 'heli', Name: 'Helipad', Sort: 2 },
      ],
      fetchPoiCapabilities: jest.fn(async () => undefined),
      poiTypes: [],
      fetchPoiTypes: jest.fn(async () => undefined),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const settle = async () => {
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await act(async () => undefined);
  };

  it('shows what the call needs and the ranked destinations, and fills an empty destination', async () => {
    fetchSuggestedDestinations.mockResolvedValue(answer());

    await render(<Form />);
    await settle();

    expect(fetchSuggestedDestinations).toHaveBeenCalledWith(expect.objectContaining({ latitude: 39.143, longitude: -119.756, type: 'Burns', priority: 3 }), expect.anything());
    expect(screen.getByTestId('suggested-destinations-requirements-applied', q)).toHaveTextContent(
      'pois.suggestions.rules:Burns · pois.suggestions.types:Hospitals · pois.suggestions.needs:Burn Center · pois.suggestions.prefers:Helipad'
    );
    expect(screen.queryByTestId('suggested-destinations-requirements-set-aside', q)).toBeNull();
    expect(screen.getByTestId('suggested-destinations-row-2-missing', q)).toHaveTextContent('pois.suggestions.missing:Burn Center');
    expect(screen.getByTestId('suggested-destinations-row-1-metrics', q)).toHaveTextContent('34:00 min · 53.0 km');
    expect(screen.getByTestId('probe-selected', q)).toHaveTextContent('1');
    expect(screen.getByTestId('suggested-destinations-filled', q)).toBeTruthy();
    expect(screen.getByTestId('suggested-destinations-row-1-selected', q)).toBeTruthy();
  });

  it('calls out a required capability a destination has but marked down now, and only a required one', async () => {
    const base = answer();
    fetchSuggestedDestinations.mockResolvedValue(
      answer({
        SuggestedPoiId: null,
        Destinations: [
          {
            ...base.Destinations[0],
            Poi: poi(1, 'Renown', { CapabilityIds: ['burn', 'heli'], Capabilities: ['Burn Center', 'Helipad'], AvailabilityStatus: PoiAvailabilityStatuses.Limited, UnavailableCapabilityIds: ['BURN', 'heli'] }),
            CanProvide: false,
            Tier: 2,
          },
          base.Destinations[1],
        ],
      })
    );

    await render(<Form />);
    await settle();

    expect(screen.getByTestId('suggested-destinations-row-1-down', q)).toHaveTextContent('pois.suggestions.down:Burn Center');
    expect(screen.queryByTestId('suggested-destinations-row-2-down', q)).toBeNull();
    expect(screen.getByTestId('probe-selected', q)).toHaveTextContent('none');
  });

  it('stops filling once the dispatcher picks a destination', async () => {
    fetchSuggestedDestinations.mockResolvedValue(answer());
    const { rerender } = await render(<Form />);
    await settle();

    await fireEvent.press(screen.getByTestId('probe-pick-9', q));
    fetchSuggestedDestinations.mockResolvedValue(answer({ SuggestedPoiId: 2 }));
    await rerender(<Form callType="Trauma" />);
    await settle();

    expect(screen.getByTestId('probe-selected', q)).toHaveTextContent('9');
  });

  it('uses a suggestion on press without filling on its own when the form may not fill', async () => {
    fetchSuggestedDestinations.mockResolvedValue(answer());

    await render(<Form canFill={false} />);
    await settle();

    expect(screen.getByTestId('probe-selected', q)).toHaveTextContent('none');

    await fireEvent.press(screen.getByTestId('suggested-destinations-row-2-use', q));

    expect(screen.getByTestId('probe-selected', q)).toHaveTextContent('2');
  });

  it('says when nothing meets the requirements and takes back its own fill', async () => {
    fetchSuggestedDestinations.mockResolvedValueOnce(answer()).mockResolvedValueOnce(answer({ SuggestedPoiId: null }));
    const { rerender } = await render(<Form />);
    await settle();
    expect(screen.getByTestId('probe-selected', q)).toHaveTextContent('1');

    await rerender(<Form callType="Trauma" />);
    await settle();

    expect(screen.getByTestId('suggested-destinations-none-meet', q)).toBeTruthy();
    expect(screen.getByTestId('probe-selected', q)).toHaveTextContent('none');
  });

  it('asks nothing and shows nothing while the department’s suggestions are off', async () => {
    // SAFETY: the config fields the panel reads.
    setDepartmentConfig({ DestinationSuggestionMode: DestinationSuggestionModes.Off } as GetConfigResultData);

    await render(<Form />);
    await settle();

    expect(fetchSuggestedDestinations).not.toHaveBeenCalled();
    expect(screen.queryByTestId('suggested-destinations', q)).toBeNull();
  });

  it('asks nothing when the loaded config has no suggestions mode (a server that predates them)', async () => {
    // SAFETY: a server that predates the config field.
    setDepartmentConfig({} as GetConfigResultData);
    fetchSuggestedDestinations.mockResolvedValue(answer());

    await render(<Form />);
    await settle();

    expect(fetchSuggestedDestinations).not.toHaveBeenCalled();
    expect(screen.queryByTestId('suggested-destinations', q)).toBeNull();
    expect(screen.getByTestId('probe-selected', q)).toHaveTextContent('none');
  });

  it('asks without a config and stops after the server answers that suggestions are off', async () => {
    // The department config could not be loaded: the answer decides.
    setDepartmentConfig(null);
    fetchSuggestedDestinations.mockResolvedValue(answer({ Mode: DestinationSuggestionModes.Off, SuggestedPoiId: null, Destinations: [] }));
    const { rerender } = await render(<Form />);
    await settle();
    await rerender(<Form callType="Trauma" />);
    await settle();

    expect(fetchSuggestedDestinations).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('suggested-destinations', q)).toBeNull();
  });

  it('says which matching rules were set aside, and why', async () => {
    fetchSuggestedDestinations.mockResolvedValue(
      answer({
        Requirements: {
          PoiTypeIds: [1],
          RequiredCapabilityIds: ['burn'],
          PreferredCapabilityIds: [],
          Rules: [{ DestinationRuleId: 'b', Name: 'Burns', Reason: null }],
          SetAsideRules: [
            { DestinationRuleId: 't', Name: 'Tender water', Reason: 'TypeConflict' },
            { DestinationRuleId: 'o', Name: 'Old helipads', Reason: 'TypesRemoved' },
            { DestinationRuleId: 'x', Name: 'Other', Reason: null },
          ],
        },
      })
    );

    await render(<Form />);
    await settle();

    expect(screen.getByTestId('suggested-destinations-requirements-applied', q)).toHaveTextContent('pois.suggestions.rules:Burns · pois.suggestions.types:Hospitals · pois.suggestions.needs:Burn Center');
    expect(screen.getByTestId('suggested-destinations-requirements-set-aside', q)).toHaveTextContent(
      'pois.suggestions.set_aside:pois.suggestions.set_aside_rule:Tender water,pois.suggestions.set_aside_type_conflict; pois.suggestions.set_aside_rule:Old helipads,pois.suggestions.set_aside_types_removed; Other'
    );
  });

  it('names an allowed type from the department’s POI types, and leaves out one nobody names', async () => {
    usePoisStore.setState({ poiTypes: [{ PoiTypeId: 5, Name: 'Burn centres', Color: '', ImagePath: '', Marker: '', IsDestination: true }] });
    fetchSuggestedDestinations.mockResolvedValue(answer({ Requirements: { PoiTypeIds: [5, 6], RequiredCapabilityIds: [], PreferredCapabilityIds: [], Rules: [], SetAsideRules: [] } }));

    await render(<Form />);
    await settle();

    expect(screen.getByTestId('suggested-destinations-requirements-applied', q)).toHaveTextContent(/^pois\.suggestions\.types:Burn centres$/);
    // Type 6 is named nowhere yet: the department's types are asked for.
    expect(usePoisStore.getState().fetchPoiTypes).toHaveBeenCalled();
  });

  it('drops the list when a re-ask fails, says so with a retry, and never fills from the old answer', async () => {
    fetchSuggestedDestinations.mockResolvedValueOnce(answer()).mockResolvedValueOnce(null);
    const { rerender } = await render(<Form />);
    await settle();
    expect(screen.getByTestId('probe-selected', q)).toHaveTextContent('1');

    await rerender(<Form callType="Trauma" />);
    await settle();

    expect(fetchSuggestedDestinations).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('suggested-destinations-failed', q)).toHaveTextContent(/pois\.suggestions\.failed/);
    // The answer for Burns is not shown as if it were Trauma's, and the destination it filled comes back out.
    expect(screen.queryByTestId('suggested-destinations-row-1', q)).toBeNull();
    expect(screen.queryByTestId('suggested-destinations-requirements', q)).toBeNull();
    expect(screen.getByTestId('probe-selected', q)).toHaveTextContent('none');

    fetchSuggestedDestinations.mockResolvedValueOnce(answer({ SuggestedPoiId: 2, Destinations: [answer().Destinations[1]] }));
    await fireEvent.press(screen.getByTestId('suggested-destinations-failed-retry', q));
    await settle();

    expect(fetchSuggestedDestinations).toHaveBeenCalledTimes(3);
    expect(fetchSuggestedDestinations).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'Trauma' }), expect.anything());
    expect(screen.queryByTestId('suggested-destinations-failed', q)).toBeNull();
    expect(screen.getByTestId('probe-selected', q)).toHaveTextContent('2');
  });

  it('shows no earlier answer while the answer for new inputs is on its way', async () => {
    fetchSuggestedDestinations.mockResolvedValueOnce(answer()).mockImplementationOnce(() => new Promise(() => undefined));
    const { rerender } = await render(<Form canFill={false} />);
    await settle();
    expect(screen.getByTestId('suggested-destinations-row-1-use', q)).toBeTruthy();

    await rerender(<Form canFill={false} callType="Trauma" />);
    await settle();

    expect(screen.getByTestId('suggested-destinations-loading', q)).toBeTruthy();
    expect(screen.queryByTestId('suggested-destinations-row-1-use', q)).toBeNull();
  });

  it('says so with a retry when the first ask fails', async () => {
    fetchSuggestedDestinations.mockResolvedValueOnce(null).mockResolvedValueOnce(answer());

    await render(<Form />);
    await settle();

    expect(screen.getByTestId('suggested-destinations-failed', q)).toBeTruthy();
    expect(screen.getByTestId('probe-selected', q)).toHaveTextContent('none');

    await fireEvent.press(screen.getByTestId('suggested-destinations-failed-retry', q));
    await settle();

    expect(screen.getByTestId('probe-selected', q)).toHaveTextContent('1');
  });
});
