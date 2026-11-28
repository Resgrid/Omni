// Core v4 training shapes for Omni's Training module (Responder): the free baseline (My Training, a training with its quiz, the
// transcript, training categories and outside CE/CPD submissions with evidence; Web/Resgrid.Web.Services/Models/v4/Trainings/
// TrainingsApiModels.cs) and the LMS learner runtime (courses, the player, assessments, the Academy, paths and requirements, and
// certification progress; Models/v4/Lms/*.cs). Field names mirror Core exactly. Dates are UTC on the wire.
import type { BaseV4Request } from '../baseV4Request';

// ---------------------------------------------------------------------------------------------------------------- baseline

/** Core `TrainingAssignmentData`: StateName is the `TrainingAssignmentStates` name (Overdue, DueSoon, InProgress, Open, Completed…). */
export interface TrainingAssignmentData {
  TrainingId: number;
  Name: string | null;
  Summary: string | null;
  State: number;
  StateName: string | null;
  AssignedOn: string | null;
  DueOn: string | null;
  Viewed: boolean;
  ViewedOn: string | null;
  Complete: boolean;
  CompletedOn: string | null;
  HasQuiz: boolean;
  Score: number;
  Passed: boolean | null;
  AttemptCount: number;
  AttemptsLeft: number | null;
  Exempt: boolean;
  ExemptUntil: string | null;
  Extended: boolean;
  Hours: number | null;
}

/** Core `TrainingCatalogData`: an open training the member is not assigned to. */
export interface TrainingCatalogData {
  TrainingId: number;
  Name: string | null;
  Summary: string | null;
  CanSelfEnroll: boolean;
  HasQuiz: boolean;
  Hours: number | null;
  DueDays: number | null;
  CreatedOn: string;
}

/** Core `TrainingCertificationData`: a certification due soon, expired or pinned to My Training. */
export interface TrainingCertificationData {
  CertificationId: number;
  Name: string | null;
  ExpiresOn: string | null;
  Pinned: boolean;
  IsExpired: boolean;
  DueSoon: boolean;
  DaysLeft: number | null;
}

export interface MyTrainingsData {
  Assignments: TrainingAssignmentData[] | null;
  Catalog: TrainingCatalogData[] | null;
  Certifications: TrainingCertificationData[] | null;
  OnLeave: boolean;
}

export interface MyTrainingsResult extends BaseV4Request {
  Data: MyTrainingsData | null;
}

export interface TrainingAttachmentData {
  TrainingAttachmentId: number;
  FileName: string | null;
  FileType: string | null;
  FileSize: number | null;
}

export interface TrainingQuizOptionData {
  OptionId: number;
  Text: string | null;
}

/** Core `TrainingQuizQuestionData`: Type 1 takes several answers (Core `TrainingQuestionTypes`). */
export interface TrainingQuizQuestionData {
  QuestionId: number;
  Text: string | null;
  Type: number;
  Options: TrainingQuizOptionData[] | null;
}

export interface TrainingQuizData {
  MinimumScore: number;
  OneQuestionPerPage: boolean;
  AttemptLimit: number | null;
  Questions: TrainingQuizQuestionData[] | null;
}

/** Core `TrainingDetailData` (`GET /Trainings/GetTraining`): sanitized HTML; the quiz only when the member may take it. */
export interface TrainingDetailData {
  TrainingId: number;
  Name: string | null;
  Description: string | null;
  TrainingText: string | null;
  CreatedByUserId: string | null;
  CreatedOn: string;
  StartsOn: string | null;
  OpenToAllMembers: boolean;
  AllowSelfEnroll: boolean;
  Hours: number | null;
  CeHours: number | null;
  CeProvider: string | null;
  CeCourseNumber: string | null;
  HasQuiz: boolean;
  RequiresAcknowledgment: boolean;
  Assignment: TrainingAssignmentData | null;
  Attachments: TrainingAttachmentData[] | null;
  Quiz: TrainingQuizData | null;
}

export interface TrainingResult extends BaseV4Request {
  Data: TrainingDetailData | null;
}

export interface TrainingQuizAnswerInput {
  QuestionId: number;
  OptionIds: number[];
}

export interface SubmitTrainingQuizInput {
  TrainingId: number;
  Answers: TrainingQuizAnswerInput[];
}

/** Core `TrainingQuizSubmissionData`: Status is the `TrainingQuizSubmissionStatuses` name (Recorded, AttemptLimitReached…). */
export interface TrainingQuizSubmissionData {
  Status: string | null;
  Recorded: boolean;
  Score: number;
  Passed: boolean;
  QuestionCount: number;
  CorrectCount: number;
  AttemptNumber: number;
  AttemptsLeft: number | null;
}

export interface TrainingQuizSubmissionResult extends BaseV4Request {
  Data: TrainingQuizSubmissionData | null;
}

export interface TrainingIdInput {
  TrainingId: number;
}

export interface TrainingAssignmentResult extends BaseV4Request {
  Data: TrainingAssignmentData | null;
}

/** Core `LearningRecordData`: one transcript entry. Status: 0 pending, 1 verified, 2 rejected (voided ones are left out). */
export interface LearningRecordData {
  Id: number;
  Title: string | null;
  CourseCode: string | null;
  CompletedOn: string;
  Hours: number;
  CategoryId: number | null;
  CategoryName: string | null;
  SourceKind: number;
  SourceKindName: string | null;
  Status: number;
  StatusName: string | null;
  CeHours: number | null;
  CeProvider: string | null;
  CeCourseNumber: string | null;
  IsBackfill: boolean;
  PossibleDuplicate: boolean;
  CompletionMethod: string | null;
  RecordedByUserId: string | null;
  RecordedOn: string | null;
  RecordedSource: string | null;
  RecordedNote: string | null;
  AttestationVersion: string | null;
  Provenance: string | null;
  ReviewState: string | null;
  SubmittedOn: string | null;
  ReviewNote: string | null;
}

export interface LearningRecordsResult extends BaseV4Request {
  Data: LearningRecordData[];
}

export interface TrainingCategoryData {
  CategoryId: number;
  Name: string | null;
  Code: string | null;
  Kind: number;
  SortOrder: number;
  Description: string | null;
  TargetHours: number | null;
  TargetPeriod: number;
}

export interface TrainingCategoriesResult extends BaseV4Request {
  Data: TrainingCategoryData[];
}

/** One evidence file (base64): PDF, JPG, JPEG, PNG, GIF, WEBP, DOC, DOCX or ODT; never HEIC (Core refuses it). */
export interface TrainingEvidenceFileInput {
  FileName: string;
  ContentType: string;
  Data: string;
  Kind?: number;
}

/** Core `SubmitExternalTrainingInput`: outside training (CE/CPD) with up to five evidence files. Method: Core `MethodsOfTraining`. */
export interface SubmitExternalTrainingInput {
  Title: string;
  CompletedOn: string;
  Hours: number;
  CategoryId?: number | null;
  CeProvider?: string | null;
  CeCourseNumber?: string | null;
  CeHours?: number | null;
  Method?: number | null;
  Notes?: string | null;
  Files?: TrainingEvidenceFileInput[];
}

/** Core `ExternalTrainingSubmissionResult`: Error is the refusal code (title_required, file_type_not_allowed…). */
export interface ExternalTrainingSubmissionResult extends BaseV4Request {
  Data: LearningRecordData | null;
  ReviewRequired: boolean;
  Error: string | null;
}

// -------------------------------------------------------------------------------------------------------------- LMS learner

/** Core `LmsMyCourseData`: Status is the `LmsEnrollmentStatuses` name (NotStarted, InProgress, Completed, Withdrawn). */
export interface LmsMyCourseData {
  EnrollmentId: number;
  CourseId: number;
  CourseVersionId: number;
  Title: string | null;
  VersionLabel: string | null;
  IsAcademy: boolean;
  Status: string | null;
  ProgressPercent: number;
  AssignedOn: string;
  DueOn: string | null;
  CompletedOn: string | null;
  IsOverdue: boolean;
  CanRun: boolean;
  Hours: number;
}

export interface LmsMyCoursesResult extends BaseV4Request {
  Data: LmsMyCourseData[];
}

/** Core `LmsLessonKinds` names (Scorm covers SCORM 1.2 and 2004 packages). */
export type LmsLessonKind = 'Blocks' | 'Video' | 'Document' | 'ProtocolVersion' | 'Scorm' | 'Cmi5' | 'Assessment' | 'Survey' | 'LiveSession' | 'LtiLink';

/** Core `LmsLessonData`: Progress is the `LmsLessonProgressStatuses` name (NotStarted, InProgress, Completed). */
export interface LmsLessonData {
  LessonId: number;
  ModuleId: number;
  ModuleTitle: string | null;
  Title: string | null;
  Kind: string | null;
  IsRequired: boolean;
  IsLocked: boolean;
  Progress: string | null;
  SeatSeconds: number;
  MinimumSeatSeconds: number;
  VideoPositionSeconds: number;
  WatchedPercent: number;
  RequiredWatchPercent: number;
  ContentHtml: string | null;
  VideoSource: string | null;
  VideoUrl: string | null;
  TranscriptText: string | null;
  DocumentUrl: string | null;
  FreeResponsePrompt: string | null;
  FileRequestPrompt: string | null;
  MayAnswerOffline: boolean;
  AvailableOffline: boolean;
  /** The protocol version a ProtocolVersion lesson shows (read through `ProtocolContent/GetVersionContent`). */
  ProtocolVersionId?: number | null;
  /** The member's own uploads for a file-request lesson (metadata; bytes from `Lms/GetLessonFile`). */
  Files?: LmsLessonFileData[] | null;
  /** A survey lesson's questions (`Lms/SubmitSurvey`). */
  SurveyQuestions?: LmsSurveyQuestionData[] | null;
  /** A video lesson's caption tracks; an uploaded track has no Url here (the signed one comes with `Lms/GetLessonPlaylist`). */
  Captions?: LmsCaptionTrackData[] | null;
}

/** Core `LmsLessonFileData`. */
export interface LmsLessonFileData {
  LessonFileId: number;
  FileName: string | null;
  ContentType: string | null;
  Size: number;
  UploadedOn: string;
}

/** Core `LmsSurveyQuestionData`: Kind Rating (answer "1"–"5"), Choice (the 0-based option index) or Text. */
export interface LmsSurveyQuestionData {
  Key: string;
  Kind: string | null;
  Text: string | null;
  Options: string[] | null;
}

/** Core `LmsCaptionTrackData`: a WebVTT track. */
export interface LmsCaptionTrackData {
  Locale: string | null;
  Label: string | null;
  Url: string | null;
}

/** Core `LmsLessonPlaylistData`: signed links a player loads without the bearer token, valid until UrlExpiresOn. */
export interface LmsLessonPlaylistData {
  EnrollmentId: number;
  LessonId: number;
  PlaylistUrl: string | null;
  Mp4Url: string | null;
  UrlExpiresOn: string;
  DurationSeconds: number;
  Captions: LmsCaptionTrackData[] | null;
}

/** `GET /Lms/GetLessonPlaylist`: Error LessonLocked, AddonRequired, LapseWindowEnded, NotEntitled, MediaUnavailable or NotLicensed. */
export interface LmsLessonPlaylistResult extends BaseV4Request {
  Error: string | null;
  Data: LmsLessonPlaylistData | null;
}

/** What a launched lesson runs as (`LmsLessonLaunchData.Kind`). */
export type LmsLessonLaunchKind = 'Scorm12' | 'Scorm2004' | 'Cmi5' | 'Lti13';

/** How the launch page reports the lesson's state, and what the app accepts (`LmsLessonLaunchData.CompletionMessage`). */
export interface LmsLessonCompletionMessageData {
  /** Always `resgrid.lms.lesson`. */
  Type: string;
  Version: number;
  /** The Core web origin the launch page is served from: the only origin a message may come from. */
  Origin: string;
  EnrollmentId: number;
  LessonId: number;
  Statuses: string[];
  ResultStatuses: string[];
}

/**
 * Core `LmsLessonLaunchData` (`GET /Lms/GetLessonLaunch`, round 10 A8): a signed, single-use link (five minutes at most) to the in-app
 * launch page for a SCORM, cmi5 or LTI lesson. Opened at once; never stored or logged.
 */
export interface LmsLessonLaunchData {
  Kind: string;
  LaunchUrl: string;
  ExpiresOn: string;
  CompletionMessage: LmsLessonCompletionMessageData;
}

/** `GET /Lms/GetLessonLaunch`: Error LessonLocked, AddonRequired, LapseWindowEnded, NotLicensed, NotEntitled or MediaUnavailable (429 RateLimited). */
export interface LmsLessonLaunchResult extends BaseV4Request {
  Error: string | null;
  Data: LmsLessonLaunchData | null;
}

export interface LmsSubmitSurveyInput {
  EnrollmentId: number;
  LessonId: number;
  Answers: Record<string, string>;
}

/** Core `LmsMyAccessData` (`GET /Lms/GetMyAccess`): what the LMS is for this member now. AddonActive null when billing cannot say. */
export interface LmsMyAccessData {
  TrainingModuleOn: boolean;
  LmsFlagOn: boolean;
  AddonActive: boolean | null;
  IsLapsed: boolean;
  CanBeTrained: boolean;
  EnhancedAiActive: boolean;
}

export interface LmsMyAccessResult extends BaseV4Request {
  Data: LmsMyAccessData | null;
}

/** Core `LmsCatalogCourseData` (`GET /Lms/GetCatalog`): a self-enrollable department course. */
export interface LmsCatalogCourseData {
  CourseId: number;
  CourseVersionId: number;
  Title: string | null;
  Summary: string | null;
  Hours: number;
  VersionLabel: string | null;
  CanEnroll: boolean;
  OpenEnrollmentId: number | null;
}

export interface LmsCatalogResult extends BaseV4Request {
  Data: LmsCatalogCourseData[];
}

/** Core `RespondToTrainingSubmissionInput`: the member answers a reviewer's request for more information. */
export interface RespondToTrainingSubmissionInput {
  Id: number;
  Note: string | null;
  Hours?: number | null;
  CeHours?: number | null;
  CategoryId?: number | null;
  Files?: TrainingEvidenceFileInput[];
}

export interface TrainingSubmissionResult extends BaseV4Request {
  Data: { Record: LearningRecordData | null } | null;
  Error: string | null;
}

export interface LmsCourseResult extends BaseV4Request {
  /**
   * Null when the course may run now; otherwise the `LmsErrors` name of why not (NotLicensed, LapseWindowEnded, AddonRequired…): the
   * enrollment is read-only then (titles, kinds and progress only).
   */
  Error?: string | null;
  Course: LmsMyCourseData | null;
  CurrentLessonId: number | null;
  Lessons: LmsLessonData[];
}

export interface LmsProgressInput {
  EnrollmentId: number;
  LessonId: number;
  Seconds: number;
  VideoPositionSeconds?: number | null;
  WatchedPercent?: number | null;
}

export interface LmsCompleteLessonInput {
  EnrollmentId: number;
  LessonId: number;
  ResponseText?: string | null;
  /** A file-request lesson's upload (base64, up to 10 MB). */
  FileName?: string | null;
  FileContentType?: string | null;
  FileData?: string | null;
}

/** Core `LmsActionResult`: Error is the `LmsErrors` name (SeatTimeNotMet, ResponseRequired, LessonLocked…). */
export interface LmsActionResult extends BaseV4Request {
  Error: string | null;
  CourseCompleted: boolean;
  ProgressPercent: number;
  EnrollmentId: number | null;
}

export interface LmsStartAttemptInput {
  EnrollmentId: number;
  LessonId: number;
  Attested: boolean;
}

export interface LmsQuestionOptionData {
  Key: string;
  Text: string | null;
}

/** Core `LmsQuestionData`: Kind is the `LmsQuestionKinds` name (SingleChoice, MultiChoice, TrueFalse, Ordering, ShortAnswer). */
export interface LmsQuestionData {
  QuestionId: number;
  Kind: string | null;
  Text: string | null;
  ImageUrl: string | null;
  Points: number;
  Options: LmsQuestionOptionData[] | null;
}

export interface LmsAttemptResult extends BaseV4Request {
  Error: string | null;
  AttemptId: number;
  DeadlineOn: string | null;
  SecondsRemaining: number | null;
  Questions: LmsQuestionData[];
}

export interface LmsAnswerInput {
  QuestionId: number;
  Keys: string[];
  Text?: string | null;
}

export interface LmsSubmitAttemptInput {
  AttemptId: number;
  Answers: LmsAnswerInput[];
}

export interface LmsReviewedQuestionData {
  QuestionId: number;
  Correct: boolean | null;
  AwaitingGrade: boolean;
  CorrectKeys: string[] | null;
  Explanation: string | null;
}

export interface LmsAttemptOutcomeResult extends BaseV4Request {
  Error: string | null;
  AttemptId: number;
  Percent: number;
  Passed: boolean | null;
  CourseCompleted: boolean;
  Questions: LmsReviewedQuestionData[];
}

/** Core `LmsAcademyLessonData`: a free Resgrid Academy lesson (runs for every department with the Trainings module on). */
export interface LmsAcademyLessonData {
  LessonId: string;
  CourseId: number;
  Title: string | null;
  Minutes: number;
  Hours: number;
  IsWalkthrough: boolean;
  EnrollmentId: number | null;
  Completed: boolean;
}

export interface LmsAcademyResult extends BaseV4Request {
  Data: LmsAcademyLessonData[];
}

/** Core `LmsMyPathStepData`: Kind Course or Training; State Locked, Available or Done. */
export interface LmsMyPathStepData {
  Order: number;
  Kind: string | null;
  TargetId: number;
  Title: string | null;
  State: string | null;
  CompletedOn: string | null;
  Prerequisites: number[] | null;
  ElectiveGroup: number | null;
  EnrollmentId: number | null;
}

export interface LmsMyPathData {
  PathId: number;
  Title: string | null;
  IsAcademy: boolean;
  AssignedOn: string;
  DueOn: string | null;
  CompletedOn: string | null;
  Done: number;
  Needed: number;
  Steps: LmsMyPathStepData[] | null;
}

export interface LmsMyPathsResult extends BaseV4Request {
  Data: LmsMyPathData[];
}

/** Core `LmsCertificationItemProgressData`. */
export interface LmsCertificationItemProgressData {
  ItemId: number;
  Kind: string | null;
  Label: string | null;
  RequireRecordedByInstructor: boolean;
  Done: boolean;
  Progress: number;
  Required: number;
  LastCompletedOn: string | null;
  RecordedByInstructor: boolean;
  TargetId: number | null;
}

/** Core `LmsCertificationProgressData` ("3 of 4 done" toward a certification backed by a requirement set). */
export interface LmsCertificationProgressData {
  CertificationTypeId: number;
  CertificationTypeName: string | null;
  CertificationTypeCode: string | null;
  CertificationId: number | null;
  ExpiresOn: string | null;
  DaysUntilExpiry: number | null;
  State: string | null;
  Done: number;
  Total: number;
  WindowStart: string | null;
  WindowEnd: string | null;
  NextExpiresOn: string | null;
  IsRenewal: boolean;
  Items: LmsCertificationItemProgressData[] | null;
}

export interface LmsCertificationProgressResult extends BaseV4Request {
  Data: LmsCertificationProgressData[];
}
