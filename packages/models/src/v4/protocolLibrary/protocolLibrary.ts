// Core v4 protocol library shapes (protocols plan P1–P3, Omni round 10): a version as the reader is shown it, the member's
// acknowledgments and the question-bank acknowledgment quiz, and a call's step-through checklists. Field names mirror
// Core exactly (Web/Resgrid.Web.Services/Models/v4/Protocols/ProtocolAcknowledgmentModels.cs, ProtocolContent/
// ProtocolContentModels.cs and Resgrid.Model ProtocolQuizView/ProtocolQuizResult). Dates are UTC on the wire.
import type { BaseV4Request } from '../baseV4Request';

/** Core `ProtocolKinds`. */
export const ProtocolKind = { Dispatch: 0, Sog: 1, ClinicalGuideline: 2, Policy: 3, Procedure: 4, Reference: 5, Bulletin: 6 } as const;

/** Core `ProtocolStepStates`: a step event's state (0 sends a step back to pending). */
export const ProtocolStepState = { Pending: 0, Done: 1, Skipped: 2, NotApplicable: 3 } as const;

export type ProtocolStepStateValue = (typeof ProtocolStepState)[keyof typeof ProtocolStepState];

/** Core `ProtocolStepResultData`. */
export interface ProtocolStepResultData {
  Id: string;
  Text: string | null;
  Kind: string | null;
  Group: string | null;
  Anchor: string | null;
  Order: number;
  State: number;
  At: string | null;
  ByUserId: string | null;
  Note: string | null;
}

/** Core `ProtocolVersionContentData` (`GET /ProtocolContent/GetVersionContent`): no content for a document-backed version. */
export interface ProtocolVersionContentData {
  ProtocolId: string;
  ProtocolVersionId: string;
  Label: string | null;
  EffectiveOn: string | null;
  ContentHash: string | null;
  Locale: string | null;
  TranslationId: string | null;
  TranslationContentHash: string | null;
  IsFallback: boolean;
  AvailableLocales: string[] | null;
  ContentHtml: string | null;
  ContentJson: string | null;
  DosingToolUrl: string | null;
  DeepLink: string | null;
  Steps: ProtocolStepResultData[] | null;
  /** A document-backed version (PDF/DOCX): its file comes from `ProtocolAcknowledgments/GetVersionFile`. Absent from older servers. */
  IsDocument?: boolean;
  DocumentFileName?: string | null;
  DocumentContentType?: string | null;
  DocumentSize?: number | null;
}

export interface GetProtocolVersionContentResult extends BaseV4Request {
  Data: ProtocolVersionContentData | null;
}

/** Core `ProtocolAcknowledgmentResultData`: Status is `open`, `awaiting_quiz` or `acknowledged`. */
export interface ProtocolAcknowledgmentResultData {
  AcknowledgmentId: number;
  ProtocolId: number;
  ProtocolVersionId: number;
  Code: string | null;
  Name: string | null;
  Kind: number;
  IsBulletin: boolean;
  VersionLabel: string | null;
  ContentHash: string | null;
  Status: string;
  IsOverdue: boolean;
  AssignedOn: string;
  DueOn: string | null;
  SignedOn: string | null;
  EffectiveOn: string | null;
  ExpiresOn: string | null;
  BundleOrder: number;
  QuizTrainingId: number | null;
  QuizTrainingName: string | null;
  QuizPassed: boolean;
  IsDocument: boolean;
  BankQuizOwed: boolean;
}

export interface GetMyProtocolAcknowledgmentsResult extends BaseV4Request {
  Data: ProtocolAcknowledgmentResultData[];
}

/** Core `AcknowledgeProtocolInput`: the version and the content hash the member read. */
export interface AcknowledgeProtocolInput {
  ProtocolVersionId: number;
  ContentHash: string;
  Offline: boolean;
  SignedOnDevice?: string | null;
}

/** Core `ProtocolAcknowledgeOutcomes` names, as `AcknowledgeProtocolResultData.Outcome` carries them (a department step-up is a 403 `step_up_required` refusal, not an outcome). */
export type ProtocolAcknowledgeOutcome = 'Acknowledged' | 'AwaitingQuiz' | 'NotAssigned' | 'NotOpened' | 'ReadNewerVersion' | 'ContentChanged';

export interface AcknowledgeProtocolResultData {
  Outcome: string;
  Accepted: boolean;
  CurrentVersionId: number | null;
  CurrentContentHash: string | null;
  AcknowledgmentId: number | null;
}

export interface AcknowledgeProtocolResult extends BaseV4Request {
  Data: AcknowledgeProtocolResultData | null;
}

/** Core `ProtocolQuizOption`: a key and its text (never which one is right). */
export interface ProtocolQuizOption {
  Key: string;
  Text: string | null;
}

/** Core `ProtocolQuizQuestion`: Kind 1 takes several answers. */
export interface ProtocolQuizQuestion {
  QuestionId: number;
  Kind: number;
  Text: string | null;
  ImageUrl: string | null;
  Points: number;
  Options: ProtocolQuizOption[] | null;
}

/** Core `ProtocolQuizView` (`GET /ProtocolAcknowledgments/GetBankQuiz`). */
export interface ProtocolQuizView {
  AttemptId: number;
  ProtocolId: number;
  ProtocolVersionId: number;
  ProtocolCode: string | null;
  ProtocolName: string | null;
  VersionLabel: string | null;
  PassMark: number;
  Questions: ProtocolQuizQuestion[] | null;
}

export interface GetBankQuizResult extends BaseV4Request {
  Data: ProtocolQuizView | null;
  Error: string | null;
}

export interface ProtocolQuizAnswer {
  QuestionId: number;
  Keys: string[];
}

export interface SubmitBankQuizInput {
  AttemptId: number;
  Answers: ProtocolQuizAnswer[];
}

/** Core `ProtocolQuizResult`. */
export interface ProtocolQuizResult {
  AttemptId: number;
  ProtocolVersionId: number;
  Percent: number;
  PassMark: number;
  Passed: boolean;
  Correct: number;
  Total: number;
  AcknowledgmentCompleted: boolean;
}

export interface SubmitBankQuizResult extends BaseV4Request {
  Data: ProtocolQuizResult | null;
  Error: string | null;
}

/** Core `ProtocolCategoryResultData` (`GET /Protocols/GetCategories`): the department's protocol categories. */
export interface ProtocolCategoryResultData {
  CategoryId: number;
  Name: string | null;
  ParentId: number | null;
  SortOrder: number;
  Kind: number | null;
}

export interface GetProtocolCategoriesResult extends BaseV4Request {
  Data: ProtocolCategoryResultData[];
}

/**
 * Core `ProtocolMicroLearningItem` (LMS weekly micro-learning): one question sent to the member; once answered, the keys chosen, the
 * correct keys and the explanation.
 */
export interface ProtocolMicroLearningItem {
  Id: number;
  ProtocolId: number;
  ProtocolCode: string | null;
  ProtocolName: string | null;
  WeekKey: string | null;
  SentOn: string;
  AnsweredOn: string | null;
  Correct: boolean | null;
  Question: ProtocolQuizQuestion | null;
  ChosenKeys: string[] | null;
  CorrectKeys: string[] | null;
  Explanation: string | null;
}

export interface GetWeeklyQuestionsResult extends BaseV4Request {
  Data: ProtocolMicroLearningItem[];
}

export interface AnswerWeeklyQuestionInput {
  Id: number;
  Keys: string[];
}

export interface AnswerWeeklyQuestionResult extends BaseV4Request {
  Data: ProtocolMicroLearningItem | null;
  Error: string | null;
}

/** Core `CallProtocolChecklistResultData`: a protocol's steps on a call, with who did what when. */
export interface CallProtocolChecklistResultData {
  CallId: string;
  CallProtocolId: string;
  ProtocolId: string;
  Code: string | null;
  Name: string | null;
  Kind: number;
  IsIncidentSop: boolean;
  ProtocolVersionId: string | null;
  VersionLabel: string | null;
  StartedOn: string | null;
  StartedByUserId: string | null;
  CompletedOn: string | null;
  CompletedByUserId: string | null;
  Done: number;
  Total: number;
  Steps: ProtocolStepResultData[] | null;
}

export interface GetCallProtocolChecklistsResult extends BaseV4Request {
  Data: CallProtocolChecklistResultData[];
}

export interface CallProtocolChecklistResult extends BaseV4Request {
  Data: CallProtocolChecklistResultData | null;
  Error: string | null;
}

/** Core `SopLibraryItemData`: a Procedure protocol in force that can be started on a call. */
export interface SopLibraryItemData {
  ProtocolId: string;
  Code: string | null;
  Name: string | null;
  VersionId: string | null;
}

export interface GetSopLibraryResult extends BaseV4Request {
  Data: SopLibraryItemData[];
}

export interface StartCallChecklistInput {
  CallId: number;
  ProtocolId: number;
}

export interface RecordCallStepInput {
  CallId: number;
  CallProtocolId: number;
  StepId: string;
  State: ProtocolStepStateValue;
  Note?: string | null;
  DeviceTimestamp?: string | null;
  ClientStepId?: string | null;
}

export interface CompleteCallChecklistInput {
  CallId: number;
  CallProtocolId: number;
}
