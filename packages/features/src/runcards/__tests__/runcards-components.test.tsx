import '../../calls/__tests__/test-setup';

import { featureFlagsStore } from '@resgrid/auth';
import { useAwaitingResourcesStore, useRunCardsStore } from '@resgrid/data';
import { getCallDetailTabs, getCallFormHookPoints, type RunCardRecommendationProps } from '@resgrid/features/calls';
import { RecommendationOutcome, RunCardConditionResult, RunCardConditionType, RunCardDecisionSource } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { activateVariant } from '../../calls/__tests__/test-utils';
import { AlarmLevelBadge } from '../components/alarm-level-badge';
import { EscalateAlarmButton } from '../components/escalate-alarm-button';
import { RecommendationPanel } from '../components/recommendation-panel';
import { RunCardCallSection } from '../components/run-card-call-section';
import { RunCardDecisionSection } from '../components/run-card-decision-section';
import { RunCardRecommendation } from '../components/run-card-recommendation';
import { registerRunCardCallDetailTab, registerRunCardHookPoints, RUN_CARD_CALL_DETAIL_TAB_ID } from '../register';

const recommendation = (overrides: Record<string, unknown> = {}) =>
  ({
    MatchedRunCardId: 3,
    MatchedRunCardName: 'Structure fire',
    AlarmLevel: 2,
    ModeUsed: 1,
    AutoDispatch: true,
    Units: [{ UnitId: 1, UnitName: 'E1', SelectionReason: 1, ResponseCodeId: 10, ResponseCode: 'C3', RowLabel: 'First due', CurrentStatusText: 'Available', CurrentStatusColor: '#00ff00', LocationIsStale: true }],
    Personnel: [{ UserId: 'u1', Name: 'Pat Medic', SelectionReason: 3, RoleName: 'Medic' }],
    Shortfalls: [{ IsUnitRequirement: true, RequirementId: 4, TypeOrRoleName: 'Ladder', AlarmLevel: 1, RequiredCount: 2, FilledCount: 1, Reason: 1, Outstanding: true }],
    MoveUps: [{ StationGroupId: 9, StationGroupName: 'Station 9', MinimumRequired: 1, AvailableAfterDispatch: 0, SuggestedUnitName: 'E9' }],
    Notes: ['Matched on priority'],
    Decision: null,
    ...overrides,
  }) as never;

const enableFlags = (conditions = false) =>
  featureFlagsStore.setState({ flags: { 'Dispatch.RunCards': { enabled: true }, ...(conditions ? { 'Dispatch.RunCardConditions': { enabled: true } } : {}) } as never, isLoaded: true });

afterEach(() => useToastStore.getState().clearToasts());

beforeEach(() => {
  activateVariant('dispatch');
  enableFlags();
  useToastStore.setState({ toasts: [] });
  useAwaitingResourcesStore.setState({ responseCodes: [], responseCodesLoaded: true, fetchResponseCodes: jest.fn(async () => undefined) });
});

describe('RecommendationPanel', () => {
  const base = { isLoading: false, hasError: false, hasFetched: true, isApplied: false, onApply: jest.fn(), onRefresh: jest.fn() };

  it('shows loading, the soft error with retry, and nothing before a fetch or without content', () => {
    const { rerender } = render(<RecommendationPanel {...base} recommendation={null} isLoading />);
    expect(screen.getByTestId('run-card-recommendation-panel-loading')).toBeTruthy();
    const onRefresh = jest.fn();
    rerender(<RecommendationPanel {...base} recommendation={null} hasError onRefresh={onRefresh} />);
    fireEvent.press(screen.getByTestId('run-card-recommendation-panel-retry'));
    expect(onRefresh).toHaveBeenCalled();
    rerender(<RecommendationPanel {...base} recommendation={recommendation()} hasFetched={false} />);
    expect(screen.toJSON()).toBeNull();
    rerender(<RecommendationPanel {...base} recommendation={recommendation({ Units: [], Personnel: [], Shortfalls: [], MoveUps: [] })} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('renders units, people, shortfalls, move-ups and notes, and applies', () => {
    const onApply = jest.fn();
    render(<RecommendationPanel {...base} recommendation={recommendation()} onApply={onApply} />);
    expect(screen.getByText('Structure fire')).toBeTruthy();
    expect(screen.getByText('run_cards.summary:1,1')).toBeTruthy();
    expect(screen.getByTestId('run-card-recommendation-panel-auto')).toBeTruthy();
    expect(screen.getByText('run_cards.alarm_level:2')).toBeTruthy();
    expect(screen.getByText('run_cards.stale_location')).toBeTruthy();
    expect(screen.getByTestId('run-card-recommendation-panel-shortfalls')).toBeTruthy();
    expect(screen.getByTestId('run-card-recommendation-panel-moveups')).toBeTruthy();
    expect(screen.getByText('Matched on priority')).toBeTruthy();
    // Conditional extras only with conditions enabled.
    expect(screen.queryByTestId('run-card-recommendation-panel-unit-1-row')).toBeNull();
    expect(screen.queryByTestId('run-card-recommendation-panel-shortfall-4-awaiting')).toBeNull();
    fireEvent.press(screen.getByTestId('run-card-recommendation-panel-apply'));
    expect(onApply).toHaveBeenCalled();
  });

  it('hides the auto-dispatch badge for a call already out and shows the covered message', () => {
    const { rerender } = render(<RecommendationPanel {...base} recommendation={recommendation()} isExistingCall />);
    expect(screen.queryByTestId('run-card-recommendation-panel-auto')).toBeNull();
    rerender(<RecommendationPanel {...base} recommendation={recommendation({ Units: [], Personnel: [], Shortfalls: [], MoveUps: [] })} coveredMessage="Covered" />);
    expect(screen.getByTestId('run-card-recommendation-panel-covered')).toBeTruthy();
    expect(screen.getByText('Covered')).toBeTruthy();
  });

  it('lets the dispatcher change a unit’s response code when conditions are on', () => {
    const onChange = jest.fn();
    render(
      <RecommendationPanel
        {...base}
        recommendation={recommendation()}
        conditions={{
          enabled: true,
          responseCodes: [
            { Id: 10, Code: 'C3', Name: 'Hot', Color: '#ff0000', SortOrder: 0, Retired: false, Description: null },
            { Id: 11, Code: 'C2', Name: 'Cold', Color: null, SortOrder: 1, Retired: false, Description: null },
          ],
          unitResponseCodes: {},
          onUnitResponseCodeChange: onChange,
        }}
      />
    );
    expect(screen.getByTestId('run-card-recommendation-panel-unit-1-row')).toBeTruthy();
    expect(screen.getByTestId('run-card-recommendation-panel-shortfall-4-awaiting')).toBeTruthy();
    fireEvent.press(screen.getByTestId('run-card-recommendation-panel-unit-1-code-button'));
    fireEvent.press(screen.getByTestId('run-card-recommendation-panel-unit-1-code-option-11-button'));
    expect(onChange).toHaveBeenCalledWith(1, 11);
    fireEvent.press(screen.getByTestId('run-card-recommendation-panel-unit-1-code-button'));
    fireEvent.press(screen.getByTestId('run-card-recommendation-panel-unit-1-code-option-none'));
    expect(onChange).toHaveBeenLastCalledWith(1, null);
  });
});

describe('RunCardDecisionSection', () => {
  it('explains the outcome, advice, path, fallbacks, first-arriving rows and the pinned decision', () => {
    const onReevaluate = jest.fn();
    render(
      <RunCardDecisionSection
        testID="rc"
        onReevaluate={onReevaluate}
        decision={
          {
            LevelHasGraph: true,
            Pinned: true,
            FromPreview: false,
            PinnedOn: '2026-10-31T11:00:00',
            PinSource: RunCardDecisionSource.SaveTime,
            Uncertain: true,
            IdealConfigurationUnavailable: true,
            Outcome: RecommendationOutcome.Dispatch,
            OutcomeNodeKey: 'n1',
            OutcomeLabel: 'Full response',
            PackageId: 1,
            PackageName: 'Package A',
            AdviceText: 'Request mutual aid',
            Path: [
              {
                NodeKey: 'c1',
                Label: 'Ladder first?',
                ConditionType: RunCardConditionType.ArrivesBefore,
                Result: RunCardConditionResult.Yes,
                Uncertain: false,
                Subject: { TargetsLabel: 'Ladder', ResourceName: 'L1', ResponseSeconds: 240 },
                Reference: null,
                ThresholdSeconds: 60,
                RequiredCount: 1,
                MarginSeconds: 30,
                TimeSource: 1,
                Note: null,
              },
            ],
            Fallbacks: [{ RowLabel: 'MUG', RequirementScope: 1, RequirementId: 2, SentInstead: 'PIT P-21', Step: 2, SubstitutePackageName: null, Outstanding: true, RequiredCount: 1, FilledCount: 0 }],
            FirstArriving: [{ RowLabel: 'Engine', ResourceName: 'E1', IsPerson: false, ResponseSeconds: 180, AlreadyIncluded: true }],
          } as never
        }
      />
    );
    expect(screen.getByTestId('rc-decision-outcome')).toBeTruthy();
    expect(screen.getByTestId('rc-decision-package')).toBeTruthy();
    expect(screen.getByText('Request mutual aid')).toBeTruthy();
    expect(screen.getByTestId('rc-decision-uncertain')).toBeTruthy();
    expect(screen.getByText('run_cards.conditions.result_yes')).toBeTruthy();
    expect(screen.getByText('run_cards.conditions.arrives_before_detail:Ladder (L1),4:00,run_cards.conditions.none_available,run_cards.conditions.no_time')).toBeTruthy();
    expect(screen.getByTestId('rc-decision-fallback-0-outstanding')).toBeTruthy();
    expect(screen.getByTestId('rc-decision-first-arriving')).toBeTruthy();
    fireEvent.press(screen.getByTestId('rc-decision-reevaluate'));
    expect(onReevaluate).toHaveBeenCalled();
  });
});

describe('alarm level and escalation', () => {
  it('badges only escalated calls with run cards on', () => {
    const { rerender } = render(<AlarmLevelBadge alarmLevel={1} />);
    expect(screen.queryByTestId('alarm-level-badge')).toBeNull();
    rerender(<AlarmLevelBadge alarmLevel={3} />);
    expect(screen.getByText('run_cards.alarm_level:3')).toBeTruthy();
    act(() => featureFlagsStore.setState({ flags: {} as never }));
    rerender(<AlarmLevelBadge alarmLevel={3} />);
    expect(screen.queryByTestId('alarm-level-badge')).toBeNull();
  });

  it('confirms before striking the next alarm and reports the result', async () => {
    const escalate = jest.fn(async () => ({ Success: true, NewAlarmLevel: 2, AddedUnits: 2, AddedPersonnel: 1 }));
    useRunCardsStore.setState({ escalate, isEscalating: false });
    const onEscalated = jest.fn();
    render(<EscalateAlarmButton callId="42" alarmLevel={1} activeRunCardId={3} canEscalate onEscalated={onEscalated} />);
    fireEvent.press(screen.getByTestId('escalate-alarm-button-trigger'));
    expect(escalate).not.toHaveBeenCalled();
    expect(screen.getByText('run_cards.escalate_confirm:2')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('escalate-alarm-button-confirm')));
    expect(escalate).toHaveBeenCalledWith('42');
    expect(onEscalated).toHaveBeenCalledWith(2);
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'success', message: 'run_cards.escalate_succeeded:2,2,1' });
  });

  it('says plainly when the next level adds nothing, and hides without a run card', async () => {
    useRunCardsStore.setState({ escalate: jest.fn(async () => ({ Success: false })), isEscalating: false });
    const { rerender } = render(<EscalateAlarmButton callId="42" alarmLevel={2} activeRunCardId={3} canEscalate />);
    fireEvent.press(screen.getByTestId('escalate-alarm-button-trigger'));
    await act(async () => fireEvent.press(screen.getByTestId('escalate-alarm-button-confirm')));
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'info', message: 'run_cards.escalate_nothing_to_add' });
    rerender(<EscalateAlarmButton callId="42" alarmLevel={2} activeRunCardId={null} canEscalate />);
    expect(screen.queryByTestId('escalate-alarm-button')).toBeNull();
  });

  it('shows the call section with its level', () => {
    render(<RunCardCallSection call={{ CallId: '42', State: 0, AlarmLevel: 2, ActiveRunCardId: 3 }} canEdit />);
    expect(screen.getByTestId('run-card-call-section-level')).toHaveTextContent('2');
    expect(screen.getByTestId('escalate-alarm-button')).toBeTruthy();
  });
});

describe('RunCardRecommendation (call form hook point)', () => {
  const props = (overrides: Partial<RunCardRecommendationProps> = {}): RunCardRecommendationProps => ({
    call: { type: 'Fire', priority: 1, latitude: 40, longitude: -105, address: '1 Main' },
    selection: { everyone: false, users: [], groups: [], roles: [], units: ['9'] },
    onApply: jest.fn(),
    ...overrides,
  });

  beforeEach(() => {
    useRunCardsStore.setState({ recommendation: null, isLoading: false, error: null, hasFetched: false, appliedRunCardId: null, unitResponseCodes: {} });
  });

  it('requests a debounced preview and applies with the decision the dispatcher reviewed', () => {
    const fetchRecommendationDebounced = jest.fn();
    useRunCardsStore.setState({ fetchRecommendationDebounced });
    const onApply = jest.fn();
    render(<RunCardRecommendation {...props({ onApply })} />);
    expect(fetchRecommendationDebounced).toHaveBeenCalledWith({ priority: 1, type: 'Fire', latitude: 40, longitude: -105, alarmLevel: 1 });

    act(() => {
      enableFlags(true);
      useAwaitingResourcesStore.setState({ responseCodes: [{ Id: 10, Code: 'C3', Name: null, Color: null, SortOrder: 0, Retired: false, Description: null }] });
      useRunCardsStore.setState({ recommendation: recommendation({ Decision: { OutcomeNodeKey: 'node-1' } }), hasFetched: true });
    });
    fireEvent.press(screen.getByTestId('run-card-recommendation-panel-apply'));
    expect(onApply).toHaveBeenCalledWith({ everyone: false, users: ['u1'], groups: [], roles: [], units: ['9', '1'] }, { outcomeNodeKey: 'node-1', unitResponseCodes: '1:10' });
    expect(useRunCardsStore.getState().appliedRunCardId).toBe(3);
  });

  it('clears the preview when priority or type is missing', () => {
    const clear = jest.fn();
    useRunCardsStore.setState({ clear, fetchRecommendationDebounced: jest.fn() });
    render(<RunCardRecommendation {...props({ call: { type: '', priority: null, address: '' } })} />);
    expect(clear).toHaveBeenCalled();
  });
});

describe('registration', () => {
  it('registers the call form hook point and the call detail tab', () => {
    const unregisterHook = registerRunCardHookPoints();
    expect(getCallFormHookPoints().RunCardRecommendation).toBe(RunCardRecommendation);
    unregisterHook();
    expect(getCallFormHookPoints().RunCardRecommendation).toBeUndefined();

    const unregisterTab = registerRunCardCallDetailTab();
    const tab = getCallDetailTabs().find((entry) => entry.id === RUN_CARD_CALL_DETAIL_TAB_ID);
    expect(tab).toBeDefined();
    const context = { capabilities: { calls: { runCards: true } }, isFeatureEnabled: () => true, call: { ActiveRunCardId: 3 } } as never;
    expect(tab?.visible?.(context)).toBe(true);
    expect(tab?.visible?.({ ...(context as object), call: { ActiveRunCardId: null } } as never)).toBe(false);
    unregisterTab();
  });
});
