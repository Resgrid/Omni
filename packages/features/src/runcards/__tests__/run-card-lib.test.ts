import '../../calls/__tests__/test-setup';

import { DispatchRecommendationMode, RecommendationSelectionReason, RequirementFallbackStep, RequirementShortfallReason, ResponseTimeSource, RunCardConditionResult, RunCardDecisionSource } from '@resgrid/models';

import {
  buildUnitResponseCodes,
  conditionResultKey,
  effectiveUnitResponseCodeId,
  fallbackStepKey,
  formatMarginSeconds,
  formatResponseSeconds,
  isConditionUncertain,
  minutesSinceUtc,
  operandDisplay,
  outcomeNodeKeyFor,
  pinSourceKey,
  responseCodeChipColors,
  runCardSaveFields,
  timeSourceKey,
} from '../lib/run-card-conditions';
import {
  applyRecommendationToSelection,
  dispatchModeKey,
  formatDistance,
  formatEta,
  hasRecommendationContent,
  personnelDetailParts,
  recommendedUserIds,
  selectionReasonKey,
  shortfallReasonKey,
  unitDetailParts,
  unitStatusColors,
} from '../lib/run-cards';

const rec = (overrides: Record<string, unknown> = {}) =>
  ({
    MatchedRunCardId: 3,
    MatchedRunCardName: 'Fire',
    AlarmLevel: 1,
    ModeUsed: 1,
    AutoDispatch: false,
    Units: [
      { UnitId: 1, UnitName: 'E1', ResponseCodeId: 10 },
      { UnitId: 2, UnitName: 'L1', ResponseCodeId: null },
    ],
    Personnel: [
      { UserId: 'u1', Name: 'Pat' },
      { UserId: '', Name: 'Nobody' },
    ],
    Shortfalls: [],
    MoveUps: [],
    Notes: [],
    Decision: { OutcomeNodeKey: ' node-7 ' },
    ...overrides,
  }) as never;

describe('run card presentation helpers', () => {
  it('maps reasons and modes to translation keys with fallbacks', () => {
    expect(selectionReasonKey(RecommendationSelectionReason.ClosestByEta)).toBe('run_cards.reason.closest_by_eta');
    expect(selectionReasonKey(99 as never)).toBe('run_cards.reason.unknown');
    expect(shortfallReasonKey(RequirementShortfallReason.UnitsNotStaffed)).toBe('run_cards.shortfall.not_staffed');
    expect(shortfallReasonKey(0 as never)).toBe('run_cards.shortfall.unknown');
    expect(dispatchModeKey(DispatchRecommendationMode.ClosestUnit)).toBe('run_cards.mode.closest_unit');
    expect(dispatchModeKey(DispatchRecommendationMode.ManualOnly)).toBe('run_cards.mode.manual_only');
  });

  it('formats distance and ETA', () => {
    expect(formatDistance(450.4)).toBe('450 m');
    expect(formatDistance(1530)).toBe('1.5 km');
    expect(formatDistance(-1)).toBeNull();
    expect(formatEta(42)).toBe('42s');
    expect(formatEta(61)).toBe('2 min');
    expect(formatEta(null)).toBeNull();
  });

  it('decides whether a recommendation is worth showing', () => {
    expect(hasRecommendationContent(null)).toBe(false);
    expect(hasRecommendationContent(rec({ MatchedRunCardId: null }))).toBe(false);
    expect(hasRecommendationContent(rec({ Units: [], Personnel: [] }))).toBe(false);
    expect(hasRecommendationContent(rec({ Units: [], Personnel: [], Decision: { AdviceText: 'Call the chief' } }))).toBe(true);
    expect(hasRecommendationContent(rec())).toBe(true);
  });

  it('applies additively, clears everyone and skips people without an id', () => {
    const next = applyRecommendationToSelection({ everyone: true, users: ['u9'], groups: [], roles: [], units: ['1'] }, rec());
    expect(next).toEqual({ everyone: false, users: ['u9', 'u1'], groups: [], roles: [], units: ['1', '2'] });
    expect(recommendedUserIds(rec())).toEqual(['u1']);
  });

  it('builds detail lines and status colours', () => {
    expect(unitDetailParts({ StationGroupName: 'Station 1', DistanceMeters: 1200, EtaSeconds: 300 } as never)).toEqual(['Station 1', '1.2 km', '5 min']);
    expect(personnelDetailParts({ RoleName: 'Medic', CurrentStatusText: 'Available' } as never)).toEqual(['Medic', 'Available']);
    expect(unitStatusColors({ CurrentStatusColor: '#000000', CurrentStatusTextColor: '#000' })).toEqual({ backgroundColor: '#000000', color: '#FFFFFF' });
    expect(unitStatusColors({ CurrentStatusColor: '#ff0000', CurrentStatusTextColor: '#ffffff' })).toEqual({ backgroundColor: '#ff0000', color: '#ffffff' });
    expect(unitStatusColors({ CurrentStatusColor: 'rgba(0,0,0,.5)' })).toBeNull();
  });
});

describe('conditional run card helpers', () => {
  it('formats response times and margins', () => {
    expect(formatResponseSeconds(245)).toBe('4:05');
    expect(formatResponseSeconds(undefined)).toBeNull();
    expect(formatMarginSeconds(-20)).toBe('-0:20');
    expect(formatMarginSeconds(90)).toBe('+1:30');
  });

  it('reads zone-less server times as UTC', () => {
    const now = Date.parse('2026-10-31T12:10:00Z');
    expect(minutesSinceUtc('2026-10-31T12:00:00', now)).toBe(10);
    expect(minutesSinceUtc('nope', now)).toBeNull();
  });

  it('maps condition and decision enums to keys', () => {
    expect(conditionResultKey(RunCardConditionResult.Yes)).toBe('run_cards.conditions.result_yes');
    expect(conditionResultKey(RunCardConditionResult.Uncertain)).toBe('run_cards.conditions.result_uncertain');
    expect(pinSourceKey(RunCardDecisionSource.Reevaluated)).toBe('run_cards.conditions.pinned_reevaluated');
    expect(pinSourceKey(null)).toBe('run_cards.conditions.pinned_save_time');
    expect(timeSourceKey(ResponseTimeSource.Routed)).toBe('run_cards.conditions.time_routed');
    expect(fallbackStepKey(RequirementFallbackStep.Substitute, false)).toBe('run_cards.conditions.fallback_substitute_none');
    expect(fallbackStepKey(RequirementFallbackStep.Shortfall, true)).toBe('run_cards.conditions.fallback_shortfall');
    expect(isConditionUncertain({ Uncertain: false, Result: RunCardConditionResult.Uncertain })).toBe(true);
  });

  it('describes operands', () => {
    expect(operandDisplay({ TargetsLabel: 'MUG', ResourceName: 'M-1' } as never, 'none')).toBe('MUG (M-1)');
    expect(operandDisplay({ TargetsLabel: 'MUG', ResourceName: null } as never, 'none')).toBe('MUG (none)');
    expect(operandDisplay(null, 'none')).toBe('none');
  });

  it('builds the save fields only for reviewed, coded, selected units', () => {
    expect(effectiveUnitResponseCodeId({ UnitId: 1, ResponseCodeId: 10 }, { 1: null })).toBeNull();
    expect(effectiveUnitResponseCodeId({ UnitId: 1, ResponseCodeId: 10 }, {})).toBe(10);
    expect(buildUnitResponseCodes(rec(), { 2: 11 }, ['1', 2, '5'], true)).toBe('1:10|2:11');
    expect(buildUnitResponseCodes(rec(), {}, ['1'], false)).toBeUndefined();
    expect(buildUnitResponseCodes(rec(), {}, [], true)).toBeUndefined();
    expect(outcomeNodeKeyFor(rec())).toBe('node-7');
    expect(outcomeNodeKeyFor(rec({ MatchedRunCardId: null }))).toBeUndefined();
    expect(runCardSaveFields(rec(), {}, ['1'], { conditionsEnabled: true, hasResponseCodes: true, includeOutcome: true })).toEqual({ unitResponseCodes: '1:10', outcomeNodeKey: 'node-7' });
    expect(runCardSaveFields(rec(), {}, ['1'], { conditionsEnabled: false, hasResponseCodes: true, includeOutcome: true })).toEqual({});
  });

  it('colours response code chips only for opaque hex colours', () => {
    expect(responseCodeChipColors('#ffffff')).toEqual({ backgroundColor: '#ffffff', color: '#000000' });
    expect(responseCodeChipColors('red')).toBeNull();
  });
});
