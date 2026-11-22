import './test-setup';

import { useNetInfo } from '@react-native-community/netinfo';
import { buildEditCallInput, type UpdateCallRequest } from '@resgrid/api';
import { featureFlagsStore } from '@resgrid/auth';
import { useAiDestinationAdviceStore, useCallDetailStore, useCallsStore, useCallVideoFeedsStore, useCheckInTimersStore, usePoisStore, useRoutesStore } from '@resgrid/data';
import { type AiDestinationAdviceData, AiDestinationAdviceStates, CallSources, IntakeChannelTypes, IntakeScreenings, type NewCallFieldRuleData, type PoiResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { CallCard } from '../components/call-card';
import { resetCallFormHookPointsForTests } from '../hook-points';
import { callIntakeSource, intakeScreeningLabelKey, intakeSourceLabel } from '../lib/call-source';
import { createFieldPolicy } from '../lib/field-policy';
import CallDetailScreen from '../screens/call-detail';
import CallFormScreen from '../screens/call-form';
import { activateVariant, makeCall, setRights } from './test-utils';

/**
 * Calls from external intake (CallSource 6/7, M0323) say where they came from, and Enhanced AI destination advice shows on call
 * detail and the call edit form (call-intake-and-ai-destinations-plan.md §7, D4).
 */
const q = { includeHiddenElements: true } as const;

jest.mock('../hooks/use-call-form-data', () => ({
  useNewCallFieldPolicy: () => mockCreatePolicy([]),
  useCallTemplates: () => ({ templates: [], isLoading: false }),
  useDispatchRecipients: () => ({ recipients: { personnel: [], groups: [], roles: [], units: [] }, isLoading: false }),
}));

const mockCreatePolicy = (rules: NewCallFieldRuleData[]) => createFieldPolicy(rules, true);
const mockUpdateCall = jest.fn();
const mockFetchCallDetail = jest.fn();

// SAFETY: the form reads only these fields of a destination POI.
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
    PoiTypeName: 'Hospitals',
    Latitude: 39.2,
    Longitude: -119.8,
    IsDestination: true,
    CapabilityIds: [],
    Capabilities: [],
  }) as PoiResultData;

const advice = (extra: Partial<AiDestinationAdviceData> = {}): AiDestinationAdviceData => ({
  Id: 'a1',
  CallId: 42,
  CurrentPoiId: null,
  CurrentPoiName: null,
  RecommendedPoiId: 7,
  RecommendedPoiName: 'Trauma Center',
  RecommendedPoiStatus: null,
  RequiredCapabilities: [],
  Rationale: 'Gunshot wound in the latest note.',
  Confidence: 0.9,
  IsChange: true,
  IsConfident: true,
  State: AiDestinationAdviceStates.Open,
  CreatedOn: '2026-11-19T10:00:00Z',
  Trigger: 4,
  ...extra,
});

const applyAdvice = jest.fn();

const intakeCall = (CallSource: number, IntakeChannelType: number | null, IntakeChannelName: string | null) => ({ CallSource, IntakeChannelType, IntakeChannelName });

describe('intake source', () => {
  it('names the channel by type and name, falls back to the generic label, and says nothing for other calls', () => {
    const label = (call: ReturnType<typeof intakeCall>) => {
      const source = callIntakeSource(call);

      return source ? intakeSourceLabel(source) : null;
    };

    expect(label(intakeCall(CallSources.Intake, IntakeChannelTypes.Sms, 'Hospital transfer line'))).toEqual({ key: 'calls.intake_source.via_sms_named', name: 'Hospital transfer line' });
    expect(label(intakeCall(CallSources.Intake, IntakeChannelTypes.GoogleChat, '  '))).toEqual({ key: 'calls.intake_source.via_google_chat' });
    expect(label(intakeCall(CallSources.VoiceIntake, IntakeChannelTypes.Voice, null))).toEqual({ key: 'calls.intake_source.via_voice' });
    expect(label(intakeCall(CallSources.Intake, null, null))).toEqual({ key: 'calls.intake_source.intake' });
    expect(label(intakeCall(CallSources.VoiceIntake, null, 'Main line'))).toEqual({ key: 'calls.intake_source.voice_named', name: 'Main line' });
    // A channel type newer than this build: the generic label, never a blank.
    expect(label(intakeCall(CallSources.Intake, 42, null))).toEqual({ key: 'calls.intake_source.intake' });
    expect(label(intakeCall(CallSources.User, IntakeChannelTypes.Sms, 'x'))).toBeNull();
    expect(callIntakeSource({ CallSource: undefined, IntakeChannelName: undefined, IntakeChannelType: undefined })).toBeNull();
  });

  it('shows on a call card, and is part of what a screen reader hears', async () => {
    await render(<CallCard call={makeCall('5', intakeCall(CallSources.Intake, IntakeChannelTypes.Email, 'Dispatch inbox'))} onPress={jest.fn()} />);

    expect(screen.getByTestId('call-card-5-intake-source', q)).toHaveTextContent('calls.intake_source.via_email_named:Dispatch inbox');
    expect(screen.getByRole('button', q).props.accessibilityLabel).toContain('calls.intake_source.via_email_named:Dispatch inbox');
  });

  it('is not on a call a person logged, nor from an older server', async () => {
    await render(<CallCard call={makeCall('6', { CallSource: CallSources.User })} />);
    expect(screen.queryByTestId('call-card-6-intake-source', q)).toBeNull();
  });

  it('labels a screened intake call (Core M0326) and nothing else', () => {
    expect(intakeScreeningLabelKey({ CallSource: CallSources.Intake, IntakeScreening: IntakeScreenings.LikelyNotIncident })).toBe('calls.intake_screening.likely_not_incident');
    expect(intakeScreeningLabelKey({ CallSource: CallSources.VoiceIntake, IntakeScreening: IntakeScreenings.RepeatSender })).toBe('calls.intake_screening.repeat_sender');
    expect(intakeScreeningLabelKey({ CallSource: CallSources.Intake, IntakeScreening: IntakeScreenings.DismissedAsSpam })).toBe('calls.intake_screening.dismissed_as_spam');
    expect(intakeScreeningLabelKey({ CallSource: CallSources.Intake, IntakeScreening: IntakeScreenings.None })).toBeNull();
    expect(intakeScreeningLabelKey({ CallSource: CallSources.Intake, IntakeScreening: 42 })).toBeNull();
    expect(intakeScreeningLabelKey({ CallSource: CallSources.Intake, IntakeScreening: undefined })).toBeNull();
    expect(intakeScreeningLabelKey({ CallSource: CallSources.User, IntakeScreening: IntakeScreenings.LikelyNotIncident })).toBeNull();
  });
});

describe('call detail and the call edit form', () => {
  beforeEach(() => {
    setRights({});
    resetCallFormHookPointsForTests();
    useToastStore.getState().clearToasts();
    mockUpdateCall.mockReset().mockResolvedValue(undefined);
    mockFetchCallDetail.mockReset().mockResolvedValue(undefined);
    applyAdvice.mockReset().mockResolvedValue({ ok: true, outcome: 'Applied', advice: advice({ State: AiDestinationAdviceStates.Applied }) });
    // SAFETY: the form reads only the two connectivity flags of the NetInfo state.
    jest.mocked(useNetInfo).mockReturnValue({ isConnected: true, isInternetReachable: true } as never);
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '42' });
    featureFlagsStore.setState({ flags: { 'Ai.DestinationAdvice': { enabled: true } }, isLoaded: true });
    useAiDestinationAdviceStore.setState({
      entries: { '42': { available: true, canApply: true, advice: advice(), fetchedAt: 1 } },
      unsupported: false,
      busy: {},
      fetchAdvice: jest.fn(async () => null),
      applyAdvice,
    });
    useCallsStore.setState({ callPriorities: [], callTypes: [], destinationPois: [poi(3, 'General'), poi(7, 'Trauma Center')], queuedCalls: {}, fetchCallFormData: jest.fn(async () => undefined) });
    useCallDetailStore.setState({
      details: {
        '42': {
          call: makeCall('42', { Name: 'Shooting', Latitude: '39.1', Longitude: '-119.7', DestinationAddress: '5 Oak Ave', ...intakeCall(CallSources.VoiceIntake, IntakeChannelTypes.Voice, 'County line') }),
          // SAFETY: the screens read only the dispatches from the extra data.
          extraData: { Dispatches: [], Activity: [], Protocols: [] } as never,
          notes: [],
          images: null,
          files: null,
          audio: null,
          fetchedAt: 1,
        },
      },
      loading: {},
      errors: {},
      fetchCallDetail: mockFetchCallDetail,
      updateCall: mockUpdateCall,
      fetchCallNotes: jest.fn(async () => undefined),
      fetchCallSiteInfo: jest.fn(async () => undefined),
      fetchCallLocationHistory: jest.fn(async () => undefined),
    });
    usePoisStore.setState({ pois: [], loading: {}, errors: {}, fetchPois: jest.fn(async () => undefined), fetchSuggestedDestinations: jest.fn(async () => null) });
    useRoutesStore.setState({ callRoutePlans: [], fetchCallRoutePlans: jest.fn(async () => undefined) });
    useCheckInTimersStore.setState({ statusesByCall: {}, fetchTimerStatuses: jest.fn(async () => undefined) });
    useCallVideoFeedsStore.setState({ feedsByCall: {}, fetchFeeds: jest.fn(async () => undefined) });
  });

  afterEach(() => act(() => featureFlagsStore.setState({ flags: {} })));

  it('call detail says which intake channel the call came through and shows the advice; Apply reads the call again', async () => {
    activateVariant('dispatch');
    await render(<CallDetailScreen />);

    expect(screen.getByTestId('call-detail-intake-source', q)).toHaveTextContent('calls.intake_source.via_voice_named:County line');
    expect(screen.getByTestId('call-detail-ai-advice-headline', q)).toHaveTextContent('pois.ai_advice.consider:Trauma Center');
    // A free destination (an address) is what the advice would replace.
    expect(screen.getByTestId('call-detail-ai-advice-current', q)).toHaveTextContent('pois.ai_advice.current_free');

    mockFetchCallDetail.mockClear();
    await act(async () => fireEvent.press(screen.getByTestId('call-detail-ai-advice-apply', q)));

    expect(applyAdvice).toHaveBeenCalledWith('42', 'a1');
    expect(mockFetchCallDetail).toHaveBeenCalledWith('42', { bypassCache: true });
  });

  it('BigBoard shows the advice read-only', async () => {
    activateVariant('bigboard');
    await render(<CallDetailScreen />);

    expect(screen.getByTestId('call-detail-ai-advice-headline', q)).toBeTruthy();
    expect(screen.queryByTestId('call-detail-ai-advice-apply', q)).toBeNull();
    expect(screen.queryByTestId('call-detail-ai-advice-ask', q)).toBeNull();
  });

  it('the edit form takes the applied destination into its field (replacing the free destination), so the save keeps it', async () => {
    activateVariant('dispatch');
    await render(<CallFormScreen mode="edit" callId="42" />);
    await waitFor(() => expect(screen.getByTestId('call-form-name').props.value).toBe('Shooting'));

    expect(screen.getByTestId('call-form-destination-address', q).props.value).toBe('5 Oak Ave');
    await act(async () => fireEvent.press(screen.getByTestId('call-form-ai-advice-apply', q)));

    expect(applyAdvice).toHaveBeenCalledWith('42', 'a1');
    expect(screen.getByTestId('call-form-destination', q)).toHaveTextContent('Trauma Center');
    expect(screen.getByTestId('call-form-ai-advice-selected', q)).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit', q)));
    // SAFETY: the form hands the store's updateCall an UpdateCallRequest; the mock only records it.
    const request = mockUpdateCall.mock.calls.at(-1)?.[0] as UpdateCallRequest;

    expect(buildEditCallInput(request)).toMatchObject({ DestinationPoiId: 7, DestinationAddress: '' });
  });

  it('a new call has no advice card (there is no call to advise on yet)', async () => {
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);

    expect(screen.queryByTestId('call-form-ai-advice', q)).toBeNull();
  });
});
