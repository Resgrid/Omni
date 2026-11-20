import '../../status/__tests__/test-setup';

import { featureFlagsStore } from '@resgrid/auth';
import { type AiDestinationAdviceActionResult, type AiDestinationAdviceEntry, useAiDestinationAdviceStore } from '@resgrid/data';
import { type AiDestinationAdviceData, AiDestinationAdviceStates, PoiAvailabilityStatuses } from '@resgrid/models';
import { emitRealtimeEvent } from '@resgrid/realtime';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { AiDestinationAdviceCard } from '../components/ai-destination-advice-card';
import { adviceErrorMessage, adviceOutcomeMessage, adviceRecommendedPoiId, confidencePercent, isLowConfidenceChange, recommendedAvailability } from '../lib/ai-destination-advice';

/** Enhanced AI destination advice on call detail and the call form (call-intake-and-ai-destinations-plan.md §7, D4). */
const q = { includeHiddenElements: true } as const;

const advice = (extra: Partial<AiDestinationAdviceData> = {}): AiDestinationAdviceData => ({
  Id: 'a1',
  CallId: 12,
  CurrentPoiId: 3,
  CurrentPoiName: 'General',
  RecommendedPoiId: 7,
  RecommendedPoiName: 'Trauma Center',
  RecommendedPoiStatus: PoiAvailabilityStatuses.Limited,
  RequiredCapabilities: [
    { Id: 'trauma', Name: 'Level I Trauma' },
    { Id: 'ct', Name: 'CT' },
  ],
  Rationale: '<b>Penetrating</b> injury in the latest note.',
  Confidence: 0.824,
  IsChange: true,
  IsConfident: true,
  State: AiDestinationAdviceStates.Open,
  CreatedOn: '2026-11-19T10:00:00Z',
  Trigger: 4,
  ...extra,
});

const entry = (extra: Partial<AiDestinationAdviceEntry> = {}): AiDestinationAdviceEntry => ({ available: true, canApply: true, advice: advice(), fetchedAt: 1, ...extra });

let fetchAdvice: jest.Mock;
let requestAdvice: jest.Mock;
let applyAdvice: jest.Mock;
let dismissAdvice: jest.Mock;

const setEntry = (value: AiDestinationAdviceEntry | undefined) => act(() => useAiDestinationAdviceStore.setState({ entries: value ? { '12': value } : {} }));

beforeEach(() => {
  featureFlagsStore.setState({ flags: { 'Ai.DestinationAdvice': { enabled: true } }, isLoaded: true });
  fetchAdvice = jest.fn(async () => null);
  requestAdvice = jest.fn(async (): Promise<AiDestinationAdviceActionResult> => ({ ok: true, outcome: 'Advised', advice: advice() }));
  applyAdvice = jest.fn(async (): Promise<AiDestinationAdviceActionResult> => ({ ok: true, outcome: 'Applied', advice: advice({ State: AiDestinationAdviceStates.Applied }) }));
  dismissAdvice = jest.fn(async (): Promise<AiDestinationAdviceActionResult> => ({ ok: true, outcome: 'Dismissed', advice: advice({ State: AiDestinationAdviceStates.Dismissed }) }));
  useAiDestinationAdviceStore.setState({ entries: { '12': entry() }, unsupported: false, busy: {}, fetchAdvice, requestAdvice, applyAdvice, dismissAdvice });
});

afterEach(() => act(() => featureFlagsStore.setState({ flags: {} })));

describe('advice helpers', () => {
  it('words each outcome, and an unknown one as a failure', () => {
    expect(adviceOutcomeMessage('Advised')).toBeNull();
    expect(adviceOutcomeMessage(null)).toBeNull();
    expect(adviceOutcomeMessage('Applied', 'Trauma Center')).toEqual({ key: 'pois.ai_advice.outcome.applied', tone: 'success', name: 'Trauma Center' });
    expect(adviceOutcomeMessage('Busy')).toEqual({ key: 'pois.ai_advice.outcome.busy', tone: 'warning' });
    expect(adviceOutcomeMessage('NothingToApply')?.key).toBe('pois.ai_advice.outcome.nothing_to_apply');
    expect(adviceOutcomeMessage('SomethingNew')).toEqual({ key: 'pois.ai_advice.error.failed', tone: 'error' });
    expect(adviceErrorMessage('offline')).toEqual({ key: 'pois.ai_advice.error.offline', tone: 'error' });
  });

  it('reads confidence, low confidence, availability and the recommended POI', () => {
    expect(confidencePercent(0.824)).toBe(82);
    expect(confidencePercent(7)).toBe(100);
    expect(confidencePercent(Number.NaN)).toBe(0);
    expect(isLowConfidenceChange({ IsChange: true, IsConfident: false })).toBe(true);
    // "Keep the current destination" is never a confident change, and never low confidence either.
    expect(isLowConfidenceChange({ IsChange: false, IsConfident: false })).toBe(false);
    expect(recommendedAvailability({ RecommendedPoiStatus: 2 })).toBe(PoiAvailabilityStatuses.Diversion);
    expect(recommendedAvailability({ RecommendedPoiStatus: 9 })).toBe(PoiAvailabilityStatuses.Open);
    expect(adviceRecommendedPoiId(advice())).toBe(7);
    expect(adviceRecommendedPoiId(advice({ RecommendedPoiId: null }))).toBeNull();
    expect(adviceRecommendedPoiId(advice({ State: AiDestinationAdviceStates.Dismissed }))).toBeNull();
    expect(adviceRecommendedPoiId(null)).toBeNull();
  });
});

describe('AiDestinationAdviceCard', () => {
  it('shows nothing and asks nothing while Ai.DestinationAdvice is off', async () => {
    featureFlagsStore.setState({ flags: {} });
    await render(<AiDestinationAdviceCard callId="12" canAct />);

    expect(screen.queryByTestId('ai-destination-advice', q)).toBeNull();
    expect(fetchAdvice).not.toHaveBeenCalled();
  });

  it('shows nothing when the department may not use advice, or on an older server', async () => {
    await setEntry(entry({ available: false, advice: null }));
    const { rerender } = await render(<AiDestinationAdviceCard callId="12" canAct />);

    expect(fetchAdvice).toHaveBeenCalledWith('12');
    expect(screen.queryByTestId('ai-destination-advice', q)).toBeNull();

    await act(() => useAiDestinationAdviceStore.setState({ entries: { '12': entry() }, unsupported: true }));
    await rerender(<AiDestinationAdviceCard callId="12" canAct />);
    expect(screen.queryByTestId('ai-destination-advice', q)).toBeNull();
  });

  it('shows the recommendation, its availability, what the call needs, the reasoning as plain text and how sure it is', async () => {
    await render(<AiDestinationAdviceCard callId={12} canAct />);

    expect(screen.getByTestId('ai-destination-advice-headline', q)).toHaveTextContent('pois.ai_advice.consider:Trauma Center');
    expect(screen.getByTestId('ai-destination-advice-availability', q)).toHaveTextContent('pois.availability.limited');
    expect(screen.getByTestId('ai-destination-advice-current', q)).toHaveTextContent('pois.ai_advice.current:General');
    expect(screen.getByTestId('ai-destination-advice-needs', q)).toHaveTextContent('pois.suggestions.needs:Level I Trauma, CT');
    // Model text is never rendered as markup.
    expect(screen.getByTestId('ai-destination-advice-rationale', q)).toHaveTextContent('<b>Penetrating</b> injury in the latest note.');
    expect(screen.getByTestId('ai-destination-advice-meta', q)).toHaveTextContent(/^pois\.ai_advice\.confidence:82/);
    expect(screen.queryByTestId('ai-destination-advice-low-confidence', q)).toBeNull();
    expect(screen.getByTestId('ai-destination-advice-apply', q)).toBeTruthy();
    expect(screen.getByTestId('ai-destination-advice-dismiss', q)).toBeTruthy();
    expect(screen.getByTestId('ai-destination-advice-ask', q)).toBeTruthy();
  });

  it('marks a change below the minimum confidence, and says to keep the destination when nothing better exists', async () => {
    await setEntry(entry({ advice: advice({ IsConfident: false }) }));
    const { rerender } = await render(<AiDestinationAdviceCard callId="12" canAct />);

    expect(screen.getByTestId('ai-destination-advice-low-confidence', q)).toHaveTextContent('pois.ai_advice.low_confidence');

    await setEntry(entry({ advice: advice({ RecommendedPoiId: null, RecommendedPoiName: null, IsChange: false, IsConfident: false }) }));
    await rerender(<AiDestinationAdviceCard callId="12" canAct />);
    expect(screen.getByTestId('ai-destination-advice-headline', q)).toHaveTextContent('pois.ai_advice.keep');
    expect(screen.queryByTestId('ai-destination-advice-apply', q)).toBeNull();
    expect(screen.queryByTestId('ai-destination-advice-low-confidence', q)).toBeNull();

    await setEntry(entry({ advice: advice({ CurrentPoiId: null, CurrentPoiName: null, RecommendedPoiId: null, IsChange: false }) }));
    await rerender(<AiDestinationAdviceCard callId="12" canAct hasFreeDestination />);
    expect(screen.getByTestId('ai-destination-advice-current', q)).toHaveTextContent('pois.ai_advice.current_free');
  });

  it('offers no action to someone who may not change the call (the app or the server says so)', async () => {
    const { rerender } = await render(<AiDestinationAdviceCard callId="12" canAct={false} />);

    expect(screen.getByTestId('ai-destination-advice-headline', q)).toBeTruthy();
    expect(screen.queryByTestId('ai-destination-advice-apply', q)).toBeNull();
    expect(screen.queryByTestId('ai-destination-advice-ask', q)).toBeNull();

    await setEntry(entry({ canApply: false }));
    await rerender(<AiDestinationAdviceCard callId="12" canAct />);
    expect(screen.queryByTestId('ai-destination-advice-dismiss', q)).toBeNull();
  });

  it('applies the advice and hands the POI to the screen (the form sets its field, detail reads the call again)', async () => {
    const onApplied = jest.fn();

    await render(<AiDestinationAdviceCard callId="12" canAct onApplied={onApplied} />);
    await act(async () => fireEvent.press(screen.getByTestId('ai-destination-advice-apply', q)));

    expect(applyAdvice).toHaveBeenCalledWith('12', 'a1');
    expect(onApplied).toHaveBeenCalledWith(7, 'Trauma Center');
    expect(screen.getByTestId('ai-destination-advice-message', q)).toHaveTextContent('pois.ai_advice.outcome.applied:Trauma Center');
  });

  it('says why Apply did nothing, and never moves the form then', async () => {
    const onApplied = jest.fn();

    applyAdvice.mockResolvedValueOnce({ ok: true, outcome: 'DestinationGone', advice: advice() });
    await render(<AiDestinationAdviceCard callId="12" canAct onApplied={onApplied} />);
    await act(async () => fireEvent.press(screen.getByTestId('ai-destination-advice-apply', q)));

    expect(onApplied).not.toHaveBeenCalled();
    expect(screen.getByTestId('ai-destination-advice-message', q)).toHaveTextContent('pois.ai_advice.outcome.destination_gone');

    applyAdvice.mockResolvedValueOnce({ ok: false, error: 'offline' });
    await act(async () => fireEvent.press(screen.getByTestId('ai-destination-advice-apply', q)));
    expect(screen.getByTestId('ai-destination-advice-message', q)).toHaveTextContent('pois.ai_advice.error.offline');
  });

  it('reads "Selected" in a form that already holds the recommendation', async () => {
    await render(<AiDestinationAdviceCard callId="12" canAct selectedPoiId={7} />);

    expect(screen.getByTestId('ai-destination-advice-selected', q)).toHaveTextContent('pois.suggestions.selected');
    expect(screen.queryByTestId('ai-destination-advice-apply', q)).toBeNull();
  });

  it('dismisses with an optional reason', async () => {
    await render(<AiDestinationAdviceCard callId="12" canAct />);
    await fireEvent.press(screen.getByTestId('ai-destination-advice-dismiss', q));
    await fireEvent.changeText(screen.getByTestId('ai-destination-advice-dismiss-reason', q), 'Family asked for General');
    await act(async () => fireEvent.press(screen.getByTestId('ai-destination-advice-dismiss-confirm', q)));

    expect(dismissAdvice).toHaveBeenCalledWith('12', 'a1', 'Family asked for General');
    expect(screen.queryByTestId('ai-destination-advice-dismiss-form', q)).toBeNull();
    expect(screen.getByTestId('ai-destination-advice-message', q)).toHaveTextContent('pois.ai_advice.outcome.dismissed');
  });

  it('asks Enhanced AI, shows it is working, and says why it could not advise', async () => {
    await setEntry(entry({ advice: null }));
    await render(<AiDestinationAdviceCard callId="12" canAct />);

    expect(screen.getByTestId('ai-destination-advice-none', q)).toHaveTextContent('pois.ai_advice.none');

    await act(async () => useAiDestinationAdviceStore.setState({ busy: { '12': 'ask' } }));
    expect(screen.getByTestId('ai-destination-advice-asking', q)).toHaveTextContent('pois.ai_advice.asking');
    await act(async () => useAiDestinationAdviceStore.setState({ busy: {} }));

    requestAdvice.mockResolvedValueOnce({ ok: true, outcome: 'NoLocation', advice: null });
    await act(async () => fireEvent.press(screen.getByTestId('ai-destination-advice-ask', q)));

    expect(requestAdvice).toHaveBeenCalledWith('12');
    expect(screen.getByTestId('ai-destination-advice-message', q)).toHaveTextContent('pois.ai_advice.outcome.no_location');
  });

  it('reads the advice again on the call’s aiDestinationAdviceUpdated ping only, and after a hub rejoin', async () => {
    await render(<AiDestinationAdviceCard callId="12" canAct />);
    fetchAdvice.mockClear();

    await act(async () => emitRealtimeEvent('aiDestinationAdviceUpdated', '13', '{"adviceId":"x","state":1,"isChange":true}'));
    expect(fetchAdvice).not.toHaveBeenCalled();

    await act(async () => emitRealtimeEvent('aiDestinationAdviceUpdated', '12', '{"adviceId":"a2","state":1,"isChange":true}'));
    await waitFor(() => expect(fetchAdvice).toHaveBeenCalledWith('12', { bypassCache: true }));

    fetchAdvice.mockClear();
    await act(async () => emitRealtimeEvent('eventingHubJoined', { hub: 'eventing', rejoin: false, at: 1 }));
    expect(fetchAdvice).not.toHaveBeenCalled();
    await act(async () => emitRealtimeEvent('eventingHubJoined', { hub: 'eventing', rejoin: true, at: 2 }));
    expect(fetchAdvice).toHaveBeenCalledWith('12', { bypassCache: true });
  });
});
