/**
 * Enhanced AI destination advice (Core `api/v4/AiDestinations`, call-intake-and-ai-destinations-plan.md §7): the destination the
 * model recommends for a call from its nature, note and call notes and the department's rule-ranked destinations. Advice never
 * changes the call by itself (plan D4): a person applies it in one action.
 */

/** Core `AiDestinationAdviceStates` (persisted). GetAdvice only ever returns Open advice. */
export enum AiDestinationAdviceStates {
  Open = 1,
  Applied = 2,
  Dismissed = 3,
  /** A newer advice for the same call replaced it. */
  Superseded = 4,
}

/** Core `AiDestinationReviewTriggers`: what asked for the advice. */
export enum AiDestinationAdviceTriggers {
  OnDemand = 1,
  CallCreated = 2,
  CallUpdated = 3,
  NoteAdded = 4,
  AvailabilityChanged = 5,
}

/**
 * What a request did, or why it did nothing (Core `AiDestinationOutcomes`). `Disabled`, `NotEntitled`, `Unconfigured` and
 * `ProtectionUnsupported` also mean the feature is unavailable for the department.
 */
export const AiDestinationOutcomes = {
  Advised: 'Advised',
  Unchanged: 'Unchanged',
  Applied: 'Applied',
  Dismissed: 'Dismissed',
  Disabled: 'Disabled',
  NotEntitled: 'NotEntitled',
  Unconfigured: 'Unconfigured',
  ProtectionUnsupported: 'ProtectionUnsupported',
  CallNotOpen: 'CallNotOpen',
  NoLocation: 'NoLocation',
  NoCandidates: 'NoCandidates',
  Busy: 'Busy',
  BudgetExhausted: 'BudgetExhausted',
  Unavailable: 'Unavailable',
  InvalidOutput: 'InvalidOutput',
  NotFound: 'NotFound',
  NotOpen: 'NotOpen',
  NothingToApply: 'NothingToApply',
  DestinationGone: 'DestinationGone',
} as const;

// eslint-disable-next-line @typescript-eslint/no-redeclare -- enum-like const + literal union type pair
export type AiDestinationOutcomes = (typeof AiDestinationOutcomes)[keyof typeof AiDestinationOutcomes];

/** A capability the model judged the call needs (a department POI capability). */
export interface AiDestinationCapabilityData {
  Id: string;
  Name: string;
}

/** One advice row (Core `AiDestinationAdviceData`). */
export interface AiDestinationAdviceData {
  /** GUID. */
  Id: string;
  CallId: number;
  /** The call's destination POI when the advice was made; null = none or a free destination. */
  CurrentPoiId: number | null;
  CurrentPoiName: string | null;
  /** The recommended destination POI; null = keep the current destination. */
  RecommendedPoiId: number | null;
  RecommendedPoiName: string | null;
  /** The recommended destination's availability (`PoiAvailabilityStatuses`: 1 Limited, 2 Diversion, 3 Closed); null = open, nothing reported. */
  RecommendedPoiStatus: number | null;
  RequiredCapabilities: AiDestinationCapabilityData[];
  /** The model's short reasoning (at most 400 characters): plain text, never markup. */
  Rationale: string | null;
  /** 0..1. */
  Confidence: number;
  /** The recommendation differs from the current destination. */
  IsChange: boolean;
  /** A change at or above the operator's minimum confidence (only these are noted on the call and pushed). */
  IsConfident: boolean;
  /** `AiDestinationAdviceStates`. */
  State: number;
  /** ISO 8601 UTC. */
  CreatedOn: string;
  /** `AiDestinationAdviceTriggers`. */
  Trigger: number;
}

/** `Data` of every AiDestinations answer. */
export interface AiDestinationAdviceResultData {
  /** The department may use destination advice now (feature, add-on, operator model, not Advanced Data Protection). */
  Available: boolean;
  /** What the request did, or why not (`AiDestinationOutcomes`); null on GetAdvice. */
  Outcome: string | null;
  /** The caller may edit the call, so may ask, apply and dismiss. */
  CanApply: boolean;
  /** The call's open advice (or the advice the operation acted on); null when there is none. */
  Advice: AiDestinationAdviceData | null;
}

export interface AiDestinationAdviceResult {
  Data: AiDestinationAdviceResultData | null;
  PageSize?: number;
  Status?: string;
}

/** `POST /AiDestinations/RequestAdvice`: ask Enhanced AI for the call's destination now. */
export interface RequestAiDestinationAdviceInput {
  CallId: number;
}

/** `POST /AiDestinations/ApplyAdvice`: set the call's destination to the advice's recommendation. */
export interface ApplyAiDestinationAdviceInput {
  AdviceId: string;
}

/** Core's limit on a dismiss reason. */
export const AI_DESTINATION_DISMISS_REASON_MAX = 200;

/** `POST /AiDestinations/DismissAdvice`: the reason (optional) is written to the call's notes when the advice was a change. */
export interface DismissAiDestinationAdviceInput {
  AdviceId: string;
  Reason?: string | null;
}
