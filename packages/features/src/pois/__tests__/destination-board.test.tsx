import '../../status/__tests__/test-setup';

import { usePoisStore } from '@resgrid/data';
import { type DestinationRuleResultData, type DestinationRulesResultData, DestinationSuggestionModes, PoiAvailabilityStatuses, type PoiResultData } from '@resgrid/models';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { activateVariant } from '../../calls/__tests__/test-utils';
import {
  countAvailability,
  destinationTypeOptions,
  EMPTY_DESTINATION_BOARD_FILTER,
  filterDestinations,
  ruleConditionLabelKey,
  ruleConditions,
  suggestionModeLabelKey,
  summarizeCapabilities,
} from '../lib/destination-board';
import DestinationsScreen from '../screens/destinations';

/** The dispatcher's Destinations screen (2026-11-19): availability, capabilities and destination rules in one place. */
const q = { includeHiddenElements: true } as const;

// SAFETY: test fixtures fill only the POI fields the destination board reads.
const poi = (PoiId: number, Name: string, extra: Partial<PoiResultData> = {}): PoiResultData =>
  ({
    PoiId,
    PoiTypeId: 1,
    PoiTypeName: 'Hospitals',
    Name,
    Address: '',
    Note: '',
    Latitude: 50.8,
    Longitude: 3.8,
    IsDestination: true,
    CapabilityIds: [],
    Capabilities: [],
    ...extra,
  }) as PoiResultData;

const ED = { CapabilityIds: ['ed'], Capabilities: ['Emergency Department'] };
const BURNS = { CapabilityIds: ['ed', 'burn'], Capabilities: ['Emergency Department', 'Burn Center'] };

const OPEN_ED = poi(1, 'AZ Sint-Jan', ED);
const BURN_DOWN = poi(2, 'UZ Gent', { ...BURNS, AvailabilityStatus: PoiAvailabilityStatuses.Limited, UnavailableCapabilityIds: ['BURN'], AvailabilityNote: 'Burn unit full' });
const DIVERSION = poi(3, 'AZ Groeninge', { ...ED, AvailabilityStatus: PoiAvailabilityStatuses.Diversion });
const CLOSED = poi(4, 'Jan Yperman', { ...ED, AvailabilityStatus: PoiAvailabilityStatuses.Closed });
const DRAFT_SITE = poi(5, 'Leie draft site', { PoiTypeId: 2, PoiTypeName: 'Water Sources', CapabilityIds: ['draft'], Capabilities: ['Drafting'] });
const ALL = [OPEN_ED, BURN_DOWN, DIVERSION, CLOSED, DRAFT_SITE];

const CAPABILITIES = [
  { PoiCapabilityId: 'burn', Name: 'Burn Center', Sort: 2 },
  { PoiCapabilityId: 'ed', Name: 'Emergency Department', Sort: 1 },
  { PoiCapabilityId: 'heli', Name: 'Helipad', Sort: 3 },
];

const rule = (extra: Partial<DestinationRuleResultData>): DestinationRuleResultData => ({
  DestinationRuleId: 'r',
  Name: 'Rule',
  CallTypeId: null,
  CallTypeName: null,
  CallPriority: null,
  CallPriorityName: null,
  UnitTypeId: null,
  UnitTypeName: null,
  PoiTypeIds: [],
  PoiTypeNames: [],
  RequiredCapabilityIds: [],
  RequiredCapabilityNames: [],
  PreferredCapabilityIds: [],
  PreferredCapabilityNames: [],
  MissingReferenceCount: 0,
  ...extra,
});

const RULES: DestinationRulesResultData = {
  Mode: DestinationSuggestionModes.SuggestAndFill,
  PreferredWithinMinutes: 3,
  Rules: [
    rule({ DestinationRuleId: 'ed', Name: 'Hospitals with an ED', PoiTypeIds: [1], PoiTypeNames: ['Hospitals'], RequiredCapabilityIds: ['ed'], RequiredCapabilityNames: ['Emergency Department'] }),
    rule({ DestinationRuleId: 'burns', Name: 'Burns', CallTypeId: 3, CallTypeName: 'Burns', RequiredCapabilityIds: ['burn'], RequiredCapabilityNames: ['Burn Center'] }),
    rule({
      DestinationRuleId: 'old',
      Name: 'Old helicopter rule',
      UnitTypeId: 9,
      CallPriority: 0,
      CallPriorityName: 'Low',
      PreferredCapabilityIds: ['heli'],
      PreferredCapabilityNames: ['Helipad'],
      MissingReferenceCount: 1,
    }),
  ],
};

describe('destination board helpers', () => {
  it('counts destinations by availability now', () => {
    expect(countAvailability(ALL)).toEqual({ total: 5, open: 2, limited: 1, diversion: 1, closed: 1 });
  });

  it('filters by availability, type, capability and text, by type then name', () => {
    expect(filterDestinations(ALL, EMPTY_DESTINATION_BOARD_FILTER).map((item) => item.PoiId)).toEqual([3, 1, 4, 2, 5]);
    expect(filterDestinations(ALL, { ...EMPTY_DESTINATION_BOARD_FILTER, status: 'not_open' }).map((item) => item.PoiId)).toEqual([3, 4, 2]);
    expect(filterDestinations(ALL, { ...EMPTY_DESTINATION_BOARD_FILTER, poiTypeId: 2 }).map((item) => item.PoiId)).toEqual([5]);
    expect(filterDestinations(ALL, { ...EMPTY_DESTINATION_BOARD_FILTER, capabilityId: 'BURN' }).map((item) => item.PoiId)).toEqual([2]);
    expect(filterDestinations(ALL, { ...EMPTY_DESTINATION_BOARD_FILTER, query: 'unit full' }).map((item) => item.PoiId)).toEqual([2]);
  });

  it('lists the destination types once each', () => {
    expect(destinationTypeOptions(ALL)).toEqual([
      { id: 1, name: 'Hospitals' },
      { id: 2, name: 'Water Sources' },
    ]);
  });

  it('summarizes capabilities in the department order, counting where they cannot be provided now', () => {
    expect(summarizeCapabilities(CAPABILITIES, ALL)).toEqual([
      { id: 'ed', name: 'Emergency Department', offeredBy: 4, unavailableAt: 1 },
      { id: 'burn', name: 'Burn Center', offeredBy: 1, unavailableAt: 1 },
      { id: 'heli', name: 'Helipad', offeredBy: 0, unavailableAt: 0 },
      // Named by a destination but missing from the department list (an older server): listed after.
      { id: 'draft', name: 'Drafting', offeredBy: 1, unavailableAt: 0 },
    ]);
  });

  it('reads a rule’s conditions and the suggestions setting', () => {
    expect(ruleConditions(RULES.Rules[0])).toEqual([]);
    expect(ruleConditions(RULES.Rules[2])).toEqual([
      { kind: 'priority', name: 'Low' },
      { kind: 'unit_type', name: null },
    ]);
    expect(ruleConditionLabelKey('call_type')).toBe('pois.destinations.rules.condition_call_type');
    expect(suggestionModeLabelKey(DestinationSuggestionModes.Suggest)).toBe('pois.destinations.rules.mode_suggest');
    expect(suggestionModeLabelKey(DestinationSuggestionModes.SuggestAndFill)).toBe('pois.destinations.rules.mode_fill');
    expect(suggestionModeLabelKey(undefined)).toBe('pois.destinations.rules.mode_off');
  });
});

describe('Destinations screen', () => {
  const fetchDestinationPois = jest.fn(async () => undefined);
  const fetchPoiCapabilities = jest.fn(async () => undefined);
  const fetchDestinationRules = jest.fn(async () => undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    usePoisStore.setState({ destinationPois: ALL, poiCapabilities: CAPABILITIES, destinationRules: RULES, fetchDestinationPois, fetchPoiCapabilities, fetchDestinationRules });
  });

  it('reads availability, capabilities and rules fresh on open', async () => {
    activateVariant('dispatch');

    await render(<DestinationsScreen />);

    expect(fetchDestinationPois).toHaveBeenCalledWith({ bypassCache: true });
    expect(fetchPoiCapabilities).toHaveBeenCalledWith({ bypassCache: true });
    expect(fetchDestinationRules).toHaveBeenCalledWith({ bypassCache: true });
  });

  it('lists every destination with its availability, and only those not open on request', async () => {
    activateVariant('dispatch');

    await render(<DestinationsScreen />);

    expect(screen.getByTestId('destination-row-2-availability', q)).toHaveTextContent('pois.availability.limited');
    expect(screen.getByTestId('destination-row-1-availability', q)).toHaveTextContent('pois.availability.open');
    expect(screen.getByText('Burn unit full', q)).toBeTruthy();
    expect(screen.getByTestId('destination-row-2-capability-burn', q)).toBeTruthy();
    expect(screen.getByTestId('destination-row-2-set', q)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('destinations-status-not-open', q));

    expect(screen.queryByTestId('destination-row-1', q)).toBeNull();
    expect(screen.getByTestId('destination-row-3', q)).toBeTruthy();
  });

  it('opens the availability sheet for a destination', async () => {
    activateVariant('dispatch');

    await render(<DestinationsScreen />);
    await fireEvent.press(screen.getByTestId('destination-row-3-set', q));

    await waitFor(() => expect(screen.getByTestId('poi-availability-sheet', q)).toBeTruthy());
  });

  it('shows capabilities and lists the destinations offering one when it is pressed', async () => {
    activateVariant('dispatch');

    await render(<DestinationsScreen />);
    await fireEvent.press(screen.getByTestId('destinations-tab-capabilities', q));

    expect(screen.getByTestId('destination-capability-burn-unavailable', q)).toBeTruthy();
    expect(screen.queryByTestId('destination-capability-heli-unavailable', q)).toBeNull();

    await fireEvent.press(screen.getByTestId('destination-capability-burn', q));

    expect(screen.getByTestId('destination-row-2', q)).toBeTruthy();
    expect(screen.queryByTestId('destination-row-1', q)).toBeNull();
  });

  it('shows the rules and the suggestions setting read-only', async () => {
    activateVariant('dispatch');

    await render(<DestinationsScreen initialTab="rules" />);

    expect(screen.getByTestId('destinations-rules-mode', q)).toHaveTextContent('pois.destinations.rules.mode_fill');
    expect(screen.getByTestId('destination-rule-ed-when', q)).toHaveTextContent('pois.destinations.rules.every_call');
    expect(screen.getByTestId('destination-rule-burns-requires', q)).toHaveTextContent('Burn Center');
    expect(screen.getByTestId('destination-rule-ed-types', q)).toHaveTextContent('Hospitals');
    expect(screen.getByTestId('destination-rule-burns-types', q)).toHaveTextContent('pois.destinations.rules.any_destination');
    expect(screen.getByTestId('destination-rule-old-prefers', q)).toHaveTextContent('Helipad');
    expect(screen.getByTestId('destination-rule-old-attention', q)).toBeTruthy();
    expect(screen.queryByTestId('destination-rule-ed-attention', q)).toBeNull();
  });

  it('says so when the rules could not be read', async () => {
    activateVariant('dispatch');
    usePoisStore.setState({ destinationRules: null });

    await render(<DestinationsScreen initialTab="rules" />);

    expect(screen.getByTestId('destinations-rules-unavailable', q)).toBeTruthy();
  });

  it('offers no availability change where the app may not set it', async () => {
    activateVariant('dispatch', { calls: { destinationAvailability: false } });

    await render(<DestinationsScreen />);

    expect(screen.getByTestId('destination-row-2', q)).toBeTruthy();
    expect(screen.queryByTestId('destination-row-2-set', q)).toBeNull();
  });
});
