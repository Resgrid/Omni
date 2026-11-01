import { parseUtcMs } from '@resgrid/core/utils/dates';
import type { UnitResponseCodeChoices } from '@resgrid/data';
import { readableTextColor } from '@resgrid/features/status';
import {
  type DispatchRecommendationResultData,
  RequirementFallbackStep,
  ResponseTimeSource,
  type RunCardConditionData,
  RunCardConditionResult,
  RunCardDecisionSource,
  type RunCardOperandData,
  type UnitRecommendationData,
} from '@resgrid/models';

/**
 * Presentation and request helpers for conditional run cards (Dispatch.RunCardConditions, Dispatch baseline
 * `lib/run-card-conditions`): the decision explanation, response codes and the save fields. Unit testable, and the New
 * Call, add-resources and awaiting-resources surfaces read them the same way.
 */

/** A response time as m:ss ("4:05"). Null when the engine had no time. */
export const formatResponseSeconds = (seconds: number | null | undefined): string | null => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
};

/** A signed margin as m:ss ("+1:30", "-0:20"). Null when there is none. */
export const formatMarginSeconds = (seconds: number | null | undefined): string | null => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  const formatted = formatResponseSeconds(Math.abs(seconds));
  return formatted ? `${seconds < 0 ? '-' : '+'}${formatted}` : null;
};

/** Whole minutes since a server UTC timestamp (shared parser: zone-less values are UTC); null when unreadable. */
export const minutesSinceUtc = (value: string | null | undefined, now: number = Date.now()): number | null => {
  const at = parseUtcMs(value);
  return at === null ? null : Math.max(0, Math.floor((now - at) / 60000));
};

/** Translation key for the branch a condition followed. */
export const conditionResultKey = (result: RunCardConditionResult): string =>
  result === RunCardConditionResult.Yes ? 'run_cards.conditions.result_yes' : result === RunCardConditionResult.No ? 'run_cards.conditions.result_no' : 'run_cards.conditions.result_uncertain';

/** Translation key for the "decision pinned" line; each takes `time`. */
export const pinSourceKey = (source: RunCardDecisionSource | null | undefined): string =>
  source === RunCardDecisionSource.DispatcherPreview
    ? 'run_cards.conditions.pinned_preview'
    : source === RunCardDecisionSource.Reevaluated
      ? 'run_cards.conditions.pinned_reevaluated'
      : 'run_cards.conditions.pinned_save_time';

/** Translation key for how a response time was measured. */
export const timeSourceKey = (source: ResponseTimeSource | null | undefined): string => (source === ResponseTimeSource.Routed ? 'run_cards.conditions.time_routed' : 'run_cards.conditions.time_estimated');

/** Translation key for a fallback step's line; each takes `row`, plus `sent`/`package` or `filled`/`required`. */
export const fallbackStepKey = (step: RequirementFallbackStep, hasSentInstead: boolean): string => {
  if (step === RequirementFallbackStep.Relaxed) return 'run_cards.conditions.fallback_relaxed';
  if (step === RequirementFallbackStep.Substitute) return hasSentInstead ? 'run_cards.conditions.fallback_substitute' : 'run_cards.conditions.fallback_substitute_none';
  return 'run_cards.conditions.fallback_shortfall';
};

/** What an operand measured as one phrase: targets with the pick ("MUG (M-1)"), or the targets alone when nothing matched. */
export const operandDisplay = (operand: RunCardOperandData | null | undefined, noneLabel: string): string => {
  if (!operand) return noneLabel;
  const targets = operand.TargetsLabel?.trim();
  const resource = operand.ResourceName?.trim();
  if (targets && resource) return `${targets} (${resource})`;
  return resource || (targets ? `${targets} (${noneLabel})` : noneLabel);
};

/** True when anything about the condition could have gone the other way. */
export const isConditionUncertain = (condition: Pick<RunCardConditionData, 'Uncertain' | 'Result'>): boolean => condition.Uncertain || condition.Result === RunCardConditionResult.Uncertain;

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Badge colours for a response code chip; null when the code has no (valid, opaque) colour and gets a plain chip. */
export const responseCodeChipColors = (color: string | null | undefined): { backgroundColor: string; color: string } | null => {
  const backgroundColor = color?.trim();
  if (!backgroundColor || !HEX_COLOR.test(backgroundColor)) return null;
  return { backgroundColor, color: readableTextColor(backgroundColor) ?? '#000000' };
};

/** The code a recommended unit goes with: the dispatcher's choice when they made one, else the run card's proposal. */
export const effectiveUnitResponseCodeId = (unit: Pick<UnitRecommendationData, 'UnitId' | 'ResponseCodeId'>, choices: UnitResponseCodeChoices | null | undefined): number | null => {
  if (choices && Object.prototype.hasOwnProperty.call(choices, unit.UnitId)) return choices[unit.UnitId] ?? null;
  return unit.ResponseCodeId ?? null;
};

/**
 * The `UnitResponseCodes` value to post with a save: "unitId:codeId" for every recommended unit in the final dispatch
 * selection, with the code it goes with ("unitId:" when none), joined by "|". Posting what the dispatcher saw (not only
 * their changes) keeps the saved call on the reviewed codes. Undefined when the department uses no codes or nothing
 * recommended is being dispatched, so the field stays off the request entirely.
 */
export const buildUnitResponseCodes = (
  recommendation: DispatchRecommendationResultData | null | undefined,
  choices: UnitResponseCodeChoices | null | undefined,
  selectedUnitIds: readonly (string | number)[] | null | undefined,
  hasResponseCodes: boolean
): string | undefined => {
  if (!hasResponseCodes || !recommendation?.Units?.length || !selectedUnitIds?.length) return undefined;
  const selected = new Set(selectedUnitIds.map(String));
  const entries = recommendation.Units.filter((unit) => selected.has(String(unit.UnitId))).map((unit) => `${unit.UnitId}:${effectiveUnitResponseCodeId(unit, choices) ?? ''}`);
  return entries.length > 0 ? entries.join('|') : undefined;
};

/** The outcome node to post as `RunCardOutcomeNodeKey` with a New Call save; undefined for a fixed card. */
export const outcomeNodeKeyFor = (recommendation: DispatchRecommendationResultData | null | undefined): string | undefined => {
  const key = recommendation?.MatchedRunCardId ? recommendation.Decision?.OutcomeNodeKey?.trim() : undefined;
  return key ? key : undefined;
};

export interface RunCardSaveFields {
  unitResponseCodes?: string;
  outcomeNodeKey?: string;
}

/**
 * The conditional run card fields a save carries for a reviewed recommendation: per-unit response codes for the
 * recommended units being dispatched and (New Call only) the decision's outcome node. Empty without
 * Dispatch.RunCardConditions, so the request stays exactly what it was before.
 */
export const runCardSaveFields = (
  recommendation: DispatchRecommendationResultData | null | undefined,
  choices: UnitResponseCodeChoices | null | undefined,
  selectedUnitIds: readonly (string | number)[] | null | undefined,
  options: { conditionsEnabled: boolean; hasResponseCodes: boolean; includeOutcome: boolean }
): RunCardSaveFields => {
  if (!options.conditionsEnabled || !recommendation?.MatchedRunCardId) return {};
  const unitResponseCodes = buildUnitResponseCodes(recommendation, choices, selectedUnitIds, options.hasResponseCodes);
  const outcomeNodeKey = options.includeOutcome ? outcomeNodeKeyFor(recommendation) : undefined;
  return { ...(unitResponseCodes ? { unitResponseCodes } : {}), ...(outcomeNodeKey ? { outcomeNodeKey } : {}) };
};
