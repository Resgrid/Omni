/**
 * Intake spam handling (Core `api/v4/IntakeScreening`, M0326; call-intake-and-ai-destinations-plan.md §9): a dispatcher who may close a
 * pending intake call can dismiss it as spam. Core cancels it (nobody is notified; nobody was dispatched), ends its SMS conversation
 * without texting the sender, and blocks the sender from the department's intake channels for a while (admins lift blocks on the web).
 */

/** Core `IntakeScreenings` (`CallResultData.IntakeScreening`; persisted, never renumbered). */
export enum IntakeScreenings {
  None = 0,
  /** Enhanced AI read the message as reporting no incident (spam, advertising, a wrong number, a test). */
  LikelyNotIncident = 1,
  /** The sender is over the hourly call limit and none of their calls was still open. */
  RepeatSender = 2,
  /** A dispatcher dismissed the call as spam (it is cancelled). */
  DismissedAsSpam = 3,
}

/** Core `IntakeDismissResults` names (`DismissIntakeCallResultData.Outcome`). */
export const IntakeDismissOutcomes = {
  Dismissed: 'Dismissed',
  NotFound: 'NotFound',
  NotPending: 'NotPending',
} as const;

export interface DismissIntakeCallInput {
  CallId: number;
  /** Also block the sender (Core default true). */
  BlockSender: boolean;
}

export interface DismissIntakeCallResultData {
  CallId: number;
  /** `IntakeDismissOutcomes`. */
  Outcome: string;
  SenderBlocked: boolean;
  /** A block was asked for but the caller withheld their number. */
  SenderNotBlockable: boolean;
  /** When the block ends (UTC ISO); null = until lifted, or no block. */
  BlockedUntilUtc: string | null;
}

export interface DismissIntakeCallResult {
  Data: DismissIntakeCallResultData;
  PageSize: number;
  Timestamp: string;
  Version: string;
  Node: string;
  RequestId: string;
  Status: string;
  Environment: string;
}
