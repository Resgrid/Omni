import '../../calls/__tests__/test-setup';

import { featureFlagsStore } from '@resgrid/auth';
import { setCallFileReader, useTrainingStore } from '@resgrid/data';
import type { LmsCourseResult, LmsLessonData, LmsMyCourseData, MyTrainingsData, TrainingAssignmentData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { activateVariant, hidden } from '../../calls/__tests__/test-utils';
import { asJpegName, isHeicImage } from '../../certifications/lib/capture-photo';
import { base64Bytes, evidenceProblem, EvidenceTypeError, MAX_EVIDENCE_FILE_BYTES, pickEvidenceDocument, toEvidenceInputs } from '../lib/evidence';
import { submissionErrorKey, toSubmissionInput, validateSubmission } from '../lib/submission';
import { assessmentQuestions, assignmentStateKey, currentLesson, isPlayableLesson, lmsErrorKey, recordStatusKey, verifiedHours, visibleCourses, visiblePaths } from '../lib/training-format';
import { trainingNav } from '../nav';
import { parseTrainingRouteId, trainingRoutes } from '../routes';
import CoursePlayerScreen from '../screens/course-player';
import SubmitHoursScreen from '../screens/submit-hours';
import TrainingHomeScreen from '../screens/training-home';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file://IMG_0001.HEIC', mimeType: 'image/heic', width: 4032, height: 3024 }] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));

const mockResize = jest.fn();
const mockSave = jest.fn(async (_options: { format: string; compress: number; base64: boolean }) => ({ base64: 'SlBFRw==' }));
const mockManipulate = jest.fn((_uri: string) => ({ resize: mockResize, renderAsync: jest.fn(async () => ({ saveAsync: mockSave })) }));

jest.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' }, ImageManipulator: { manipulate: (uri: string) => mockManipulate(uri) } }));

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const course = (EnrollmentId: number, overrides: Partial<LmsMyCourseData> = {}): LmsMyCourseData => ({
  EnrollmentId,
  CourseId: EnrollmentId * 10,
  CourseVersionId: 1,
  Title: `Course ${EnrollmentId}`,
  VersionLabel: '1',
  IsAcademy: false,
  Status: 'InProgress',
  ProgressPercent: 40,
  AssignedOn: '2026-11-01T00:00:00Z',
  DueOn: null,
  CompletedOn: null,
  IsOverdue: false,
  CanRun: true,
  Hours: 2,
  ...overrides,
});

const assignment = (TrainingId: number, overrides: Partial<TrainingAssignmentData> = {}): TrainingAssignmentData => ({
  TrainingId,
  Name: `Training ${TrainingId}`,
  Summary: null,
  State: 0,
  StateName: 'NotStarted',
  AssignedOn: null,
  DueOn: '2026-12-01T00:00:00Z',
  Viewed: false,
  ViewedOn: null,
  Complete: false,
  CompletedOn: null,
  HasQuiz: true,
  Score: 0,
  Passed: null,
  AttemptCount: 0,
  AttemptsLeft: null,
  Exempt: false,
  ExemptUntil: null,
  Extended: false,
  Hours: 1,
  ...overrides,
});

const lesson = (LessonId: number, overrides: Partial<LmsLessonData> = {}): LmsLessonData => ({
  LessonId,
  ModuleId: 1,
  ModuleTitle: 'Module 1',
  Title: `Lesson ${LessonId}`,
  Kind: 'Blocks',
  IsRequired: true,
  IsLocked: false,
  Progress: 'NotStarted',
  SeatSeconds: 0,
  MinimumSeatSeconds: 0,
  VideoPositionSeconds: 0,
  WatchedPercent: 0,
  RequiredWatchPercent: 0,
  ContentHtml: null,
  VideoSource: null,
  VideoUrl: null,
  TranscriptText: null,
  DocumentUrl: null,
  FreeResponsePrompt: null,
  FileRequestPrompt: null,
  MayAnswerOffline: false,
  AvailableOffline: false,
  ...overrides,
});

const my = (overrides: Partial<MyTrainingsData> = {}): MyTrainingsData => ({ Assignments: [assignment(12)], Catalog: [], Certifications: [], OnLeave: false, ...overrides });

// SAFETY: a test double: it carries only the fields the code under test reads.
const setLms = (enabled: boolean) => featureFlagsStore.setState({ flags: enabled ? ({ 'Training.Lms': { enabled: true } } as never) : {}, isLoaded: true });

beforeEach(() => {
  activateVariant('responder');
  setLms(false);
  jest.mocked(router.push).mockClear();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  useToastStore.getState().clearToasts();
  mockManipulate.mockClear();
  mockResize.mockClear();
  useTrainingStore.setState({
    my: my(),
    courses: [],
    paths: [],
    academy: [],
    transcript: [],
    certificationProgress: [],
    categories: [],
    coursesByEnrollment: {},
    trainingsById: {},
    loading: {},
    errors: {},
    fetchMyTrainings: jest.fn(async () => undefined),
    fetchTranscript: jest.fn(async () => undefined),
    fetchLearning: jest.fn(async () => undefined),
    fetchCategories: jest.fn(async () => undefined),
    fetchCourse: jest.fn(async () => null),
  });
});

describe('training rules', () => {
  it('shows department courses and paths only with the LMS on, and the Academy always', () => {
    const courses = [course(1), course(2, { IsAcademy: true }), course(3, { CanRun: false }), course(4, { CanRun: false, Status: 'Completed' })];
    expect(visibleCourses(courses, { departmentLms: false, keepEnrolled: false }).map((item) => item.EnrollmentId)).toEqual([2]);
    expect(visibleCourses(courses, { departmentLms: true, keepEnrolled: false }).map((item) => item.EnrollmentId)).toEqual([1, 2, 4]);
    // A lapsed add-on keeps only the courses still running (lapse rule 4); completed department courses stay on the transcript.
    expect(visibleCourses(courses, { departmentLms: false, keepEnrolled: true }).map((item) => item.EnrollmentId)).toEqual([1, 2]);

    // SAFETY: a test double: it carries only the fields the code under test reads.
    const paths = [
      { PathId: 1, IsAcademy: true },
      { PathId: 2, IsAcademy: false },
    ] as never[];

    expect(visiblePaths(paths, { departmentLms: false, keepEnrolled: true })).toHaveLength(1);
    expect(visiblePaths(paths, { departmentLms: true, keepEnrolled: false })).toHaveLength(2);
  });

  it('names states, picks the lesson to open and maps assessment questions', () => {
    expect(assignmentStateKey({ StateName: 'Overdue' })).toBe('training.state.overdue');
    expect(assignmentStateKey({ StateName: null })).toBe('training.state.not_started');
    expect(recordStatusKey({ Status: 1 })).toBe('training.transcript.verified');
    expect(
      verifiedHours([
        { Status: 1, Hours: 1.25 },
        { Status: 0, Hours: 9 },
        { Status: 1, Hours: 2 },
      ])
    ).toBe(3.25);
    expect(currentLesson([lesson(1, { Progress: 'Completed' }), lesson(2, { IsLocked: true }), lesson(3)], null)?.LessonId).toBe(3);
    expect(currentLesson([lesson(1), lesson(2)], 2)?.LessonId).toBe(2);
    expect(isPlayableLesson({ Kind: 'Scorm' })).toBe(false);
    expect(assessmentQuestions([{ QuestionId: 4, Kind: 'ShortAnswer', Text: 'Why?', ImageUrl: null, Points: 1, Options: [] }])).toEqual([{ id: '4', text: 'Why?', multiple: false, freeText: true, options: [] }]);
    expect(lmsErrorKey('SeatTimeNotMet')).toBe('training.errors.seat_time');
    expect(lmsErrorKey('AddonRequired')).toBe('training.errors.not_available');
  });

  it('builds only numeric routes and gates the nav entry on the training module', () => {
    expect(trainingRoutes.detail(12)).toBe('/training/12');
    expect(trainingRoutes.course('7')).toBe('/training/course/7');
    expect(parseTrainingRouteId(['44'])).toBe(44);
    expect(parseTrainingRouteId('x')).toBeNull();
    expect(trainingNav[0]).toMatchObject({ href: '/training', requiresModule: 'training' });
  });
});

describe('evidence', () => {
  afterEach(() => setCallFileReader(null));

  it('recognises HEIC by type or name and renames converted photos', () => {
    expect(isHeicImage('image/heic', 'a.bin')).toBe(true);
    expect(isHeicImage(null, 'IMG_1.HEIF')).toBe(true);
    expect(isHeicImage('image/jpeg', 'a.jpg')).toBe(false);
    expect(asJpegName('IMG_0001.HEIC')).toBe('IMG_0001.jpg');
  });

  it('converts a HEIC picked from files to a JPEG without metadata before upload', async () => {
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file://IMG_0001.HEIC', name: 'IMG_0001.HEIC', mimeType: 'image/heic', size: 10 }] } as never);
    const file = await pickEvidenceDocument();
    expect(mockManipulate).toHaveBeenCalledWith('file://IMG_0001.HEIC');
    expect(mockSave).toHaveBeenLastCalledWith({ format: 'jpeg', compress: 0.7, base64: true });
    expect(file).toMatchObject({ name: 'IMG_0001.jpg', contentType: 'image/jpeg', base64: 'SlBFRw==' });
    const inputs = toEvidenceInputs(file ? [file] : []);
    expect(inputs.every((input) => !/hei[cf]/i.test(`${input.FileName} ${input.ContentType}`))).toBe(true);
  });

  it('sends documents as they are and refuses other types', async () => {
    setCallFileReader(async () => 'UERG');
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file://cert.pdf', name: 'cert.pdf', mimeType: 'application/pdf', size: 3 }] } as never);
    await expect(pickEvidenceDocument()).resolves.toMatchObject({ name: 'cert.pdf', contentType: 'application/pdf', base64: 'UERG', bytes: 3 });
    expect(mockManipulate).not.toHaveBeenCalled();
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file://a.exe', name: 'a.exe', mimeType: 'application/octet-stream', size: 3 }] } as never);
    await expect(pickEvidenceDocument()).rejects.toBeInstanceOf(EvidenceTypeError);
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({ canceled: true, assets: null } as never);
    await expect(pickEvidenceDocument()).resolves.toBeNull();
  });

  it('applies Core limits: five files, 10 MB each, 30 MB together', () => {
    expect(base64Bytes('QUJD')).toBe(3);
    expect(base64Bytes('QQ==')).toBe(1);
    expect(evidenceProblem([{ bytes: 1 }, { bytes: 1 }, { bytes: 1 }, { bytes: 1 }, { bytes: 1 }, { bytes: 1 }])).toBe('training.submit.too_many_files');
    expect(evidenceProblem([{ bytes: MAX_EVIDENCE_FILE_BYTES + 1 }])).toBe('training.submit.file_too_large');
    expect(evidenceProblem([{ bytes: MAX_EVIDENCE_FILE_BYTES }, { bytes: MAX_EVIDENCE_FILE_BYTES }, { bytes: MAX_EVIDENCE_FILE_BYTES }, { bytes: 1 }])).toBe('training.submit.files_too_large');
    expect(evidenceProblem([{ bytes: 5 }])).toBeNull();
  });
});

describe('CE/CPD submission', () => {
  const values = { title: ' Pediatric ALS ', completedOn: '2026-11-20', hours: '2,5', categoryId: 3, method: 1, ceProvider: ' NAEMT ', ceCourseNumber: '', ceHours: '2', notes: '', files: [] };

  it('validates like Core and sends the day as noon UTC', () => {
    expect(validateSubmission(values, '2026-11-26')).toEqual({});
    expect(validateSubmission({ ...values, title: ' ', completedOn: '2026-11-27', hours: '0', ceHours: 'x' }, '2026-11-26')).toEqual({
      title: 'training.submit.title_required',
      completedOn: 'training.submit.date_future',
      hours: 'training.submit.hours_invalid',
      ceHours: 'training.submit.hours_invalid',
    });
    expect(toSubmissionInput(values)).toEqual({
      Title: 'Pediatric ALS',
      CompletedOn: '2026-11-20T12:00:00Z',
      Hours: 2.5,
      CategoryId: 3,
      Method: 1,
      CeProvider: 'NAEMT',
      CeCourseNumber: null,
      CeHours: 2,
      Notes: null,
      Files: [],
    });
    expect(submissionErrorKey('file_type_not_allowed')).toBe('training.submit.file_type');
    expect(submissionErrorKey('unexpected')).toBe('training.errors.generic');
  });

  it('shows what is missing and does not send an incomplete form', async () => {
    const submitExternal = jest.fn();
    // SAFETY: a test double: it carries only the fields the code under test reads.
    useTrainingStore.setState({ submitExternal } as never);
    await render(<SubmitHoursScreen />);
    await fireEvent.press(screen.getByTestId('submit-hours-save', hidden));
    expect(screen.getByTestId('submit-hours-title-error', hidden)).toBeTruthy();
    expect(screen.getByTestId('submit-hours-hours-error', hidden)).toBeTruthy();
    expect(submitExternal).not.toHaveBeenCalled();
  });

  it('adds a camera photo converted to JPEG and scaled down', async () => {
    await render(<SubmitHoursScreen />);
    await fireEvent.press(screen.getByTestId('submit-hours-camera', hidden));
    await waitFor(() => expect(screen.getByTestId('submit-hours-file-evidence.jpg', hidden)).toBeTruthy());
    expect(mockManipulate).toHaveBeenCalledWith('file://IMG_0001.HEIC');
    expect(mockResize).toHaveBeenCalledWith({ width: 2400 });
  });
});

describe('TrainingHomeScreen', () => {
  it('says so when the department switched Training off', async () => {
    useTrainingStore.setState({ my: null, errors: { mine: { code: 'not_found', messageKey: 'errors.data.not_found', status: 404 } } });
    await render(<TrainingHomeScreen />);
    expect(screen.getByTestId('training-module-off', hidden)).toBeTruthy();
  });

  it('lists assigned trainings and the free Academy, and department courses only with the LMS on', async () => {
    useTrainingStore.setState({ courses: [course(1), course(2, { IsAcademy: true })] });
    const { rerender } = await render(<TrainingHomeScreen />);
    expect(screen.getByTestId('training-assignment-12', hidden)).toBeTruthy();
    expect(screen.getByTestId('training-course-2', hidden)).toBeTruthy();
    expect(screen.queryByTestId('training-course-1', hidden)).toBeNull();
    setLms(true);
    await rerender(<TrainingHomeScreen />);
    expect(screen.getByTestId('training-course-1', hidden)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('training-assignment-12', hidden));
    expect(router.push).toHaveBeenCalledWith('/training/12');
    await fireEvent.press(screen.getByTestId('training-course-1', hidden));
    expect(router.push).toHaveBeenLastCalledWith('/training/course/1');
  });
});

describe('CoursePlayerScreen', () => {
  // SAFETY: a test double: it carries only the fields the code under test reads.
  const outline = (lessons: LmsLessonData[]): LmsCourseResult => ({ Course: course(5), CurrentLessonId: null, Lessons: lessons }) as LmsCourseResult;

  it('completes a lesson and shows why Core refused one', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '5' });

    const completeLesson = jest
      .fn()
      .mockResolvedValueOnce({ value: null, error: 'SeatTimeNotMet' })
      .mockResolvedValueOnce({ value: { CourseCompleted: false }, error: null });

    // SAFETY: a test double: it carries only the fields the code under test reads.
    useTrainingStore.setState({ coursesByEnrollment: { 5: outline([lesson(1, { ContentHtml: '<p>Read</p>' }), lesson(2, { IsLocked: true })]) }, completeLesson, saveProgress: jest.fn(async () => undefined) } as never);
    await render(<CoursePlayerScreen />);
    expect(screen.getByTestId('course-lesson-view-1', hidden)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('course-lesson-complete', hidden));
    await waitFor(() => expect(useToastStore.getState().toasts.some((toast) => toast.message === 'training.errors.seat_time')).toBe(true));
    await fireEvent.press(screen.getByTestId('course-lesson-complete', hidden));
    await waitFor(() => expect(completeLesson).toHaveBeenCalledTimes(2));
    expect(completeLesson).toHaveBeenCalledWith(5, 1, { responseText: undefined, file: undefined });
  });

  it('starts an assessment drawn on the server and submits the picked keys', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '5' });

    const startAttempt = jest.fn(async () => ({
      value: { AttemptId: 9, DeadlineOn: null, SecondsRemaining: null, Questions: [{ QuestionId: 1, Kind: 'SingleChoice', Text: 'Q', ImageUrl: null, Points: 1, Options: [{ Key: 'a', Text: 'A' }] }] },
      error: null,
    }));

    const submitAttempt = jest.fn(async () => ({ value: { AttemptId: 9, Percent: 100, Passed: true, CourseCompleted: true, Questions: [] }, error: null }));
    // SAFETY: a test double: it carries only the fields the code under test reads.
    useTrainingStore.setState({ coursesByEnrollment: { 5: outline([lesson(3, { Kind: 'Assessment' })]) }, startAttempt, submitAttempt, saveProgress: jest.fn(async () => undefined) } as never);
    await render(<CoursePlayerScreen />);
    await fireEvent.press(screen.getByTestId('course-attempt-start', hidden));
    await waitFor(() => expect(screen.getByTestId('course-attempt-option-1-a', hidden)).toBeTruthy());
    expect(startAttempt).toHaveBeenCalledWith(5, 3, true);
    await fireEvent.press(screen.getByTestId('course-attempt-option-1-a', hidden));
    await fireEvent.press(screen.getByTestId('course-attempt-submit', hidden));
    await waitFor(() => expect(submitAttempt).toHaveBeenCalledWith(9, [{ QuestionId: 1, Keys: ['a'], Text: null }]));
    await waitFor(() => expect(screen.getByTestId('course-attempt-outcome', hidden)).toBeTruthy());
  });
});
