import type {
  ExternalTrainingSubmissionResult,
  LearningRecordsResult,
  LmsAcademyResult,
  LmsActionResult,
  LmsAttemptOutcomeResult,
  LmsAttemptResult,
  LmsCatalogResult,
  LmsCertificationProgressResult,
  LmsCompleteLessonInput,
  LmsCourseResult,
  LmsLessonLaunchResult,
  LmsLessonPlaylistResult,
  LmsMyAccessResult,
  LmsMyCoursesResult,
  LmsMyPathsResult,
  LmsProgressInput,
  LmsStartAttemptInput,
  LmsSubmitAttemptInput,
  LmsSubmitSurveyInput,
  MyTrainingsResult,
  RespondToTrainingSubmissionInput,
  SubmitExternalTrainingInput,
  SubmitTrainingQuizInput,
  TrainingAssignmentResult,
  TrainingCategoriesResult,
  TrainingIdInput,
  TrainingQuizSubmissionResult,
  TrainingResult,
  TrainingSubmissionResult,
} from '@resgrid/models';

import { type ApiContext, ApiError, type BinaryResponse, defineEndpoints, request, requestBinary, type RequestOptions, type ResgridRequestConfig, toApiError } from '../../core';

/**
 * Core v4 training endpoints for Omni's Training module (Responder). The free baseline (`Trainings/*`: My Training, a training and
 * its quiz, the transcript, categories and outside CE/CPD submissions) answers 404 while the department's Trainings module is off.
 * The LMS learner runtime (`Lms/*`, `LmsRequirements/GetMyPaths`, `LmsPrograms/GetMyCertificationProgress`) follows the LMS gate
 * (Training.Lms flag, module, add-on and lapse rules); the Academy runs for every department with the module on. The contract
 * test checks every entry against Swagger.
 */
export const trainingEndpoints = defineEndpoints('training', {
  getMyTrainings: { method: 'GET', path: '/Trainings/GetMyTrainings' },
  getTraining: { method: 'GET', path: '/Trainings/GetTraining', query: ['trainingId'] },
  getTrainingAttachment: { method: 'GET', path: '/Trainings/GetTrainingAttachment', query: ['trainingAttachmentId'], responseType: 'arraybuffer' },
  submitTrainingQuiz: { method: 'POST', path: '/Trainings/SubmitQuiz', body: 'json' },
  selfEnrollTraining: { method: 'POST', path: '/Trainings/SelfEnroll', body: 'json' },
  acknowledgeTraining: { method: 'POST', path: '/Trainings/AcknowledgeTraining', body: 'json' },
  getTrainingTranscript: { method: 'GET', path: '/Trainings/GetTranscript', query: ['userId', 'from', 'to'] },
  getTrainingCategories: { method: 'GET', path: '/Trainings/GetTrainingCategories' },
  submitExternalTraining: { method: 'POST', path: '/Trainings/SubmitExternalTraining', body: 'json' },
  getMyLmsCourses: { method: 'GET', path: '/Lms/GetMyCourses' },
  getLmsCourse: { method: 'GET', path: '/Lms/GetCourse', query: ['enrollmentId'] },
  saveLmsProgress: { method: 'POST', path: '/Lms/SaveProgress', body: 'json' },
  completeLmsLesson: { method: 'POST', path: '/Lms/CompleteLesson', body: 'json' },
  startLmsAttempt: { method: 'POST', path: '/Lms/StartAttempt', body: 'json' },
  submitLmsAttempt: { method: 'POST', path: '/Lms/SubmitAttempt', body: 'json' },
  getLmsAcademy: { method: 'GET', path: '/Lms/GetAcademy' },
  enrollLmsCourse: { method: 'POST', path: '/Lms/Enroll', query: ['courseId'] },
  getMyLmsPaths: { method: 'GET', path: '/LmsRequirements/GetMyPaths' },
  getMyLmsCertificationProgress: { method: 'GET', path: '/LmsPrograms/GetMyCertificationProgress' },
  getMyLmsAccess: { method: 'GET', path: '/Lms/GetMyAccess' },
  getLmsCatalog: { method: 'GET', path: '/Lms/GetCatalog' },
  getLmsLessonPlaylist: { method: 'GET', path: '/Lms/GetLessonPlaylist', query: ['enrollmentId', 'lessonId'] },
  getLmsLessonLaunch: { method: 'GET', path: '/Lms/GetLessonLaunch', query: ['enrollmentId', 'lessonId', 'item'] },
  getLmsLessonFile: { method: 'GET', path: '/Lms/GetLessonFile', query: ['lessonFileId'], responseType: 'arraybuffer' },
  submitLmsSurvey: { method: 'POST', path: '/Lms/SubmitSurvey', body: 'json' },
  getTrainingTranscriptPdf: { method: 'GET', path: '/Trainings/GetTranscriptPdf', query: ['from', 'to', 'categoryId', 'source', 'locale'], responseType: 'arraybuffer' },
  getTrainingCertificate: { method: 'GET', path: '/Trainings/GetCertificate', query: ['learningRecordId', 'locale'], responseType: 'arraybuffer' },
  respondToTrainingSubmission: { method: 'POST', path: '/TrainingReviews/RespondToSubmission', body: 'json' },
});

const E = trainingEndpoints;

/** The member's assignments, the open catalog and due or pinned certifications. `GET /Trainings/GetMyTrainings`. */
export const getMyTrainings = (ctx: ApiContext, options?: RequestOptions): Promise<MyTrainingsResult> => request<MyTrainingsResult>(ctx, E.getMyTrainings, {}, options);

/** One training (sanitized content, attachments, the quiz for its assignees). Opening it marks it viewed. `GET /Trainings/GetTraining`. */
export const getTraining = (ctx: ApiContext, params: { trainingId: number | string }, options?: RequestOptions): Promise<TrainingResult> => request<TrainingResult>(ctx, E.getTraining, { params }, options);

/** An attachment's bytes. `GET /Trainings/GetTrainingAttachment`. */
export const getTrainingAttachment = (ctx: ApiContext, params: { trainingAttachmentId: number | string }, options?: RequestOptions): Promise<BinaryResponse> =>
  requestBinary(ctx, E.getTrainingAttachment, { params }, options);

/** Submits quiz answers; scored on the server. `POST /Trainings/SubmitQuiz`. */
export const submitTrainingQuiz = (ctx: ApiContext, body: SubmitTrainingQuizInput, options?: RequestOptions): Promise<TrainingQuizSubmissionResult> =>
  request<TrainingQuizSubmissionResult>(ctx, E.submitTrainingQuiz, { body }, options);

/** Enrols the member in an open training that allows it. `POST /Trainings/SelfEnroll`. */
export const selfEnrollTraining = (ctx: ApiContext, body: TrainingIdInput, options?: RequestOptions): Promise<TrainingAssignmentResult> => request<TrainingAssignmentResult>(ctx, E.selfEnrollTraining, { body }, options);

/** "I have read and reviewed this" for a training that asks for it (no quiz). `POST /Trainings/AcknowledgeTraining`. */
export const acknowledgeTraining = (ctx: ApiContext, body: TrainingIdInput, options?: RequestOptions): Promise<TrainingAssignmentResult> =>
  request<TrainingAssignmentResult>(ctx, E.acknowledgeTraining, { body }, options);

/** The caller's transcript, newest first. `GET /Trainings/GetTranscript`. */
export const getTrainingTranscript = (ctx: ApiContext, params: { from?: string; to?: string } = {}, options?: RequestOptions): Promise<LearningRecordsResult> =>
  request<LearningRecordsResult>(ctx, E.getTrainingTranscript, { params }, options);

/** The department's training categories. `GET /Trainings/GetTrainingCategories`. */
export const getTrainingCategories = (ctx: ApiContext, options?: RequestOptions): Promise<TrainingCategoriesResult> => request<TrainingCategoriesResult>(ctx, E.getTrainingCategories, {}, options);

/** Outside training (CE/CPD hours) with evidence files. `POST /Trainings/SubmitExternalTraining`. */
export const submitExternalTraining = (ctx: ApiContext, body: SubmitExternalTrainingInput, options?: RequestOptions): Promise<ExternalTrainingSubmissionResult> =>
  request<ExternalTrainingSubmissionResult>(ctx, E.submitExternalTraining, { body }, options);

/** The member's LMS courses, Academy lessons included. `GET /Lms/GetMyCourses`. */
export const getMyLmsCourses = (ctx: ApiContext, options?: RequestOptions): Promise<LmsMyCoursesResult> => request<LmsMyCoursesResult>(ctx, E.getMyLmsCourses, {}, options);

/** The player outline of one enrollment. `GET /Lms/GetCourse`. */
export const getLmsCourse = (ctx: ApiContext, params: { enrollmentId: number | string }, options?: RequestOptions): Promise<LmsCourseResult> => request<LmsCourseResult>(ctx, E.getLmsCourse, { params }, options);

/** Seat time and video progress on a lesson change or heartbeat. `POST /Lms/SaveProgress`. */
export const saveLmsProgress = (ctx: ApiContext, body: LmsProgressInput, options?: RequestOptions): Promise<LmsActionResult> => request<LmsActionResult>(ctx, E.saveLmsProgress, { body }, options);

/** Completes a lesson when its rules are met. `POST /Lms/CompleteLesson`. */
export const completeLmsLesson = (ctx: ApiContext, body: LmsCompleteLessonInput, options?: RequestOptions): Promise<LmsActionResult> => request<LmsActionResult>(ctx, E.completeLmsLesson, { body }, options);

/** Starts or resumes an assessment attempt (questions and options, never the key). `POST /Lms/StartAttempt`. */
export const startLmsAttempt = (ctx: ApiContext, body: LmsStartAttemptInput, options?: RequestOptions): Promise<LmsAttemptResult> => request<LmsAttemptResult>(ctx, E.startLmsAttempt, { body }, options);

/** Submits an attempt; scored on the server. `POST /Lms/SubmitAttempt`. */
export const submitLmsAttempt = (ctx: ApiContext, body: LmsSubmitAttemptInput, options?: RequestOptions): Promise<LmsAttemptOutcomeResult> => request<LmsAttemptOutcomeResult>(ctx, E.submitLmsAttempt, { body }, options);

/** The Resgrid Academy lessons the department may take. `GET /Lms/GetAcademy`. */
export const getLmsAcademy = (ctx: ApiContext, options?: RequestOptions): Promise<LmsAcademyResult> => request<LmsAcademyResult>(ctx, E.getLmsAcademy, {}, options);

/** Enrols the member in an Academy lesson or a self-enrollable course. `POST /Lms/Enroll?courseId=`. */
export const enrollLmsCourse = (ctx: ApiContext, params: { courseId: number | string }, options?: RequestOptions): Promise<LmsActionResult> => request<LmsActionResult>(ctx, E.enrollLmsCourse, { params }, options);

/** The member's learning paths and their steps. `GET /LmsRequirements/GetMyPaths`. */
export const getMyLmsPaths = (ctx: ApiContext, options?: RequestOptions): Promise<LmsMyPathsResult> => request<LmsMyPathsResult>(ctx, E.getMyLmsPaths, {}, options);

/** Progress toward certifications backed by a requirement set (LMS). `GET /LmsPrograms/GetMyCertificationProgress`. */
export const getMyLmsCertificationProgress = (ctx: ApiContext, options?: RequestOptions): Promise<LmsCertificationProgressResult> =>
  request<LmsCertificationProgressResult>(ctx, E.getMyLmsCertificationProgress, {}, options);

/** What the LMS is for this member now (module, flag, add-on, lapse, licensed seat). Answers with the module off too. `GET /Lms/GetMyAccess`. */
export const getMyLmsAccess = (ctx: ApiContext, options?: RequestOptions): Promise<LmsMyAccessResult> => request<LmsMyAccessResult>(ctx, E.getMyLmsAccess, {}, options);

/** The self-enrollable department courses the member may see (empty without a seat). `GET /Lms/GetCatalog`. */
export const getLmsCatalog = (ctx: ApiContext, options?: RequestOptions): Promise<LmsCatalogResult> => request<LmsCatalogResult>(ctx, E.getLmsCatalog, {}, options);

/** A hosted video lesson's signed HLS / MP4 and caption links, valid until UrlExpiresOn. `GET /Lms/GetLessonPlaylist`. */
export const getLmsLessonPlaylist = (ctx: ApiContext, params: { enrollmentId: number | string; lessonId: number | string }, options?: RequestOptions): Promise<LmsLessonPlaylistResult> =>
  request<LmsLessonPlaylistResult>(ctx, E.getLmsLessonPlaylist, { params }, options);

/**
 * A SCORM, cmi5 or LTI lesson's signed, single-use launch link (five minutes at most; open it at once, never store or log it), with how
 * the launch page reports completion. `item` picks one SCO / AU of a multi-item package (the page offers its own menu otherwise).
 * `GET /Lms/GetLessonLaunch` (supersedes `LmsStandards/GetLaunch` for the app).
 */
export const getLmsLessonLaunch = (ctx: ApiContext, params: { enrollmentId: number | string; lessonId: number | string; item?: string }, options?: RequestOptions): Promise<LmsLessonLaunchResult> =>
  request<LmsLessonLaunchResult>(ctx, E.getLmsLessonLaunch, { params }, options);

/** The member's own upload for a file-request lesson. `GET /Lms/GetLessonFile`. */
export const getLmsLessonFile = (ctx: ApiContext, params: { lessonFileId: number | string }, options?: RequestOptions): Promise<BinaryResponse> => requestBinary(ctx, E.getLmsLessonFile, { params }, options);

/** Answers a survey lesson and completes it. `POST /Lms/SubmitSurvey`. */
export const submitLmsSurvey = (ctx: ApiContext, body: LmsSubmitSurveyInput, options?: RequestOptions): Promise<LmsActionResult> => request<LmsActionResult>(ctx, E.submitLmsSurvey, { body }, options);

/** The caller's transcript as a PDF (verified records; sealed when the department seals). `GET /Trainings/GetTranscriptPdf`. */
export const getTrainingTranscriptPdf = (ctx: ApiContext, params: { from?: string; to?: string; categoryId?: number; source?: number; locale?: string } = {}, options?: RequestOptions): Promise<BinaryResponse> =>
  requestBinary(ctx, E.getTrainingTranscriptPdf, { params }, options);

/** The certificate of completion of one of the caller's own verified records. `GET /Trainings/GetCertificate`. */
export const getTrainingCertificate = (ctx: ApiContext, params: { learningRecordId: number | string; locale?: string }, options?: RequestOptions): Promise<BinaryResponse> =>
  requestBinary(ctx, E.getTrainingCertificate, { params }, options);

/** The member answers a reviewer's request for more information on a CE/CPD submission. `POST /TrainingReviews/RespondToSubmission`. */
export const respondToTrainingSubmission = (ctx: ApiContext, body: RespondToTrainingSubmissionInput, options?: RequestOptions): Promise<TrainingSubmissionResult> =>
  request<TrainingSubmissionResult>(ctx, E.respondToTrainingSubmission, { body }, options);

/**
 * A WebVTT caption track from one of the signed links `Lms/GetLessonPlaylist` hands out. The link carries its own signature, so it is
 * fetched without the bearer token or any session header (an Academy track's own https URL as well); anything but https is refused.
 */
export const getLmsSignedCaptions = async (ctx: ApiContext, url: string, options: RequestOptions = {}): Promise<string> => {
  const target = url.trim();

  if (!/^https:\/\//i.test(target)) {
    throw new ApiError({ kind: 'unknown', message: 'Caption link is not https', method: 'GET', path: '/Lms/HostedCaptions.vtt' });
  }

  try {
    const config: ResgridRequestConfig = { method: 'GET', url: target, responseType: 'text', signal: options.signal, resgrid: { anonymous: true } };
    const response = await ctx.http.axios.request<string>(config);

    return String(response.data ?? '');
  } catch (error) {
    throw toApiError(error);
  }
};
