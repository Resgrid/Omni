/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run lazily, so they require modules inside. */
import '../../calls/__tests__/test-setup';

import { featureFlagsStore } from '@resgrid/auth';
import { setFileOpener } from '@resgrid/core/device/file-opener';
import { useProtocolAcknowledgmentsStore, useProtocolsStore, useTrainingStore } from '@resgrid/data';
import type { LearningRecordData, LmsAttemptResult, LmsCourseResult, LmsLessonData, LmsLessonPlaylistResult, LmsMyAccessData, LmsMyCourseData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';

import { activateVariant, hidden } from '../../calls/__tests__/test-utils';
import { EvidencePicker } from '../components/evidence-picker';
import { captionTracks, HostedVideoPlayer, preferredTrack, shownTrack } from '../components/hosted-video-player';
import type { EvidenceFile } from '../lib/evidence';
import { isSurveyComplete, lmsVisibility } from '../lib/training-format';
import { cueAt, isPlaylistExpired, parseWebVtt, PLAYLIST_EXPIRY_MARGIN_MS, playlistRefreshDelay, vttSeconds, watchedPercent } from '../lib/webvtt';
import CoursePlayerScreen from '../screens/course-player';
import RespondSubmissionScreen, { respondProblem } from '../screens/respond-submission';
import TrainingHomeScreen from '../screens/training-home';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file://IMG_7.HEIC', mimeType: 'image/heic', width: 800, height: 600 }] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));

const mockManipulate = jest.fn((_uri: string) => ({ resize: jest.fn(), renderAsync: jest.fn(async () => ({ saveAsync: jest.fn(async () => ({ base64: 'SlBFRw==' })) })) }));

jest.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' }, ImageManipulator: { manipulate: (uri: string) => mockManipulate(uri) } }));

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

/** The expo-video stand-in: one player whose time and status the tests move. */
const mockPlayer = { currentTime: 0, duration: 120, playing: false, status: 'readyToPlay' };
const mockSources: string[] = [];

jest.mock('expo-video', () => {
  const { View } = require('react-native');
  const mockReact = require('react');

  return {
    useVideoPlayer: (source: { uri: string }, setup?: (player: typeof mockPlayer) => void) => {
      mockReact.useMemo(() => {
        mockSources.push(source.uri);
        setup?.(mockPlayer);
      }, [source.uri]);

      return mockPlayer;
    },
    VideoView: ({ testID }: { testID?: string }) => mockReact.createElement(View, { testID }),
  };
});

const mockFetchCaptions = jest.fn(async (_url: string) => 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nCheck the <b>scene</b>\n');

jest.mock('@resgrid/data', () => ({ ...jest.requireActual('@resgrid/data'), fetchSignedCaptions: (url: string) => mockFetchCaptions(url) }));

/** An instant written as the wall clock at +02:00 (the way some servers send UrlExpiresOn). */
const atOffset = (ms: number): string => new Date(ms + 2 * 60 * 60 * 1000).toISOString().replace('Z', '+02:00');

const access = (overrides: Partial<LmsMyAccessData> = {}): LmsMyAccessData => ({ TrainingModuleOn: true, LmsFlagOn: true, AddonActive: true, IsLapsed: false, CanBeTrained: true, EnhancedAiActive: false, ...overrides });

const course = (EnrollmentId: number, overrides: Partial<LmsMyCourseData> = {}): LmsMyCourseData => ({
  EnrollmentId,
  CourseId: EnrollmentId * 10,
  CourseVersionId: 1,
  Title: `Course ${EnrollmentId}`,
  VersionLabel: '1',
  IsAcademy: false,
  Status: 'InProgress',
  ProgressPercent: 10,
  AssignedOn: '2026-11-01T00:00:00Z',
  DueOn: null,
  CompletedOn: null,
  IsOverdue: false,
  CanRun: true,
  Hours: 1,
  ...overrides,
});

const lesson = (LessonId: number, overrides: Partial<LmsLessonData> = {}): LmsLessonData => ({
  LessonId,
  ModuleId: 1,
  ModuleTitle: 'Module',
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

const record = (Id: number, overrides: Partial<LearningRecordData> = {}): LearningRecordData =>
  // SAFETY: a test double: it carries only the fields the code under test reads.
  ({ Id, Title: `Record ${Id}`, CompletedOn: '2026-10-01T12:00:00Z', Hours: 2, Status: 1, SourceKind: 3, ReviewState: null, ReviewNote: null, CeHours: null, CategoryName: null, ...overrides }) as LearningRecordData;

const playlist = (overrides: Partial<NonNullable<LmsLessonPlaylistResult['Data']>> = {}): LmsLessonPlaylistResult =>
  // SAFETY: a test double: it carries only the fields the code under test reads.
  ({
    Error: null,
    Data: {
      EnrollmentId: 5,
      LessonId: 2,
      PlaylistUrl: 'https://api.test/api/v4/Lms/HostedPlaylist.m3u8?sig=1',
      Mp4Url: 'https://media.test/v.mp4',
      UrlExpiresOn: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      DurationSeconds: 120,
      Captions: [{ Locale: 'en', Label: 'English', Url: 'https://api.test/api/v4/Lms/HostedCaptions.vtt?sig=2' }],
      ...overrides,
    },
  }) as LmsLessonPlaylistResult;

beforeEach(() => {
  activateVariant('responder');
  // SAFETY: a test double: it carries only the fields the code under test reads.
  featureFlagsStore.setState({ flags: { 'Training.Lms': { enabled: true } } as never, isLoaded: true });
  jest.mocked(router.push).mockClear();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  useToastStore.getState().clearToasts();
  mockSources.length = 0;
  mockFetchCaptions.mockClear();
  Object.assign(mockPlayer, { currentTime: 0, duration: 120, playing: false, status: 'readyToPlay' });
});

describe('LMS rules', () => {
  it('shows department LMS items only with a seat and an active add-on, keeping running courses through a lapse', () => {
    expect(lmsVisibility(access(), false)).toEqual({ departmentLms: true, keepEnrolled: false });
    expect(lmsVisibility(access({ CanBeTrained: false }), true)).toEqual({ departmentLms: false, keepEnrolled: false });
    expect(lmsVisibility(access({ AddonActive: false, IsLapsed: true }), true)).toEqual({ departmentLms: false, keepEnrolled: true });
    expect(lmsVisibility(access({ AddonActive: null }), true)).toEqual({ departmentLms: false, keepEnrolled: false });
    expect(lmsVisibility(null, true)).toEqual({ departmentLms: true, keepEnrolled: false });
    expect(
      isSurveyComplete(
        [
          { Key: 'r', Kind: 'Rating', Text: 'R', Options: [] },
          { Key: 'c', Kind: 'Text', Text: 'C', Options: [] },
        ],
        { r: '4' }
      )
    ).toBe(true);
    expect(isSurveyComplete([{ Key: 'r', Kind: 'Choice', Text: 'R', Options: ['a'] }], {})).toBe(false);
    expect(respondProblem('  ', '', [])).toBe('training.respond.note_or_file');
    expect(respondProblem('More detail', 'x', [])).toBe('training.submit.hours_invalid');
    expect(respondProblem('', '', [{ bytes: 3 }])).toBeNull();
  });

  it('parses WebVTT into plain-text cues and finds the one on screen', () => {
    const cues = parseWebVtt('WEBVTT\n\nNOTE x\n\n1\n00:00:01.000 --> 00:00:03.500 align:start\n<v Lead>Size up</v>\n\n00:03.500 --> 00:06.000\nEntry\nteam\n\nbroken --> nope\nx');
    expect(cues).toEqual([
      { start: 1, end: 3.5, text: 'Size up' },
      { start: 3.5, end: 6, text: 'Entry\nteam' },
    ]);
    expect(cueAt(cues, 2)?.text).toBe('Size up');
    expect(cueAt(cues, 3.5)?.text).toBe('Entry\nteam');
    expect(cueAt(cues, 7)).toBeNull();
    expect(vttSeconds('01:00:02.5')).toBe(3602.5);
    expect(isPlaylistExpired(new Date(Date.now() + 5000).toISOString())).toBe(true);
    expect(isPlaylistExpired(new Date(Date.now() + 600000).toISOString())).toBe(false);
    expect(isPlaylistExpired(atOffset(Date.now() + 600000))).toBe(false);
    expect(isPlaylistExpired(atOffset(Date.now() - 600000))).toBe(true);
    expect(watchedPercent(60, 120)).toBe(50);
    expect(watchedPercent(10, 0)).toBe(0);
  });

  it('reads caption character references as text, never as markup', () => {
    const [cue] = parseWebVtt('WEBVTT\n\n00:01.000 --> 00:02.000\n<b>A &amp; B</b> &lt;i&gt; caf&#233; &#xE9;&nbsp;&bogus; &#xD800;\n');
    expect(cue?.text).toBe('A & B <i> café é &bogus; &#xD800;');
  });

  it('reads the signed links again just before they stop, whether UrlExpiresOn carries Z, an offset or neither', () => {
    const now = Date.parse('2026-11-26T10:00:00Z');
    expect(playlistRefreshDelay('2026-11-26T10:10:00Z', now)).toBe(600000 - PLAYLIST_EXPIRY_MARGIN_MS);
    expect(playlistRefreshDelay('2026-11-26T12:10:00+02:00', now)).toBe(600000 - PLAYLIST_EXPIRY_MARGIN_MS);
    expect(playlistRefreshDelay('2026-11-26T10:10:00', now)).toBe(600000 - PLAYLIST_EXPIRY_MARGIN_MS);
    expect(playlistRefreshDelay('not a date', now)).toBe(1000);
  });

  it('keeps the member caption choice, Off included, and otherwise starts in the app language', () => {
    const tracks = [
      { Locale: 'en', Label: 'English', Url: 'https://api/en' },
      { Locale: 'de', Label: 'Deutsch', Url: 'https://api/de' },
    ];

    expect(shownTrack(tracks, null, 'en')).toBe('en');
    expect(shownTrack(tracks, 'off', 'en')).toBe('off');
    expect(shownTrack(tracks, 'de', 'en')).toBe('de');
    expect(shownTrack(tracks, 'fr', 'en')).toBe('en');
  });

  it('offers the signed caption tracks first and starts captions in the app language', () => {
    const tracks = captionTracks(
      [{ Locale: 'en', Label: 'English', Url: 'https://api/1' }],
      [
        { Locale: 'en', Label: 'English', Url: null },
        { Locale: 'de', Label: 'Deutsch', Url: 'https://academy/de.vtt' },
        { Locale: 'fr', Label: 'Français', Url: 'http://insecure/fr.vtt' },
      ]
    );

    expect(tracks.map((track) => track.Locale)).toEqual(['en', 'de']);
    expect(preferredTrack(tracks, 'de-DE')).toBe('de');
    expect(preferredTrack(tracks, 'pl')).toBe('off');
  });
});

describe('HostedVideoPlayer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('plays the signed HLS stream with captions under the picture and reports progress', async () => {
    const getLessonPlaylist = jest.fn(async () => ({ value: playlist(), error: null }));
    // SAFETY: a test double: it carries only the fields the code under test reads.
    useTrainingStore.setState({ getLessonPlaylist } as never);
    const onProgress = jest.fn();
    await render(<HostedVideoPlayer enrollmentId={5} lessonId={2} lessonCaptions={[]} resumeAt={30} onProgress={onProgress} />);
    await waitFor(() => expect(screen.getByTestId('hosted-video-native', hidden)).toBeTruthy());
    expect(getLessonPlaylist).toHaveBeenCalledWith(5, 2);
    expect(mockSources).toEqual(['https://api.test/api/v4/Lms/HostedPlaylist.m3u8?sig=1']);
    expect(mockPlayer.currentTime).toBe(30);
    await waitFor(() => expect(mockFetchCaptions).toHaveBeenCalledWith('https://api.test/api/v4/Lms/HostedCaptions.vtt?sig=2'));
    Object.assign(mockPlayer, { currentTime: 2, playing: true });
    await act(async () => {
      jest.advanceTimersByTime(1100);
    });
    expect(onProgress).toHaveBeenLastCalledWith(2, 120);
    expect(screen.getByTestId('hosted-video-cue', hidden).props.children).toBe('Check the scene');
  });

  it('reads the links again when the player fails, resuming where it was', async () => {
    const getLessonPlaylist = jest.fn(async () => ({ value: playlist(), error: null }));
    // SAFETY: a test double: it carries only the fields the code under test reads.
    useTrainingStore.setState({ getLessonPlaylist } as never);
    await render(<HostedVideoPlayer enrollmentId={5} lessonId={2} lessonCaptions={[]} resumeAt={0} onProgress={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('hosted-video-native', hidden)).toBeTruthy());
    Object.assign(mockPlayer, { currentTime: 44, status: 'error' });
    await act(async () => {
      jest.advanceTimersByTime(1100);
    });
    await waitFor(() => expect(getLessonPlaylist).toHaveBeenCalledTimes(2));
  });

  it('keeps captions off across a refreshed playlist once the member turned them off', async () => {
    const getLessonPlaylist = jest.fn(async () => ({ value: playlist(), error: null }));
    // SAFETY: a test double: it carries only the fields the code under test reads.
    useTrainingStore.setState({ getLessonPlaylist } as never);
    await render(<HostedVideoPlayer enrollmentId={5} lessonId={2} lessonCaptions={[]} resumeAt={0} onProgress={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('hosted-video-captions-en', hidden).props.accessibilityState).toMatchObject({ selected: true }));
    await fireEvent.press(screen.getByTestId('hosted-video-captions-off', hidden));
    expect(screen.getByTestId('hosted-video-captions-off', hidden).props.accessibilityState).toMatchObject({ selected: true });

    // The player fails, so the links are read again: a new playlist with the same tracks.
    Object.assign(mockPlayer, { status: 'error' });
    await act(async () => {
      jest.advanceTimersByTime(1100);
    });
    await waitFor(() => expect(getLessonPlaylist).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('hosted-video-captions-off', hidden).props.accessibilityState).toMatchObject({ selected: true });
  });

  it('waits for links that expire at an offset time instead of reading them again at once', async () => {
    const getLessonPlaylist = jest.fn(async () => ({ value: playlist({ UrlExpiresOn: atOffset(Date.now() + 10 * 60 * 1000) }), error: null }));
    // SAFETY: a test double: it carries only the fields the code under test reads.
    useTrainingStore.setState({ getLessonPlaylist } as never);
    await render(<HostedVideoPlayer enrollmentId={5} lessonId={2} lessonCaptions={[]} resumeAt={0} onProgress={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('hosted-video-native', hidden)).toBeTruthy());
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(getLessonPlaylist).toHaveBeenCalledTimes(1);
  });

  it('says why a video cannot play', async () => {
    // SAFETY: a test double: it carries only the fields the code under test reads.
    useTrainingStore.setState({ getLessonPlaylist: jest.fn(async () => ({ value: null, error: 'NotLicensed' })) } as never);
    await render(<HostedVideoPlayer enrollmentId={5} lessonId={2} lessonCaptions={[]} resumeAt={0} onProgress={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('hosted-video-error', hidden)).toBeTruthy());
    expect(screen.getByText('training.errors.not_available', hidden)).toBeTruthy();
  });
});

describe('CoursePlayerScreen lesson kinds', () => {
  const outline = (lessons: LmsLessonData[]): LmsCourseResult =>
    // SAFETY: a test double: it carries only the fields the code under test reads.
    ({ Course: course(5), CurrentLessonId: null, Lessons: lessons }) as LmsCourseResult;

  beforeEach(() => jest.mocked(useLocalSearchParams).mockReturnValue({ id: '5' }));

  it('answers a survey lesson by question key', async () => {
    const submitSurvey = jest.fn(async () => ({ value: { CourseCompleted: false }, error: null }));

    const questions = [
      { Key: 'q1', Kind: 'Rating', Text: 'Useful?', Options: [] },
      { Key: 'q2', Kind: 'Choice', Text: 'Pace', Options: ['Slow', 'Right'] },
    ];

    // SAFETY: a test double: only the store actions the screen calls.
    useTrainingStore.setState({ coursesByEnrollment: { 5: outline([lesson(4, { Kind: 'Survey', SurveyQuestions: questions })]) }, submitSurvey, saveProgress: jest.fn(async () => undefined) } as never);
    await render(<CoursePlayerScreen />);
    await fireEvent.press(screen.getByText('4', hidden));
    await fireEvent.press(screen.getByTestId('course-survey-choice-q2-1', hidden));
    await fireEvent.press(screen.getByTestId('course-survey-submit', hidden));
    await waitFor(() => expect(submitSurvey).toHaveBeenCalledWith(5, 4, { q1: '4', q2: '1' }));
  });

  it('completes a file-request lesson with a photo converted to JPEG, and lists earlier uploads', async () => {
    const completeLesson = jest.fn(async () => ({ value: { CourseCompleted: false }, error: null }));
    // SAFETY: a test double: only the store actions the screen calls.
    useTrainingStore.setState({
      coursesByEnrollment: {
        5: outline([lesson(6, { FileRequestPrompt: 'Upload your SCBA log', Files: [{ LessonFileId: 70, FileName: 'old.pdf', ContentType: 'application/pdf', Size: 1200, UploadedOn: '2026-11-01T00:00:00Z' }] })]),
      },
      completeLesson,
      saveProgress: jest.fn(async () => undefined),
    } as never);
    await render(<CoursePlayerScreen />);
    expect(screen.getByTestId('course-lesson-files-70', hidden)).toBeTruthy();
    expect(screen.getByTestId('course-lesson-complete', hidden).props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('course-lesson-upload-camera', hidden));
    await waitFor(() => expect(screen.getByTestId('course-lesson-upload-file-evidence.jpg', hidden)).toBeTruthy());
    expect(mockManipulate).toHaveBeenCalledWith('file://IMG_7.HEIC');
    await fireEvent.press(screen.getByTestId('course-lesson-complete', hidden));
    await waitFor(() => expect(completeLesson).toHaveBeenCalledWith(5, 6, { responseText: undefined, file: { name: 'evidence.jpg', contentType: 'image/jpeg', base64: 'SlBFRw==' } }));
  });

  it('shows an assessment only under the lesson that started it', async () => {
    type AttemptOutcome = { value: LmsAttemptResult | null; error: string | null };

    let release: (outcome: AttemptOutcome) => void = () => undefined;

    const startAttempt = jest.fn(
      () =>
        new Promise<AttemptOutcome>((resolve) => {
          release = resolve;
        })
    );

    // SAFETY: a test double: it carries only the fields the code under test reads.
    const attempt = { Error: null, AttemptId: 70, DeadlineOn: null, SecondsRemaining: null, Questions: [{ QuestionId: 1, Kind: 'SingleChoice', Text: 'Q', Options: [{ Key: 'a', Text: 'A' }] }] } as LmsAttemptResult;
    // SAFETY: a test double: only the store actions the screen calls.
    useTrainingStore.setState({ coursesByEnrollment: { 5: outline([lesson(11, { Kind: 'Assessment' }), lesson(12, { Kind: 'Assessment' })]) }, startAttempt, saveProgress: jest.fn(async () => undefined) } as never);
    await render(<CoursePlayerScreen />);
    await fireEvent.press(screen.getByTestId('course-attempt-start', hidden));
    expect(startAttempt).toHaveBeenLastCalledWith(5, 11, true);
    await fireEvent.press(screen.getByTestId('course-lesson-12', hidden));
    await act(async () => release({ value: attempt, error: null }));
    expect(screen.getByTestId('course-lesson-view-12', hidden)).toBeTruthy();
    expect(screen.queryByTestId('course-attempt', hidden)).toBeNull();

    // Still on the lesson that asked: the attempt is shown.
    await fireEvent.press(screen.getByTestId('course-attempt-start', hidden));
    expect(startAttempt).toHaveBeenLastCalledWith(5, 12, true);
    await act(async () => release({ value: attempt, error: null }));
    expect(screen.getByTestId('course-attempt', hidden)).toBeTruthy();
  });

  it('starts a survey lesson with no answers carried over from the one before', async () => {
    const questions = [{ Key: 'q1', Kind: 'Rating', Text: 'Useful?', Options: [] }];
    // SAFETY: a test double: only the store actions the screen calls.
    useTrainingStore.setState({
      coursesByEnrollment: { 5: outline([lesson(4, { Kind: 'Survey', SurveyQuestions: questions }), lesson(5, { Kind: 'Survey', SurveyQuestions: questions })]) },
      saveProgress: jest.fn(async () => undefined),
    } as never);
    await render(<CoursePlayerScreen />);
    await fireEvent.press(screen.getByText('4', hidden));
    expect(screen.getByTestId('course-survey-submit', hidden).props.accessibilityState?.disabled).toBe(false);
    await fireEvent.press(screen.getByTestId('course-lesson-5', hidden));
    expect(screen.getByTestId('course-lesson-view-5', hidden)).toBeTruthy();
    expect(screen.getByTestId('course-survey-submit', hidden).props.accessibilityState?.disabled).toBe(true);
  });

  it('keeps a file removed while another photo is still being picked', async () => {
    let release: (result: ImagePicker.ImagePickerResult) => void = () => undefined;
    jest.mocked(ImagePicker.launchCameraAsync).mockImplementationOnce(
      () =>
        new Promise<ImagePicker.ImagePickerResult>((resolve) => {
          release = resolve;
        })
    );
    const earlier: EvidenceFile = { id: 'a', name: 'a.pdf', contentType: 'application/pdf', base64: 'QQ==', bytes: 1 };

    const Host = () => {
      const [files, setFiles] = useState<EvidenceFile[]>([earlier]);

      return <EvidencePicker files={files} onChange={setFiles} max={5} testID="pick" />;
    };

    await render(<Host />);
    await fireEvent.press(screen.getByTestId('pick-camera', hidden));
    await fireEvent.press(screen.getByTestId('pick-remove-a', hidden));
    // SAFETY: a test double: the picker result fields the conversion reads.
    await act(async () => release({ canceled: false, assets: [{ uri: 'file://IMG_8.jpg', width: 10, height: 10 }] } as ImagePicker.ImagePickerResult));
    await waitFor(() => expect(screen.getByTestId('pick-file-evidence.jpg', hidden)).toBeTruthy());
    expect(screen.queryByTestId('pick-file-a.pdf', hidden)).toBeNull();
  });

  it('shows the protocol version a ProtocolVersion lesson points at', async () => {
    const fetchVersionContent = jest.fn(async () => ({ ContentHtml: '<p>SOG 12</p>' }));
    // SAFETY: a test double: it carries only the fields the code under test reads.
    useProtocolsStore.setState({ fetchVersionContent } as never);
    // SAFETY: a test double: only the store actions the screen calls.
    useTrainingStore.setState({ coursesByEnrollment: { 5: outline([lesson(8, { Kind: 'ProtocolVersion', ProtocolVersionId: 31 })]) }, saveProgress: jest.fn(async () => undefined) } as never);
    await render(<CoursePlayerScreen />);
    await waitFor(() => expect(screen.getByTestId('course-lesson-protocol', hidden)).toBeTruthy());
    expect(fetchVersionContent).toHaveBeenCalledWith('31', { locale: 'en' });
  });
});

describe('TrainingHomeScreen with the LMS access answer', () => {
  const stubs = {
    fetchMyTrainings: jest.fn(async () => undefined),
    fetchTranscript: jest.fn(async () => undefined),
    fetchLearning: jest.fn(async () => undefined),
    fetchCatalog: jest.fn(async () => undefined),
  };

  beforeEach(() => {
    // SAFETY: a test double: it carries only the fields the code under test reads.
    useProtocolAcknowledgmentsStore.setState({ weekly: [], fetchWeekly: jest.fn(async () => undefined) } as never);
  });

  afterEach(() => setFileOpener(null));

  it('hides department courses and the catalog from a member without a seat', async () => {
    // SAFETY: a test double: only the store actions the screen calls.
    useTrainingStore.setState({
      ...stubs,
      my: { Assignments: [], Catalog: [], Certifications: [], OnLeave: false },
      courses: [course(1), course(2, { IsAcademy: true })],
      catalog: [{ CourseId: 9, CourseVersionId: 1, Title: 'Pump ops', Summary: null, Hours: 2, VersionLabel: '1', CanEnroll: true, OpenEnrollmentId: null }],
      access: access({ CanBeTrained: false }),
      fetchAccess: jest.fn(async () => access({ CanBeTrained: false })),
      errors: {},
      loading: {},
    } as never);
    await render(<TrainingHomeScreen />);
    expect(screen.getByTestId('training-course-2', hidden)).toBeTruthy();
    expect(screen.queryByTestId('training-course-1', hidden)).toBeNull();
    await waitFor(() => expect(stubs.fetchLearning).toHaveBeenCalledWith({ bypassCache: false, lms: false }));
  });

  it('offers the department catalog, the weekly questions, the transcript PDF, certificates and the reply to a reviewer', async () => {
    const enrollCourse = jest.fn(async () => ({ value: { EnrollmentId: 77 }, error: null }));
    const answerWeekly = jest.fn(async () => null);
    const opened = jest.fn(async () => undefined);
    setFileOpener(opened);
    // SAFETY: a test double: it carries only the fields the code under test reads.
    useProtocolAcknowledgmentsStore.setState({
      weekly: [
        {
          Id: 3,
          ProtocolId: 1,
          ProtocolCode: 'SOG',
          ProtocolName: 'Entry',
          WeekKey: '2026-48',
          SentOn: '2026-11-23T00:00:00Z',
          AnsweredOn: null,
          Correct: null,
          Question: { QuestionId: 11, Kind: 0, Text: 'Q', ImageUrl: null, Points: 1, Options: [{ Key: 'a', Text: 'A' }] },
          ChosenKeys: [],
          CorrectKeys: null,
          Explanation: null,
        },
      ],
      answerWeekly,
    } as never);
    // SAFETY: a test double: only the store actions the screen calls.
    useTrainingStore.setState({
      ...stubs,
      my: { Assignments: [], Catalog: [], Certifications: [], OnLeave: false },
      courses: [],
      catalog: [{ CourseId: 9, CourseVersionId: 1, Title: 'Pump ops', Summary: null, Hours: 2, VersionLabel: '1', CanEnroll: true, OpenEnrollmentId: null }],
      transcript: [record(7, { Status: 0, ReviewState: 'InfoRequested', ReviewNote: 'Add the certificate' }), record(8)],
      access: access(),
      fetchAccess: jest.fn(async () => access()),
      enrollCourse,
      errors: {},
      loading: {},
    } as never);
    await render(<TrainingHomeScreen />);
    await fireEvent.press(screen.getByTestId('training-weekly-3-quiz-option-11-a', hidden));
    await fireEvent.press(screen.getByTestId('training-weekly-3-quiz-submit', hidden));
    expect(answerWeekly).toHaveBeenCalledWith(3, ['a']);

    await fireEvent.press(screen.getByText('training.tabs.available', hidden));
    await fireEvent.press(screen.getByTestId('training-catalog-course-9-enroll', hidden));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/training/course/77'));

    await fireEvent.press(screen.getByText('training.tabs.transcript', hidden));
    await fireEvent.press(screen.getByTestId('training-record-7-respond', hidden));
    expect(router.push).toHaveBeenLastCalledWith('/training/submission/7');
    expect(screen.queryByTestId('training-record-7-certificate', hidden)).toBeNull();
    expect(screen.getByTestId('training-record-8-certificate', hidden)).toBeTruthy();
    expect(screen.getByTestId('training-transcript-pdf', hidden)).toBeTruthy();
  });
});

describe('RespondSubmissionScreen', () => {
  it('sends the answer with corrected hours to the reviewer', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '7' });
    const respondToSubmission = jest.fn(async () => ({ value: { Data: null }, error: null }));
    // SAFETY: a test double: only the store actions the screen calls.
    useTrainingStore.setState({ transcript: [record(7, { Status: 0, ReviewState: 'InfoRequested', ReviewNote: 'Add the certificate' })], respondToSubmission, fetchTranscript: jest.fn(async () => undefined) } as never);
    await render(<RespondSubmissionScreen />);
    expect(screen.getByTestId('respond-submission-review-note', hidden).props.children).toBe('Add the certificate');
    await fireEvent.press(screen.getByTestId('respond-submission-send', hidden));
    expect(screen.getByTestId('respond-submission-problem', hidden)).toBeTruthy();
    expect(respondToSubmission).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('respond-submission-note-input', hidden), 'Attached the card');
    await fireEvent.changeText(screen.getByTestId('respond-submission-hours-input', hidden), '1,5');
    await fireEvent.press(screen.getByTestId('respond-submission-send', hidden));
    await waitFor(() => expect(respondToSubmission).toHaveBeenCalledWith({ Id: 7, Note: 'Attached the card', Hours: 1.5, Files: [] }));
  });

  it('reads the transcript on opening, and says the request is gone only once that read found nothing', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '7' });
    let release: () => void = () => undefined;

    const fetchTranscript = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );

    // SAFETY: a test double: only the store actions the screen calls.
    useTrainingStore.setState({ transcript: [], fetchTranscript } as never);
    await render(<RespondSubmissionScreen />);
    expect(fetchTranscript).toHaveBeenCalledWith({ bypassCache: true });
    expect(screen.queryByTestId('respond-submission-missing', hidden)).toBeNull();

    // The read brings the reviewer's request: the form shows it.
    await act(async () => {
      useTrainingStore.setState({ transcript: [record(7, { Status: 0, ReviewState: 'InfoRequested', ReviewNote: 'Add the certificate' })] });
      release();
    });
    expect(screen.getByTestId('respond-submission-review-note', hidden).props.children).toBe('Add the certificate');

    // A request the read did not find: not found, then.
    useTrainingStore.setState({ transcript: [] });
    await waitFor(() => expect(screen.getByTestId('respond-submission-missing', hidden)).toBeTruthy());
  });
});

describe('TrainingHomeScreen busy rows', () => {
  it('keeps each enrollment busy on its own, a training and a course with the same id apart', async () => {
    const releases = new Map<string, () => void>();

    const enrollCourse = jest.fn(
      (courseId: number) =>
        new Promise<{ value: null; error: string }>((resolve) => {
          releases.set(`course:${courseId}`, () => resolve({ value: null, error: 'rejected' }));
        })
    );

    const selfEnroll = jest.fn(
      (trainingId: number) =>
        new Promise<boolean>((resolve) => {
          releases.set(`training:${trainingId}`, () => resolve(true));
        })
    );

    const catalogCourse = (CourseId: number) => ({ CourseId, CourseVersionId: 1, Title: `Course ${CourseId}`, Summary: null, Hours: 2, VersionLabel: '1', CanEnroll: true, OpenEnrollmentId: null });
    // SAFETY: a test double: it carries only the fields the code under test reads.
    useProtocolAcknowledgmentsStore.setState({ weekly: [], fetchWeekly: jest.fn(async () => undefined) } as never);
    // SAFETY: a test double: only the store actions the screen calls.
    useTrainingStore.setState({
      fetchMyTrainings: jest.fn(async () => undefined),
      fetchTranscript: jest.fn(async () => undefined),
      fetchLearning: jest.fn(async () => undefined),
      fetchCatalog: jest.fn(async () => undefined),
      my: {
        Assignments: [],
        Catalog: [{ TrainingId: 9, Name: 'Ladders', Summary: null, CanSelfEnroll: true, HasQuiz: false, Hours: 1, DueDays: null, CreatedOn: '2026-11-01T00:00:00Z' }],
        Certifications: [],
        OnLeave: false,
      },
      courses: [],
      catalog: [catalogCourse(9), catalogCourse(10)],
      access: access(),
      fetchAccess: jest.fn(async () => access()),
      enrollCourse,
      selfEnroll,
      errors: {},
      loading: {},
    } as never);
    const disabled = (testID: string) => screen.getByTestId(testID, hidden).props.accessibilityState?.disabled === true;

    await render(<TrainingHomeScreen />);
    await fireEvent.press(screen.getByText('training.tabs.available', hidden));
    await fireEvent.press(screen.getByTestId('training-catalog-9-enroll', hidden));
    expect(disabled('training-catalog-9-enroll')).toBe(true);
    expect(disabled('training-catalog-course-9-enroll')).toBe(false);

    await fireEvent.press(screen.getByTestId('training-catalog-course-9-enroll', hidden));
    await fireEvent.press(screen.getByTestId('training-catalog-course-10-enroll', hidden));
    await act(async () => releases.get('course:9')?.());
    expect(disabled('training-catalog-course-9-enroll')).toBe(false);
    expect(disabled('training-catalog-course-10-enroll')).toBe(true);
    expect(disabled('training-catalog-9-enroll')).toBe(true);

    await act(async () => {
      releases.get('course:10')?.();
      releases.get('training:9')?.();
    });
    expect(disabled('training-catalog-course-10-enroll')).toBe(false);
    expect(disabled('training-catalog-9-enroll')).toBe(false);
  });
});
