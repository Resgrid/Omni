import './test-setup';

import { useNetInfo } from '@react-native-community/netinfo';
import { buildNewCallInput, type CreateCallRequest } from '@resgrid/api';
import { useCallDetailStore, useCallsStore, usePoisStore, useRoutesStore } from '@resgrid/data';
import { setDepartmentConfig } from '@resgrid/features/department-config';
import { DestinationSuggestionModes, type GetConfigResultData, type NewCallFieldRuleData, type PoiResultData, type SuggestedDestinationsResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { resetCallFormHookPointsForTests } from '../hook-points';
import { createFieldPolicy } from '../lib/field-policy';
import CallFormScreen from '../screens/call-form';
import { activateVariant, setRights } from './test-utils';

// Destination rules on the Omni call form (Core M0317): suggested destinations under the destination POI, and "Suggest and fill".
const mockRules: NewCallFieldRuleData[] = [];

jest.mock('../hooks/use-call-form-data', () => ({
  useNewCallFieldPolicy: () => mockCreatePolicy(mockRules),
  useCallTemplates: () => ({ templates: [], isLoading: false }),
  useDispatchRecipients: () => ({ recipients: { personnel: [], groups: [], roles: [], units: [] }, isLoading: false }),
}));

const mockCreatePolicy = (rules: NewCallFieldRuleData[]) => createFieldPolicy(rules, true);
const mockCreateCall = jest.fn();
const mockFetchSuggested = jest.fn();

// SAFETY: the form and the panel read only these fields of a destination POI.
const poi = (PoiId: number, Name: string): PoiResultData =>
  ({
    PoiId,
    PoiTypeId: 1,
    Name,
    Address: '',
    Note: '',
    Color: '',
    ImagePath: '',
    Marker: '',
    PoiTypeName: 'Hospitals',
    Latitude: 39.2,
    Longitude: -119.8,
    IsDestination: true,
    CapabilityIds: [],
    Capabilities: [],
  }) as PoiResultData;

const answer = (SuggestedPoiId: number | null): SuggestedDestinationsResultData => ({
  Mode: DestinationSuggestionModes.SuggestAndFill,
  PreferredWithinMinutes: 3,
  SuggestedPoiId,
  Requirements: { PoiTypeIds: [], RequiredCapabilityIds: [], PreferredCapabilityIds: [], Rules: [], SetAsideRules: [] },
  Destinations: [
    { Poi: poi(1, 'Renown'), DistanceMeters: 40000, TravelSeconds: 2040, TravelDistanceMeters: 53000, CanProvide: true, Status: 0, MeetsRequirements: true, MissingCapabilityIds: [], PreferredCapabilityIds: [], Tier: 0 },
    { Poi: poi(2, 'CTRMC'), DistanceMeters: 6000, TravelSeconds: 720, TravelDistanceMeters: 11000, CanProvide: true, Status: 0, MeetsRequirements: true, MissingCapabilityIds: [], PreferredCapabilityIds: [], Tier: 0 },
  ],
});

// SAFETY: the form hands the store's createCall a CreateCallRequest; the mock only records it.
const lastCreateRequest = () => mockCreateCall.mock.calls.at(-1)?.[0] as CreateCallRequest;

beforeEach(() => {
  mockCreateCall.mockReset().mockResolvedValue({ outcome: 'sent', id: 'local-new' });
  mockFetchSuggested.mockReset().mockResolvedValue(answer(1));
  resetCallFormHookPointsForTests();
  useToastStore.getState().clearToasts();
  // SAFETY: the form reads only the two connectivity flags of the NetInfo state.
  jest.mocked(useNetInfo).mockReturnValue({ isConnected: true, isInternetReachable: true } as never);
  setRights({});
  // SAFETY: the config field the panel reads.
  setDepartmentConfig({ DestinationSuggestionMode: DestinationSuggestionModes.SuggestAndFill } as GetConfigResultData);
  useCallsStore.setState({ callPriorities: [], callTypes: [], destinationPois: [poi(1, 'Renown'), poi(2, 'CTRMC')], queuedCalls: {}, fetchCallFormData: jest.fn(async () => undefined), createCall: mockCreateCall });
  useCallDetailStore.setState({ details: {}, fetchCallDetail: jest.fn(async () => undefined) });
  usePoisStore.setState({
    pois: [],
    poiCapabilities: [],
    loading: {},
    errors: {},
    fetchPois: jest.fn(async () => undefined),
    fetchPoiCapabilities: jest.fn(async () => undefined),
    fetchSuggestedDestinations: mockFetchSuggested,
  });
  useRoutesStore.setState({ callRoutePlans: [], fetchCallRoutePlans: jest.fn(async () => undefined) });
});

const placeCall = async () => {
  await fireEvent.changeText(screen.getByTestId('call-form-name'), 'Burns');
  await fireEvent.changeText(screen.getByTestId('call-form-nature'), 'Kitchen fire, burns');
  await fireEvent.changeText(screen.getByTestId('call-form-latitude'), '39.143, -119.756');
};

describe('call form: suggested destinations', () => {
  it('fills an empty destination of a new call with the best suggestion, and the call is sent with it', async () => {
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await placeCall();

    await waitFor(() => expect(screen.getByTestId('call-form-destination')).toHaveTextContent('Renown'));
    expect(mockFetchSuggested).toHaveBeenCalledWith(expect.objectContaining({ latitude: 39.143, longitude: -119.756 }), expect.anything());
    expect(screen.getByTestId('call-form-destination-suggestions-filled')).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(buildNewCallInput(lastCreateRequest())).toMatchObject({ DestinationPoiId: 1 });
  });

  it('lets the dispatcher use another suggestion, and leaves a free location alone', async () => {
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await placeCall();
    await waitFor(() => expect(screen.getByTestId('call-form-destination-suggestions-row-2-use')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('call-form-destination-suggestions-row-2-use'));
    expect(screen.getByTestId('call-form-destination')).toHaveTextContent('CTRMC');

    // A free location (address or point) is the dispatcher's: no suggestions there.
    await fireEvent.press(screen.getByTestId('call-form-destination-kind-location'));
    expect(screen.queryByTestId('call-form-destination-suggestions')).toBeNull();
  });

  it('shows nothing and asks nothing while the department’s suggestions are off', async () => {
    // SAFETY: the config field the panel reads.
    setDepartmentConfig({ DestinationSuggestionMode: DestinationSuggestionModes.Off } as GetConfigResultData);
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await placeCall();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 600)));

    expect(mockFetchSuggested).not.toHaveBeenCalled();
    expect(screen.queryByTestId('call-form-destination-suggestions')).toBeNull();
    expect(screen.getByTestId('call-form-destination')).toHaveTextContent('calls.destination_poi_select');
  });

  it('asks nothing when the loaded config has no suggestions mode (a server that predates them)', async () => {
    // SAFETY: a loaded config from a server without the field.
    setDepartmentConfig({} as GetConfigResultData);
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await placeCall();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 600)));

    expect(mockFetchSuggested).not.toHaveBeenCalled();
    expect(screen.queryByTestId('call-form-destination-suggestions')).toBeNull();
  });

  it('asks when the department config could not be loaded, and lets the answer decide', async () => {
    setDepartmentConfig(null);
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await placeCall();

    await waitFor(() => expect(screen.getByTestId('call-form-destination')).toHaveTextContent('Renown'));
    expect(mockFetchSuggested).toHaveBeenCalled();
  });

  it('keeps a destination cleared by hand empty across a switch to an address or point and back', async () => {
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await placeCall();
    await waitFor(() => expect(screen.getByTestId('call-form-destination')).toHaveTextContent('Renown'));

    await fireEvent.press(screen.getByTestId('call-form-destination-clear'));
    expect(screen.getByTestId('call-form-destination')).toHaveTextContent('calls.destination_poi_select');

    await fireEvent.press(screen.getByTestId('call-form-destination-kind-location'));
    await fireEvent.press(screen.getByTestId('call-form-destination-kind-poi'));

    // The panel is back and asks again; its answer must not fill what the dispatcher cleared.
    await waitFor(() => expect(mockFetchSuggested).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('call-form-destination-suggestions-row-1-use')).toBeTruthy());
    expect(screen.getByTestId('call-form-destination')).toHaveTextContent('calls.destination_poi_select');
    expect(screen.queryByTestId('call-form-destination-suggestions-filled')).toBeNull();
  });

  it('fills again after a switch away and back that only took out its own fill', async () => {
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await placeCall();
    await waitFor(() => expect(screen.getByTestId('call-form-destination')).toHaveTextContent('Renown'));

    await fireEvent.press(screen.getByTestId('call-form-destination-kind-location'));
    await fireEvent.press(screen.getByTestId('call-form-destination-kind-poi'));

    await waitFor(() => expect(mockFetchSuggested).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('call-form-destination')).toHaveTextContent('Renown'));
    expect(screen.getByTestId('call-form-destination-suggestions-filled')).toBeTruthy();
  });
});
