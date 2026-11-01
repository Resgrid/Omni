// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

import type { RunCardAlarmLevelData, RunCardSelectionData, RunCardTriggerData } from './runCardResultData';

/** A run card (CAD-style response plan) with its full child graph. */
export interface RunCardData {
  /** Run card id */
  RunCardId?: number;
  /** Name */
  Name?: string | null;
  /** Description */
  Description?: string | null;
  /** True when the card is disabled and never matches */
  IsDisabled?: boolean;
  /** Per-card dispatch mode override (null = department default, 0 = manual only, 1 = station based, 2 = closest unit) */
  DispatchModeOverride?: number | null;
  /** Per-card auto dispatch override (null = department default, 0 = pre-populate, 1 = auto) */
  AutoDispatchOverride?: number | null;
  /** Per-card minimum UnitStaffingLevel override (null = department default, 0 = off) */
  MinimumStaffingLevelOverride?: number | null;
  /** Station group anchoring the cascade when a call has no location */
  HomeStationGroupId?: number | null;
  /** Match conditions (OR'd) */
  Triggers?: RunCardTriggerData[] | null;
  /** Additive alarm levels */
  AlarmLevels?: RunCardAlarmLevelData[] | null;
  /** Dispatchable status/staffing selections */
  Selections?: RunCardSelectionData[] | null;
}

/** Preview of what the department's run cards would dispatch for a prospective call. */
export interface RunCardRecommendationResult {
  Data?: Record<string, unknown>;
  /** Number of records returned */
  PageSize?: number;
  /** The requested page size */
  Page?: number;
  /** Timestamp in UTC of the operation */
  Timestamp?: string;
  /** API Version that produced the response */
  Version?: string | null;
  /** Name of the node the processed the operation */
  Node?: string | null;
  /** Name of the environment that the api is running under */
  Environment?: string | null;
  /** Trace or Request Id for the operation */
  RequestId?: string | null;
  /** Status of the Response */
  Status?: string | null;
  /** If pagination values were supplied what is the previous page url (if empty this is the first page) */
  PreviousPageUrl?: string | null;
  /** If pagination values were supplied what is the next page url (if empty there is no more records) */
  NextPageUrl?: string | null;
}

/** All run cards for the department. */
export interface RunCardsResult {
  /** Response Data */
  Data?: RunCardData[] | null;
  /** Number of records returned */
  PageSize?: number;
  /** The requested page size */
  Page?: number;
  /** Timestamp in UTC of the operation */
  Timestamp?: string;
  /** API Version that produced the response */
  Version?: string | null;
  /** Name of the node the processed the operation */
  Node?: string | null;
  /** Name of the environment that the api is running under */
  Environment?: string | null;
  /** Trace or Request Id for the operation */
  RequestId?: string | null;
  /** Status of the Response */
  Status?: string | null;
  /** If pagination values were supplied what is the previous page url (if empty this is the first page) */
  PreviousPageUrl?: string | null;
  /** If pagination values were supplied what is the next page url (if empty there is no more records) */
  NextPageUrl?: string | null;
}
