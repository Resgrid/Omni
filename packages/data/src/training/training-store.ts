import {
  acknowledgeTraining,
  type ApiError,
  completeLmsLesson,
  enrollLmsCourse,
  getLmsAcademy,
  getLmsCatalog,
  getLmsCourse,
  getLmsLessonLaunch,
  getLmsLessonPlaylist,
  getMyLmsAccess,
  getMyLmsCertificationProgress,
  getMyLmsCourses,
  getMyLmsPaths,
  getMyTrainings,
  getTraining,
  getTrainingCategories,
  getTrainingTranscript,
  isApiError,
  respondToTrainingSubmission,
  saveLmsProgress,
  selfEnrollTraining,
  startLmsAttempt,
  submitExternalTraining,
  submitLmsAttempt,
  submitLmsSurvey,
  submitTrainingQuiz,
} from '@resgrid/api';
import type {
  ExternalTrainingSubmissionResult,
  LearningRecordData,
  LmsAcademyLessonData,
  LmsActionResult,
  LmsAnswerInput,
  LmsAttemptOutcomeResult,
  LmsAttemptResult,
  LmsCatalogCourseData,
  LmsCertificationProgressData,
  LmsCourseResult,
  LmsLessonLaunchData,
  LmsLessonPlaylistResult,
  LmsMyAccessData,
  LmsMyCourseData,
  LmsMyPathData,
  MyTrainingsData,
  RespondToTrainingSubmissionInput,
  SubmitExternalTrainingInput,
  TrainingCategoryData,
  TrainingDetailData,
  TrainingQuizAnswerInput,
  TrainingQuizSubmissionData,
  TrainingSubmissionResult,
} from '@resgrid/models';
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { unwrapItem, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

type TrainingSlice = 'mine' | 'detail' | 'transcript' | 'categories' | 'courses' | 'course' | 'paths' | 'academy' | 'certificationProgress' | 'access' | 'catalog';

/** A refusal from the server: the code it names (`title_required`, `SeatTimeNotMet`…), or the data error's code. */
export interface TrainingActionOutcome<T> {
  value: T | null;
  error: string | null;
}

interface TrainingData extends SliceMeta<TrainingSlice> {
  my: MyTrainingsData | null;
  trainingsById: Record<number, TrainingDetailData>;
  transcript: LearningRecordData[];
  categories: TrainingCategoryData[];
  courses: LmsMyCourseData[];
  /** Course outlines by enrollment id. */
  coursesByEnrollment: Record<number, LmsCourseResult>;
  paths: LmsMyPathData[];
  academy: LmsAcademyLessonData[];
  certificationProgress: LmsCertificationProgressData[];
  /** What the LMS is for this member (`Lms/GetMyAccess`); null until read, or from a server without it. */
  access: LmsMyAccessData | null;
  /** Self-enrollable department courses (`Lms/GetCatalog`). */
  catalog: LmsCatalogCourseData[];
}

export interface TrainingState extends TrainingData {
  fetchMyTrainings: (options?: FetchOptions) => Promise<void>;
  fetchTraining: (trainingId: number, options?: FetchOptions) => Promise<TrainingDetailData | null>;
  fetchTranscript: (options?: FetchOptions) => Promise<void>;
  fetchCategories: (options?: FetchOptions) => Promise<void>;
  /** The LMS learner lists (courses, paths, Academy, certification progress); each answers 404 where it is dark. */
  fetchLearning: (options?: FetchOptions & { lms?: boolean }) => Promise<void>;
  fetchCourse: (enrollmentId: number, options?: FetchOptions) => Promise<LmsCourseResult | null>;
  submitQuiz: (trainingId: number, answers: TrainingQuizAnswerInput[]) => Promise<TrainingActionOutcome<TrainingQuizSubmissionData>>;
  selfEnroll: (trainingId: number) => Promise<boolean>;
  acknowledgeTraining: (trainingId: number) => Promise<boolean>;
  submitExternal: (input: SubmitExternalTrainingInput) => Promise<TrainingActionOutcome<ExternalTrainingSubmissionResult>>;
  enrollCourse: (courseId: number) => Promise<TrainingActionOutcome<LmsActionResult>>;
  saveProgress: (enrollmentId: number, lessonId: number, seconds: number, video?: { positionSeconds: number; watchedPercent: number }) => Promise<void>;
  completeLesson: (enrollmentId: number, lessonId: number, extra?: LessonCompletionExtra) => Promise<TrainingActionOutcome<LmsActionResult>>;
  fetchAccess: (options?: FetchOptions) => Promise<LmsMyAccessData | null>;
  fetchCatalog: (options?: FetchOptions) => Promise<void>;
  /** A hosted video lesson's signed links (read again when they expire). */
  getLessonPlaylist: (enrollmentId: number, lessonId: number) => Promise<TrainingActionOutcome<LmsLessonPlaylistResult>>;
  /**
   * A SCORM, cmi5 or LTI lesson's signed, single-use launch (round 10 A8), for the player to open at once. Never kept in the store or
   * logged. Refusals: LessonLocked, AddonRequired, LapseWindowEnded, NotLicensed, NotEntitled, MediaUnavailable, RateLimited (429),
   * not_found (404: module or flag off, not this member's enrollment, not a launch lesson).
   */
  getLessonLaunch: (enrollmentId: number, lessonId: number, item?: string) => Promise<TrainingActionOutcome<LmsLessonLaunchData>>;
  submitSurvey: (enrollmentId: number, lessonId: number, answers: Record<string, string>) => Promise<TrainingActionOutcome<LmsActionResult>>;
  /** Answers a reviewer's request for more information on a CE/CPD submission. */
  respondToSubmission: (input: RespondToTrainingSubmissionInput) => Promise<TrainingActionOutcome<TrainingSubmissionResult>>;
  startAttempt: (enrollmentId: number, lessonId: number, attested: boolean) => Promise<TrainingActionOutcome<LmsAttemptResult>>;
  submitAttempt: (attemptId: number, answers: LmsAnswerInput[]) => Promise<TrainingActionOutcome<LmsAttemptOutcomeResult>>;
}

const initialData = (): TrainingData => ({
  ...emptySliceMeta<TrainingSlice>(),
  my: null,
  trainingsById: {},
  transcript: [],
  categories: [],
  courses: [],
  coursesByEnrollment: {},
  paths: [],
  academy: [],
  certificationProgress: [],
  access: null,
  catalog: [],
});

/** The department switched the Trainings module off: Core answers every training endpoint 404 (T0 item 1b). */
export const isTrainingModuleOff = (error: DataError | null | undefined): boolean => error?.code === 'not_found';

/**
 * Retention for the offline copies: a training is kept while it is one of the member's assignments or in the open catalog,
 * a course outline while its enrollment is one of the member's courses.
 */
export function retainTrainings(byId: Record<number, TrainingDetailData>, my: MyTrainingsData | null): Record<number, TrainingDetailData> {
  const keep = new Set([...(my?.Assignments ?? []).map((item) => item.TrainingId), ...(my?.Catalog ?? []).map((item) => item.TrainingId)]);

  return Object.fromEntries(Object.entries(byId).filter(([id]) => keep.has(Number(id))));
}

export function retainCourses(byEnrollment: Record<number, LmsCourseResult>, courses: readonly LmsMyCourseData[]): Record<number, LmsCourseResult> {
  const keep = new Set(courses.map((course) => course.EnrollmentId));

  return Object.fromEntries(Object.entries(byEnrollment).filter(([id]) => keep.has(Number(id))));
}

/** A copy of `byId` without `id`. */
const withoutKey = <T>(byId: Record<number, T>, id: number): Record<number, T> => Object.fromEntries(Object.entries(byId).filter(([key]) => Number(key) !== id));

/** A file-request lesson's upload and a free response, sent with CompleteLesson. */
export interface LessonCompletionExtra {
  responseText?: string;
  file?: { name: string; contentType: string; base64: string };
}

/** A server refusal code from a v4 envelope's `Error`, ignoring Core's "None". */
const refusal = (error: string | null | undefined): string | null => (error && error !== 'None' ? error : null);

/** A v4 refusal body: `{ Error: "file_type_not_allowed" }` (a code, never free text). */
const REFUSAL_BODY = z.object({ Error: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{1,80}$/) });

/** The refusal code a v4 400 answer carries in its body (`{ Error: "file_type_not_allowed" }`), when it has one. */
export function refusalCodeOf(error: ApiError): string | null {
  const parsed = REFUSAL_BODY.safeParse(error.data);

  return parsed.success ? refusal(parsed.data.Error) : null;
}

let runner: SliceRunner<TrainingSlice, TrainingState>;

/**
 * Training for the member (Responder `training` module): the free baseline — My Training (assignments, open catalog, due
 * certifications), a training with its quiz, the transcript and outside CE/CPD submissions — and the LMS learner (courses,
 * the player, assessments, paths, the free Academy and certification progress). Lists persist for offline reading; every
 * write is online only (quizzes and assessments are scored on the server).
 */
export const useTrainingStore = create<TrainingState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<TrainingSlice, TrainingState>('training', set);
      const ctx = () => getDataApiContext();

      const attempt = async <T>(fn: () => Promise<T>, errorOf: (value: T) => string | null): Promise<TrainingActionOutcome<T>> => {
        try {
          const value = await fn();
          const error = errorOf(value);

          return { value: error ? null : value, error };
        } catch (error) {
          return { value: null, error: (isApiError(error) ? refusalCodeOf(error) : null) ?? toDataError(error).code };
        }
      };

      return {
        ...initialData(),
        fetchMyTrainings: async () => {
          await runner.run(
            'mine',
            async () => unwrapItem(await getMyTrainings(ctx())),
            (my, state) => ({ my, trainingsById: retainTrainings(state.trainingsById, my) })
          );
        },
        fetchTraining: async (trainingId, options) => {
          const cached = get().trainingsById[trainingId];

          if (cached && !options?.bypassCache) return cached;

          const result = await runner.run(
            'detail',
            async () => unwrapItem(await getTraining(ctx(), { trainingId })),
            // Core answered that the training is gone (`not_found`): its offline copy goes too. A failed read keeps it.
            (training, state) => ({ trainingsById: training ? { ...state.trainingsById, [trainingId]: training } : withoutKey(state.trainingsById, trainingId) }),
            { flightKey: `detail:${trainingId}`, raceKey: `detail:${trainingId}` }
          );

          return result.ok ? (result.value ?? null) : (cached ?? null);
        },
        fetchTranscript: async (options) => {
          await runner.run(
            'transcript',
            async () => unwrapList(await getTrainingTranscript(ctx())),
            (transcript) => ({ transcript }),
            // A refresh after a write must read after it, not join a read that started before it.
            { trailing: options?.bypassCache === true }
          );
        },
        fetchCategories: async () => {
          await runner.run(
            'categories',
            async () => unwrapList(await getTrainingCategories(ctx())),
            (categories) => ({ categories })
          );
        },
        fetchLearning: async (options) => {
          const reads: Promise<unknown>[] = [
            runner.run(
              'courses',
              async () => unwrapList(await getMyLmsCourses(ctx())),
              (courses, state) => ({ courses, coursesByEnrollment: retainCourses(state.coursesByEnrollment, courses) })
            ),
            runner.run(
              'paths',
              async () => unwrapList(await getMyLmsPaths(ctx())),
              (paths) => ({ paths })
            ),
            runner.run(
              'academy',
              async () => unwrapList(await getLmsAcademy(ctx())),
              (academy) => ({ academy })
            ),
          ];

          // Certification progress and the department catalog are LMS reads: asked only while the LMS is on for the member.
          if (options?.lms === true)
            reads.push(
              runner.run(
                'certificationProgress',
                async () => unwrapList(await getMyLmsCertificationProgress(ctx())),
                (certificationProgress) => ({ certificationProgress })
              ),
              get().fetchCatalog()
            );
          await Promise.allSettled(reads);
        },
        fetchAccess: async () => {
          const result = await runner.run(
            'access',
            async () => unwrapItem(await getMyLmsAccess(ctx())),
            (access) => ({ access })
          );

          return result.ok ? (result.value ?? null) : get().access;
        },
        fetchCatalog: async () => {
          await runner.run(
            'catalog',
            async () => unwrapList(await getLmsCatalog(ctx())),
            (catalog) => ({ catalog })
          );
        },
        getLessonPlaylist: (enrollmentId, lessonId) =>
          attempt(
            async () => getLmsLessonPlaylist(ctx(), { enrollmentId, lessonId }),
            (result) => refusal(result?.Error) ?? (result?.Data ? null : 'MediaUnavailable')
          ),
        getLessonLaunch: async (enrollmentId, lessonId, item) => {
          const outcome = await attempt(
            async () => getLmsLessonLaunch(ctx(), item ? { enrollmentId, lessonId, item } : { enrollmentId, lessonId }),
            (result) => refusal(result?.Error) ?? (result?.Data?.LaunchUrl ? null : 'MediaUnavailable')
          );

          return { value: outcome.value?.Data ?? null, error: outcome.error };
        },
        submitSurvey: async (enrollmentId, lessonId, answers) => {
          const outcome = await attempt(
            async () => submitLmsSurvey(ctx(), { EnrollmentId: enrollmentId, LessonId: lessonId, Answers: answers }),
            (result) => refusal(result?.Error)
          );

          void Promise.allSettled([get().fetchCourse(enrollmentId, { bypassCache: true }), get().fetchLearning({ bypassCache: true })]);

          return outcome;
        },
        respondToSubmission: async (input) => {
          const outcome = await attempt(
            async () => respondToTrainingSubmission(ctx(), input),
            (result) => refusal(result?.Error)
          );

          if (outcome.value) void get().fetchTranscript({ bypassCache: true });

          return outcome;
        },
        fetchCourse: async (enrollmentId, options) => {
          const cached = get().coursesByEnrollment[enrollmentId];

          if (cached && !options?.bypassCache) return cached;

          const result = await runner.run(
            'course',
            async () => getLmsCourse(ctx(), { enrollmentId }),
            (course, state) => (course ? { coursesByEnrollment: { ...state.coursesByEnrollment, [enrollmentId]: course } } : {}),
            { flightKey: `course:${enrollmentId}`, raceKey: `course:${enrollmentId}` }
          );

          return result.ok ? (result.value ?? null) : (cached ?? null);
        },
        submitQuiz: async (trainingId, answers) => {
          const outcome = await attempt<TrainingQuizSubmissionData>(
            async () => {
              const data = (await submitTrainingQuiz(ctx(), { TrainingId: trainingId, Answers: answers })).Data;

              if (!data) throw new Error('rejected');

              return data;
            },
            (data) => (data.Recorded ? null : (data.Status ?? 'rejected'))
          );

          if (outcome.value) void Promise.allSettled([get().fetchMyTrainings({ bypassCache: true }), get().fetchTraining(trainingId, { bypassCache: true })]);

          return outcome;
        },
        selfEnroll: async (trainingId) => {
          const outcome = await attempt(
            async () => selfEnrollTraining(ctx(), { TrainingId: trainingId }),
            (result) => (result?.Data ? null : 'rejected')
          );

          await get().fetchMyTrainings({ bypassCache: true });

          return outcome.error === null;
        },
        acknowledgeTraining: async (trainingId) => {
          const outcome = await attempt(
            async () => acknowledgeTraining(ctx(), { TrainingId: trainingId }),
            (result) => (result?.Data ? null : 'rejected')
          );

          if (!outcome.error) void Promise.allSettled([get().fetchMyTrainings({ bypassCache: true }), get().fetchTraining(trainingId, { bypassCache: true })]);

          return outcome.error === null;
        },
        submitExternal: async (input) => {
          const outcome = await attempt(
            async () => submitExternalTraining(ctx(), input),
            (result) => refusal(result?.Error) ?? (result?.Data ? null : 'rejected')
          );

          if (outcome.value) void get().fetchTranscript({ bypassCache: true });

          return outcome;
        },
        enrollCourse: async (courseId) => {
          const outcome = await attempt(
            async () => enrollLmsCourse(ctx(), { courseId }),
            (result) => refusal(result?.Error)
          );

          if (outcome.value) await get().fetchLearning({ bypassCache: true });

          return outcome;
        },
        saveProgress: async (enrollmentId, lessonId, seconds, video) => {
          try {
            await saveLmsProgress(ctx(), {
              EnrollmentId: enrollmentId,
              LessonId: lessonId,
              Seconds: Math.max(0, Math.round(seconds)),
              VideoPositionSeconds: video ? Math.round(video.positionSeconds) : null,
              WatchedPercent: video ? Math.round(video.watchedPercent) : null,
            });
          } catch {
            // A missed heartbeat only costs seat time the server caps by its own clock anyway; the next one carries on.
          }
        },
        completeLesson: async (enrollmentId, lessonId, extra) => {
          const outcome = await attempt(
            async () =>
              completeLmsLesson(ctx(), {
                EnrollmentId: enrollmentId,
                LessonId: lessonId,
                ResponseText: extra?.responseText || null,
                FileName: extra?.file?.name ?? null,
                FileContentType: extra?.file?.contentType ?? null,
                FileData: extra?.file?.base64 ?? null,
              }),
            (result) => refusal(result?.Error)
          );

          void Promise.allSettled([get().fetchCourse(enrollmentId, { bypassCache: true }), get().fetchLearning({ bypassCache: true })]);

          return outcome;
        },
        startAttempt: (enrollmentId, lessonId, attested) =>
          attempt(
            async () => startLmsAttempt(ctx(), { EnrollmentId: enrollmentId, LessonId: lessonId, Attested: attested }),
            (result) => refusal(result?.Error)
          ),
        submitAttempt: async (attemptId, answers) => {
          const outcome = await attempt(
            async () => submitLmsAttempt(ctx(), { AttemptId: attemptId, Answers: answers }),
            (result) => refusal(result?.Error)
          );

          return outcome;
        },
      };
    },
    dataPersistOptions<
      TrainingState,
      Pick<TrainingData, 'my' | 'trainingsById' | 'transcript' | 'categories' | 'courses' | 'coursesByEnrollment' | 'paths' | 'academy' | 'certificationProgress' | 'access' | 'catalog' | 'fetchedAt'>
    >({
      name: 'omni-training-storage',
      partialize: (state) => ({
        my: state.my,
        trainingsById: state.trainingsById,
        transcript: state.transcript,
        categories: state.categories,
        courses: state.courses,
        coursesByEnrollment: state.coursesByEnrollment,
        paths: state.paths,
        academy: state.academy,
        certificationProgress: state.certificationProgress,
        access: state.access,
        catalog: state.catalog,
        fetchedAt: state.fetchedAt,
      }),
    })
  )
);

registerPersistedStore('omni-training-storage', useTrainingStore);

registerDataStoreReset<TrainingState>('training', useTrainingStore, initialData, () => runner.invalidate());
