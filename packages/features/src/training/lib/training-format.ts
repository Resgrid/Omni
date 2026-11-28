import type { LearningRecordData, LmsLessonData, LmsMyAccessData, LmsMyCourseData, LmsMyPathData, LmsQuestionData, LmsSurveyQuestionData, TrainingAssignmentData } from '@resgrid/models';

import type { QuizQuestionView } from '../../protocols/components/quiz-form';

/** Core `TrainingAssignmentStates` names → translation keys (an unknown state reads as open). */
const ASSIGNMENT_STATE_KEYS = new Map<string, string>([
  ['NotStarted', 'training.state.not_started'],
  ['InProgress', 'training.state.in_progress'],
  ['Failed', 'training.state.failed'],
  ['Complete', 'training.state.complete'],
  ['Overdue', 'training.state.overdue'],
  ['Exempt', 'training.state.exempt'],
  ['OnLeave', 'training.state.on_leave'],
  ['Scheduled', 'training.state.scheduled'],
]);

export const assignmentStateKey = (assignment: Pick<TrainingAssignmentData, 'StateName'>): string => ASSIGNMENT_STATE_KEYS.get(assignment.StateName ?? '') ?? 'training.state.not_started';

/** Whether an assignment still asks something of the member (not complete, exempt or removed). */
export const isAssignmentOpen = (assignment: Pick<TrainingAssignmentData, 'Complete' | 'Exempt' | 'StateName'>): boolean => !assignment.Complete && !assignment.Exempt && assignment.StateName !== 'Removed';

/** Core `LmsEnrollmentStatuses` names → translation keys. */
export function courseStatusKey(course: Pick<LmsMyCourseData, 'Status' | 'IsOverdue'>): string {
  if (course.Status === 'Completed') return 'training.state.complete';

  if (course.IsOverdue) return 'training.state.overdue';

  return course.Status === 'InProgress' ? 'training.state.in_progress' : 'training.state.not_started';
}

/** Learning record status (0 pending review, 1 verified, 2 rejected). */
export function recordStatusKey(record: Pick<LearningRecordData, 'Status'>): string {
  switch (record.Status) {
    case 1:
      return 'training.transcript.verified';
    case 2:
      return 'training.transcript.rejected';
    default:
      return 'training.transcript.pending';
  }
}

/** Core `LearningRecordSourceKinds` → translation keys (an unknown source reads as a training record). */
const SOURCE_KEYS = new Map<number, string>([
  [0, 'training.transcript.source_course'],
  [1, 'training.transcript.source_class'],
  [2, 'training.transcript.source_record'],
  [3, 'training.transcript.source_external'],
  [4, 'training.transcript.source_skill'],
]);

export const recordSourceKey = (record: Pick<LearningRecordData, 'SourceKind'>): string => SOURCE_KEYS.get(record.SourceKind) ?? 'training.transcript.source_record';

/** Total hours on the transcript that count (verified records only, as Core counts them). */
export const verifiedHours = (records: readonly Pick<LearningRecordData, 'Status' | 'Hours'>[]): number =>
  Math.round(records.filter((record) => record.Status === 1).reduce((sum, record) => sum + (record.Hours || 0), 0) * 100) / 100;

/** Core `MethodsOfTraining`. */
export const TRAINING_METHODS = [
  { value: 0, labelKey: 'training.method.classroom' },
  { value: 1, labelKey: 'training.method.online' },
  { value: 2, labelKey: 'training.method.drill' },
  { value: 3, labelKey: 'training.method.virtual' },
  { value: 4, labelKey: 'training.method.self_study' },
  { value: 5, labelKey: 'training.method.on_the_job' },
] as const;

/**
 * What the LMS is for this member (§17 packaging): `departmentLms` — department courses, paths, the course catalog, certification
 * progress and weekly questions — needs the Training.Lms flag, the add-on active and a licensed seat (`Lms/GetMyAccess`); with
 * `keepEnrolled` (a lapsed add-on, the member still licensed) only courses already enrolled that Core says can still run stay, so
 * nobody is stranded mid-course (lapse rule 4). Without the access answer (an older server) the operator flag alone decides, as
 * before. The free Resgrid Academy and the baseline never depend on it.
 */
export interface LmsVisibility {
  departmentLms: boolean;
  keepEnrolled: boolean;
}

export function lmsVisibility(access: LmsMyAccessData | null | undefined, flagOn: boolean): LmsVisibility {
  if (!access) return { departmentLms: flagOn, keepEnrolled: false };

  const licensed = access.TrainingModuleOn && access.LmsFlagOn && access.CanBeTrained;

  return { departmentLms: licensed && access.AddonActive === true, keepEnrolled: licensed && access.AddonActive !== true && access.IsLapsed };
}

/** Courses to list: the Academy always; department courses while the LMS is on (or kept through a lapse) and Core says they run. */
export function visibleCourses(courses: readonly LmsMyCourseData[], visibility: LmsVisibility): LmsMyCourseData[] {
  return courses.filter((course) => {
    if (course.IsAcademy) return true;

    if (visibility.departmentLms) return course.CanRun || course.Status === 'Completed';

    return visibility.keepEnrolled && course.CanRun && course.Status !== 'Completed';
  });
}

export function visiblePaths(paths: readonly LmsMyPathData[], visibility: LmsVisibility): LmsMyPathData[] {
  return paths.filter((path) => path.IsAcademy || visibility.departmentLms);
}

/** Survey answers Core takes: Rating "1"–"5", Choice the 0-based option index; Text is optional. */
export function isSurveyComplete(questions: readonly LmsSurveyQuestionData[], answers: Readonly<Record<string, string>>): boolean {
  return questions.every((question) => question.Kind === 'Text' || (answers[question.Key] ?? '') !== '');
}

/** The lesson to open first: the one Core says the member is on, else the first unlocked lesson not completed, else the first. */
export function currentLesson(lessons: readonly LmsLessonData[], currentLessonId: number | null | undefined): LmsLessonData | null {
  return lessons.find((lesson) => lesson.LessonId === currentLessonId) ?? lessons.find((lesson) => !lesson.IsLocked && lesson.Progress !== 'Completed') ?? lessons[0] ?? null;
}

/** Lesson kinds the app plays itself; the rest (SCORM, surveys, live sessions, LTI) open on the web. */
export const isPlayableLesson = (lesson: Pick<LmsLessonData, 'Kind'>): boolean =>
  lesson.Kind === 'Blocks' || lesson.Kind === 'Video' || lesson.Kind === 'Document' || lesson.Kind === 'Assessment' || lesson.Kind === 'ProtocolVersion' || lesson.Kind === 'Survey';

/** LMS assessment questions as the quiz form shows them (short answers are written; ordering is answered by picking in order). */
export const assessmentQuestions = (questions: readonly LmsQuestionData[] | null | undefined): QuizQuestionView[] =>
  (questions ?? []).map((question) => ({
    id: String(question.QuestionId),
    text: question.Text ?? '',
    multiple: question.Kind === 'MultiChoice' || question.Kind === 'Ordering',
    freeText: question.Kind === 'ShortAnswer',
    options: (question.Options ?? []).map((option) => ({ key: option.Key, text: option.Text ?? '' })),
  }));

/** Translation key for an LMS refusal (`LmsErrors` name) or a data error code. */
export function lmsErrorKey(code: string | null | undefined): string {
  switch (code) {
    case 'SeatTimeNotMet':
      return 'training.errors.seat_time';
    case 'ResponseRequired':
      return 'training.errors.response_required';
    case 'LessonLocked':
      return 'training.errors.locked';
    case 'AttemptLimitReached':
      return 'training.errors.attempt_limit';
    case 'CooldownActive':
      return 'training.errors.cooldown';
    case 'TimeExpired':
      return 'training.errors.time_expired';
    case 'AddonRequired':
    case 'LapseWindowEnded':
    case 'NotEntitled':
    case 'NotLicensed':
      return 'training.errors.not_available';
    case 'RequirementNotMet':
      return 'training.errors.requirement';
    case 'MediaUnavailable':
      return 'training.errors.media_unavailable';
    case 'FileTooLarge':
      return 'training.errors.file_too_large';
    case 'AlreadySubmitted':
      return 'training.errors.already_submitted';
    case 'InvalidInput':
      return 'training.errors.invalid_input';
    case 'network':
      return 'errors.data.network';
    default:
      return 'training.errors.generic';
  }
}

/** Seconds of seat time between progress heartbeats while a lesson is open. */
export const HEARTBEAT_SECONDS = 30;
