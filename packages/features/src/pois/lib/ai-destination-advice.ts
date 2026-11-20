/**
 * Enhanced AI destination advice on call detail, the call form and the status destination list (Core `api/v4/AiDestinations`,
 * call-intake-and-ai-destinations-plan.md §7, D4): what the card says for each advice and for each answer to an action.
 * Advice never changes a destination by itself.
 */
import type { AiDestinationAdviceActionError } from '@resgrid/data';
import { type AiDestinationAdviceData, AiDestinationAdviceStates, AiDestinationOutcomes, PoiAvailabilityStatuses } from '@resgrid/models';

export type AdviceMessageTone = 'info' | 'success' | 'warning' | 'error';

/** A line the card shows after an action: an i18n key, its tone and its parameters. */
export interface AdviceMessage {
  key: string;
  tone: AdviceMessageTone;
  name?: string;
}

/** Outcomes that need no line of their own: the card shows the new advice (or none). */
const SILENT_OUTCOMES: ReadonlySet<string> = new Set([AiDestinationOutcomes.Advised]);

const OUTCOME_MESSAGES: ReadonlyMap<string, Omit<AdviceMessage, 'name'>> = new Map([
  [AiDestinationOutcomes.Unchanged, { key: 'pois.ai_advice.outcome.unchanged', tone: 'info' }],
  [AiDestinationOutcomes.Applied, { key: 'pois.ai_advice.outcome.applied', tone: 'success' }],
  [AiDestinationOutcomes.Dismissed, { key: 'pois.ai_advice.outcome.dismissed', tone: 'info' }],
  [AiDestinationOutcomes.Disabled, { key: 'pois.ai_advice.outcome.unavailable_for_department', tone: 'warning' }],
  [AiDestinationOutcomes.NotEntitled, { key: 'pois.ai_advice.outcome.unavailable_for_department', tone: 'warning' }],
  [AiDestinationOutcomes.Unconfigured, { key: 'pois.ai_advice.outcome.unavailable_for_department', tone: 'warning' }],
  [AiDestinationOutcomes.ProtectionUnsupported, { key: 'pois.ai_advice.outcome.protection_unsupported', tone: 'warning' }],
  [AiDestinationOutcomes.CallNotOpen, { key: 'pois.ai_advice.outcome.call_not_open', tone: 'warning' }],
  [AiDestinationOutcomes.NoLocation, { key: 'pois.ai_advice.outcome.no_location', tone: 'warning' }],
  [AiDestinationOutcomes.NoCandidates, { key: 'pois.ai_advice.outcome.no_candidates', tone: 'warning' }],
  [AiDestinationOutcomes.Busy, { key: 'pois.ai_advice.outcome.busy', tone: 'warning' }],
  [AiDestinationOutcomes.BudgetExhausted, { key: 'pois.ai_advice.outcome.budget_exhausted', tone: 'warning' }],
  [AiDestinationOutcomes.Unavailable, { key: 'pois.ai_advice.outcome.model_unavailable', tone: 'warning' }],
  [AiDestinationOutcomes.InvalidOutput, { key: 'pois.ai_advice.outcome.invalid_output', tone: 'warning' }],
  [AiDestinationOutcomes.NotFound, { key: 'pois.ai_advice.outcome.not_found', tone: 'warning' }],
  [AiDestinationOutcomes.NotOpen, { key: 'pois.ai_advice.outcome.not_open', tone: 'warning' }],
  [AiDestinationOutcomes.NothingToApply, { key: 'pois.ai_advice.outcome.nothing_to_apply', tone: 'info' }],
  [AiDestinationOutcomes.DestinationGone, { key: 'pois.ai_advice.outcome.destination_gone', tone: 'warning' }],
]);

const ERROR_MESSAGES: Readonly<Record<AiDestinationAdviceActionError, string>> = {
  offline: 'pois.ai_advice.error.offline',
  unavailable: 'pois.ai_advice.error.failed',
  not_allowed: 'pois.ai_advice.error.not_allowed',
  failed: 'pois.ai_advice.error.failed',
};

/** The line for an action's outcome; null when the card's new content says it all. An outcome this build does not know reads as a failure. */
export const adviceOutcomeMessage = (outcome: string | null, name: string | null = null): AdviceMessage | null => {
  if (outcome === null || SILENT_OUTCOMES.has(outcome)) return null;

  const known = OUTCOME_MESSAGES.get(outcome);

  if (!known) return { key: 'pois.ai_advice.error.failed', tone: 'error' };

  return name ? { ...known, name } : known;
};

/** The line for an action that got no usable answer. */
export const adviceErrorMessage = (error: AiDestinationAdviceActionError): AdviceMessage => ({ key: ERROR_MESSAGES[error], tone: 'error' });

/** The confidence as a whole percentage (0..100). */
export const confidencePercent = (confidence: number | null | undefined): number => {
  const value = Number(confidence);

  return Number.isFinite(value) ? Math.round(Math.min(1, Math.max(0, value)) * 100) : 0;
};

/** A change below the operator's minimum confidence: shown, never pushed or noted, and marked so a person checks it (as the web does). */
export const isLowConfidenceChange = (advice: Pick<AiDestinationAdviceData, 'IsChange' | 'IsConfident'>): boolean => advice.IsChange && !advice.IsConfident;

/** The recommended destination's reported availability; Open when nothing is reported (or a value this build does not know). */
export const recommendedAvailability = (advice: Pick<AiDestinationAdviceData, 'RecommendedPoiStatus'>): PoiAvailabilityStatuses => {
  const status = Number(advice.RecommendedPoiStatus);

  return status === PoiAvailabilityStatuses.Limited || status === PoiAvailabilityStatuses.Diversion || status === PoiAvailabilityStatuses.Closed ? status : PoiAvailabilityStatuses.Open;
};

/** The POI an open advice recommends (null for "keep the current destination", no advice, or advice no longer open). */
export const adviceRecommendedPoiId = (advice: Pick<AiDestinationAdviceData, 'RecommendedPoiId' | 'State'> | null | undefined): number | null => {
  if (!advice || Number(advice.State) !== AiDestinationAdviceStates.Open) return null;

  const id = Number(advice.RecommendedPoiId);

  return advice.RecommendedPoiId !== null && Number.isInteger(id) && id > 0 ? id : null;
};
