// Training feature (Responder `training` module; protocols-training-knowledge-plan §13, §17, §18.3): the free baseline (My
// Training, trainings and quizzes, the transcript, CE/CPD submissions with evidence, the Resgrid Academy) and the LMS learner
// (courses, paths, assessments and certification progress) behind the LMS add-on. Re-exported through one statement.
import { EvidencePicker, type EvidencePickerProps } from './components/evidence-picker';
import { captionTracks, HostedVideoPlayer, type HostedVideoPlayerProps, preferredTrack } from './components/hosted-video-player';
import { SurveyForm, type SurveyFormProps } from './components/survey-form';
import {
  AcademyRow,
  AssignmentRow,
  CatalogCourseRow,
  CatalogRow,
  CertificationProgressCard,
  CertificationRow,
  CourseRow,
  isInfoRequested,
  PathCard,
  RecordRow,
  type RecordRowProps,
  WeeklyQuestionCard,
} from './components/training-rows';
import { base64Bytes, type EvidenceFile, evidenceProblem, EvidenceTypeError, MAX_EVIDENCE_FILES, pickEvidenceDocument, pickEvidencePhoto, toEvidenceInputs } from './lib/evidence';
import { submissionErrorKey, type SubmissionFormValues, toSubmissionInput, validateSubmission } from './lib/submission';
import {
  assessmentQuestions,
  assignmentStateKey,
  courseStatusKey,
  currentLesson,
  isAssignmentOpen,
  isPlayableLesson,
  isSurveyComplete,
  lmsErrorKey,
  type LmsVisibility,
  lmsVisibility,
  recordStatusKey,
  verifiedHours,
  visibleCourses,
  visiblePaths,
} from './lib/training-format';
import { type CaptionCue, cueAt, isPlaylistExpired, parseWebVtt, vttSeconds, watchedPercent } from './lib/webvtt';
import { trainingNav } from './nav';
import { parseTrainingRouteId, TRAINING_ROUTE_PATTERNS, trainingRoutes } from './routes';
import { type CoursePlayerScreenProps, default as CoursePlayerScreen } from './screens/course-player';
import { default as RespondSubmissionScreen, respondProblem } from './screens/respond-submission';
import { default as SubmitHoursScreen } from './screens/submit-hours';
import { default as TrainingDetailScreen, type TrainingDetailScreenProps } from './screens/training-detail';
import { default as TrainingHomeScreen } from './screens/training-home';

export {
  AcademyRow,
  assessmentQuestions,
  AssignmentRow,
  assignmentStateKey,
  base64Bytes,
  type CaptionCue,
  captionTracks,
  CatalogCourseRow,
  CatalogRow,
  CertificationProgressCard,
  CertificationRow,
  CoursePlayerScreen,
  type CoursePlayerScreenProps,
  CourseRow,
  courseStatusKey,
  cueAt,
  currentLesson,
  type EvidenceFile,
  EvidencePicker,
  type EvidencePickerProps,
  evidenceProblem,
  EvidenceTypeError,
  HostedVideoPlayer,
  type HostedVideoPlayerProps,
  isAssignmentOpen,
  isInfoRequested,
  isPlayableLesson,
  isPlaylistExpired,
  isSurveyComplete,
  lmsErrorKey,
  type LmsVisibility,
  lmsVisibility,
  MAX_EVIDENCE_FILES,
  parseTrainingRouteId,
  parseWebVtt,
  PathCard,
  pickEvidenceDocument,
  pickEvidencePhoto,
  preferredTrack,
  RecordRow,
  type RecordRowProps,
  recordStatusKey,
  respondProblem,
  RespondSubmissionScreen,
  submissionErrorKey,
  type SubmissionFormValues,
  SubmitHoursScreen,
  SurveyForm,
  type SurveyFormProps,
  toEvidenceInputs,
  toSubmissionInput,
  TRAINING_ROUTE_PATTERNS,
  TrainingDetailScreen,
  type TrainingDetailScreenProps,
  TrainingHomeScreen,
  trainingNav,
  trainingRoutes,
  validateSubmission,
  verifiedHours,
  visibleCourses,
  visiblePaths,
  vttSeconds,
  watchedPercent,
  WeeklyQuestionCard,
};
