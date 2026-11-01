// Run cards (omni-plan §7.11 Dispatch; Dispatch baseline `components/runcards`): the recommendation panel (New Call hook
// point and add-resources), the decision explanation and response codes of conditional run cards, alarm level badge and
// "Strike Next Alarm". Gated by capabilities.calls.runCards + Dispatch.RunCards (+ Dispatch.RunCardConditions).

// Components
export { AlarmLevelBadge, type AlarmLevelBadgeProps } from './components/alarm-level-badge';
export { EscalateAlarmButton, type EscalateAlarmButtonProps } from './components/escalate-alarm-button';
export { RecommendationPanel, type RecommendationPanelProps } from './components/recommendation-panel';
export { ResponseCodeChip, type ResponseCodeChipProps } from './components/response-code-chip';
export { RunCardCallSection, type RunCardCallSectionProps } from './components/run-card-call-section';
export { RunCardDecisionSection, type RunCardDecisionSectionProps } from './components/run-card-decision-section';
export { RunCardRecommendation } from './components/run-card-recommendation';

// Hooks
export { type AddResourcesRecommendationResult, useAddResourcesRecommendation, type UseAddResourcesRecommendationArgs } from './hooks/use-add-resources-recommendation';
export { type CallRecommendationResult, useCallRecommendation, type UseCallRecommendationArgs } from './hooks/use-call-recommendation';
export { isRunCardConditionsEnabled, isRunCardsEnabled, useIsRunCardConditionsEnabled, useIsRunCardsEnabled } from './hooks/use-run-card-flags';

// Pure helpers
export type { RecommendationConditionsProps } from './lib/recommendation-types';
export {
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
  type RunCardSaveFields,
  runCardSaveFields,
  timeSourceKey,
} from './lib/run-card-conditions';
export {
  applyRecommendationToSelection,
  dispatchModeKey,
  formatDistance,
  formatEta,
  hasRecommendationContent,
  personnelDetailParts,
  type RecommendationSelection,
  recommendedUnitIds,
  recommendedUserIds,
  selectionReasonKey,
  shortfallReasonKey,
  unitDetailParts,
  unitStatusColors,
} from './lib/run-cards';

// Registration, nav and routes
export { type FeatureNavEntry, runcardsNav } from './nav';
export { registerRunCardCallDetailTab, registerRunCardHookPoints, RUN_CARD_CALL_DETAIL_TAB_ID } from './register';
export { RUNCARDS_ROUTE_PATTERNS, runcardsRoutes } from './routes';
