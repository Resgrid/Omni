import '../../calls/__tests__/test-setup';

import { useNetInfo } from '@react-native-community/netinfo';
import { featureFlagsStore } from '@resgrid/auth';
import { useTrainingStore } from '@resgrid/data';
import type { LmsCourseResult, LmsLessonData, LmsLessonLaunchData, LmsMyAccessData, LmsMyCourseData } from '@resgrid/models';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';

import { activateVariant, hidden } from '../../calls/__tests__/test-utils';
import { LessonLaunchSurface } from '../components/lesson-launch-surface';
import { prepareLaunchBrowser } from '../lib/launch-browser';
import { frameMessage, isFromLaunchOrigin, isLaunchLesson, isLaunchNavigationAllowed, isResultMessage, isTrustedLaunch, launchErrorKey, launchHttpFailure, originOf, parseLessonMessage } from '../lib/lesson-launch';
import CoursePlayerScreen from '../screens/course-player';

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(() => ({ type: 'failed' })),
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
  openAuthSessionAsync: jest.fn(async () => ({ type: 'cancel' })),
}));

jest.mock('expo-linking', () => ({ createURL: (path: string) => `resgrid://${path}` }));

const CORE = 'https://resgrid.com';

const launch = (overrides: Partial<LmsLessonLaunchData> = {}): LmsLessonLaunchData => ({
  Kind: 'Scorm2004',
  LaunchUrl: `${CORE}/lms-app/launch?token=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcde`,
  ExpiresOn: '2026-11-26T12:05:00Z',
  CompletionMessage: {
    Type: 'resgrid.lms.lesson',
    Version: 1,
    Origin: CORE,
    EnrollmentId: 5,
    LessonId: 9,
    Statuses: ['notAttempted', 'incomplete', 'completed', 'passed', 'failed', 'terminated', 'unavailable'],
    ResultStatuses: ['completed', 'passed', 'failed', 'terminated', 'unavailable'],
  },
  ...overrides,
});

const message = (overrides: Record<string, string | number | boolean> = {}): string =>
  JSON.stringify({ type: 'resgrid.lms.lesson', version: 1, enrollmentId: 5, lessonId: 9, kind: 'Scorm2004', status: 'passed', satisfied: true, score: 92, ...overrides });

describe('lesson launch rules', () => {
  it('plays SCORM, cmi5 and LTI lessons through the launch, and nothing else', () => {
    expect(['Scorm', 'Cmi5', 'LtiLink'].map((Kind) => isLaunchLesson({ Kind }))).toEqual([true, true, true]);
    expect(['Blocks', 'Video', 'LiveSession', 'Survey'].map((Kind) => isLaunchLesson({ Kind }))).toEqual([false, false, false, false]);
  });

  it('reads origins exactly: default ports dropped, case folded, credentials and other schemes refused', () => {
    expect(originOf('https://Resgrid.com:443/lms-app/launch?token=x')).toBe(CORE);
    expect(originOf('http://localhost:5151/x')).toBe('http://localhost:5151');
    expect(originOf('https://user:pw@resgrid.com/')).toBeNull();
    expect(originOf('javascript:alert(1)')).toBeNull();
    expect(originOf('app://bundle/')).toBeNull();
    expect(originOf(null)).toBeNull();
  });

  it('opens only a launch on the Core origin its message names, over https, with the message contract this app reads', () => {
    expect(isTrustedLaunch(launch(), false)).toBe(true);
    expect(isTrustedLaunch(launch({ LaunchUrl: 'https://evil.example/lms-app/launch?token=x' }), false)).toBe(false);
    const local = launch({ LaunchUrl: 'http://localhost:5151/lms-app/launch?token=x', CompletionMessage: { ...launch().CompletionMessage, Origin: 'http://localhost:5151' } });
    expect(isTrustedLaunch(local, false)).toBe(false);
    expect(isTrustedLaunch(local, true)).toBe(true);
    expect(isTrustedLaunch(launch({ LaunchUrl: 'http://resgrid.com/lms-app/launch', CompletionMessage: { ...launch().CompletionMessage, Origin: 'http://resgrid.com' } }), true)).toBe(false);
    expect(isTrustedLaunch(launch({ CompletionMessage: { ...launch().CompletionMessage, Version: 2 } }), false)).toBe(false);
  });

  it('takes a message only from the launch origin, for this lesson, with a status the launch named', () => {
    expect(isFromLaunchOrigin('https://resgrid.com/lms-app/return?x=1', launch())).toBe(true);
    expect(isFromLaunchOrigin('https://resgrid.com.evil.example/lms-app/launch', launch())).toBe(false);
    expect(isFromLaunchOrigin('https://evil.example', launch())).toBe(false);

    const expected = launch().CompletionMessage;
    expect(parseLessonMessage(message(), expected)).toMatchObject({ status: 'passed', satisfied: true, score: 92 });
    expect(parseLessonMessage(message({ lessonId: 10 }), expected)).toBeNull();
    expect(parseLessonMessage(message({ enrollmentId: 6 }), expected)).toBeNull();
    expect(parseLessonMessage(message({ status: 'mastered' }), expected)).toBeNull();
    expect(parseLessonMessage(message({ type: 'other' }), expected)).toBeNull();
    expect(parseLessonMessage(message({ version: 2 }), expected)).toBeNull();
    expect(parseLessonMessage(message({ status: 'unavailable', error: '<script>' }), expected)).toBeNull();
    expect(parseLessonMessage('not json', expected)).toBeNull();
    const unavailable = parseLessonMessage(message({ status: 'unavailable', error: 'LapseWindowEnded' }), expected);
    expect(unavailable?.error).toBe('LapseWindowEnded');
    expect(unavailable && isResultMessage(unavailable, expected)).toBe(true);
    const incomplete = parseLessonMessage(message({ status: 'incomplete' }), expected);
    expect(incomplete && isResultMessage(incomplete, expected)).toBe(false);
  });

  it("counts a framed page's message only from the launch frame's own window and origin", () => {
    expect(frameMessage(CORE, true, message(), launch())?.status).toBe('passed');
    expect(frameMessage(CORE, false, message(), launch())).toBeNull();
    expect(frameMessage('https://evil.example', true, message(), launch())).toBeNull();
  });

  it('keeps a package on Core and lets an LTI tool use its own https sites', () => {
    expect(isLaunchNavigationAllowed('https://resgrid.com/lms-app/item?x=1', launch())).toBe(true);
    expect(isLaunchNavigationAllowed('about:blank', launch())).toBe(true);
    expect(isLaunchNavigationAllowed('https://tool.example/login', launch())).toBe(false);
    expect(isLaunchNavigationAllowed('https://tool.example/login', launch({ Kind: 'Lti13' }))).toBe(true);
    expect(isLaunchNavigationAllowed('http://tool.example/login', launch({ Kind: 'Lti13' }))).toBe(false);
    expect(isLaunchNavigationAllowed('intent://x', launch({ Kind: 'Lti13' }))).toBe(false);
  });

  it('names every refusal and load failure', () => {
    expect(launchErrorKey('NotLicensed')).toBe('training.launch.errors.not_licensed');
    expect(launchErrorKey('LapseWindowEnded')).toBe('training.launch.errors.lapse_ended');
    expect(launchErrorKey('AddonRequired')).toBe('training.launch.errors.addon_required');
    expect(launchErrorKey('LessonLocked')).toBe('training.errors.locked');
    expect(launchErrorKey('NotEntitled')).toBe('training.errors.not_available');
    expect(launchErrorKey('MediaUnavailable')).toBe('training.launch.errors.unavailable');
    expect(launchErrorKey('RateLimited')).toBe('training.launch.errors.rate_limited');
    expect(launchErrorKey('not_found')).toBe('training.launch.errors.not_found');
    expect(launchErrorKey('CodeExpired')).toBe('training.launch.errors.expired');
    expect(launchErrorKey('offline')).toBe('training.launch.offline');
    expect(launchErrorKey('Whatever')).toBe('training.errors.generic');
    expect([410, 429, 500].map(launchHttpFailure)).toEqual(['expired', 'RateLimited', null]);
  });
});

describe('LessonLaunchSurface (iOS / Android web view)', () => {
  const props = () => screen.getByTestId('lesson-launch-webview', hidden).props;

  it('opens the link at once, Core only for a package, no cookies, and sends popups and foreign pages to the system browser', async () => {
    const onMessage = jest.fn();
    await render(<LessonLaunchSurface launch={launch()} onMessage={onMessage} onFailure={jest.fn()} />);
    // The test web view shows the source it was given.
    expect(screen.getByTestId('webview-html', hidden)).toHaveTextContent(launch().LaunchUrl);
    expect(props().originWhitelist).toEqual([CORE, 'about:*']);
    expect(props()).toMatchObject({ javaScriptEnabled: true, thirdPartyCookiesEnabled: false, sharedCookiesEnabled: false, allowsInlineMediaPlayback: true, allowsFullscreenVideo: true, setSupportMultipleWindows: true });
    expect(props().onShouldStartLoadWithRequest({ url: `${CORE}/lms-app/item`, isTopFrame: true })).toBe(true);
    expect(props().onShouldStartLoadWithRequest({ url: 'https://cdn.example/sco/index.html', isTopFrame: false })).toBe(true);
    expect(props().onShouldStartLoadWithRequest({ url: 'https://elsewhere.example/', isTopFrame: true })).toBe(false);
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://elsewhere.example/');
    props().onOpenWindow({ nativeEvent: { targetUrl: 'https://help.example/popup' } });
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://help.example/popup');
  });

  it('passes on the completion message only from a page on the launch origin', async () => {
    const onMessage = jest.fn();
    await render(<LessonLaunchSurface launch={launch()} onMessage={onMessage} onFailure={jest.fn()} />);
    props().onMessage({ nativeEvent: { url: 'https://evil.example/', data: message() } });
    props().onMessage({ nativeEvent: { url: `${CORE}/lms-app/launch`, data: message({ lessonId: 99 }) } });
    expect(onMessage).not.toHaveBeenCalled();
    props().onMessage({ nativeEvent: { url: `${CORE}/lms-app/launch`, data: message() } });
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ status: 'passed', lessonId: 9 }));
  });

  it('reports a used or expired link (410), too many opens (429) and a lost connection', async () => {
    const onFailure = jest.fn();
    await render(<LessonLaunchSurface launch={launch()} onMessage={jest.fn()} onFailure={onFailure} />);
    props().onHttpError({ nativeEvent: { url: `${CORE}/lms-app/launch`, statusCode: 410 } });
    props().onHttpError({ nativeEvent: { url: `${CORE}/lms-app/launch`, statusCode: 429 } });
    props().onHttpError({ nativeEvent: { url: 'https://cdn.example/x', statusCode: 410 } });
    props().onError();
    expect(onFailure.mock.calls).toEqual([['expired'], ['RateLimited'], ['network']]);
  });

  it("gives an LTI tool its https sites and its cookies (Resgrid's page sets none)", async () => {
    await render(<LessonLaunchSurface launch={launch({ Kind: 'Lti13' })} onMessage={jest.fn()} onFailure={jest.fn()} />);
    expect(props().originWhitelist).toEqual([CORE, 'about:*', 'https://*']);
    expect(props()).toMatchObject({ thirdPartyCookiesEnabled: true, sharedCookiesEnabled: true });
    expect(props().onShouldStartLoadWithRequest({ url: 'https://tool.example/oidc/login', isTopFrame: true })).toBe(true);
  });
});

describe('LTI fallback in the system browser (iOS / Android)', () => {
  it('runs the launch in the auth session and comes back when the member closes it', async () => {
    await expect(prepareLaunchBrowser().open(launch({ Kind: 'Lti13' }).LaunchUrl)).resolves.toBe('closed');
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(launch().LaunchUrl, 'resgrid://training/lms-return', { preferEphemeralSession: false });
    jest.mocked(WebBrowser.openAuthSessionAsync).mockRejectedValueOnce(new Error('no browser'));
    await expect(prepareLaunchBrowser().open('https://resgrid.com/x')).resolves.toBe('failed');
  });
});

describe('CoursePlayerScreen with SCORM, cmi5 and LTI lessons', () => {
  const access = (overrides: Partial<LmsMyAccessData> = {}): LmsMyAccessData => ({
    TrainingModuleOn: true,
    LmsFlagOn: true,
    AddonActive: true,
    IsLapsed: false,
    CanBeTrained: true,
    EnhancedAiActive: false,
    ...overrides,
  });

  const course = (overrides: Partial<LmsMyCourseData> = {}): LmsMyCourseData =>
    // SAFETY: a test double: it carries only the fields the code under test reads.
    ({ EnrollmentId: 5, CourseId: 50, Title: 'SCBA', IsAcademy: false, Status: 'InProgress', ProgressPercent: 10, CanRun: true, ...overrides }) as LmsMyCourseData;

  const lesson = (overrides: Partial<LmsLessonData> = {}): LmsLessonData =>
    // SAFETY: a test double: it carries only the fields the code under test reads.
    ({ LessonId: 9, ModuleId: 1, ModuleTitle: 'Module', Title: 'Donning', Kind: 'Scorm', IsRequired: true, IsLocked: false, Progress: 'NotStarted', Files: [], ...overrides }) as LmsLessonData;

  const outline = (item: LmsLessonData, extra: Partial<LmsCourseResult> = {}): LmsCourseResult =>
    // SAFETY: a test double: it carries only the fields the code under test reads.
    ({ Course: course(), CurrentLessonId: 9, Lessons: [item], ...extra }) as LmsCourseResult;

  const fetchCourse = jest.fn(async () => undefined);
  const getLessonLaunch = jest.fn();

  const seed = (item: LmsLessonData, extra: Partial<LmsCourseResult> = {}, accessData: LmsMyAccessData | null = access()) =>
    // SAFETY: a test double: only the store actions the screen calls.
    useTrainingStore.setState({ coursesByEnrollment: { 5: outline(item, extra) }, access: accessData, fetchCourse, getLessonLaunch, saveProgress: jest.fn(async () => undefined) } as never);

  beforeEach(() => {
    activateVariant('responder');
    // SAFETY: a test double: it carries only the fields the code under test reads.
    featureFlagsStore.setState({ flags: { 'Training.Lms': { enabled: true } } as never, isLoaded: true });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '5' });
    jest.mocked(useNetInfo).mockReturnValue(
      // SAFETY: a test double: only the fields the connectivity check reads.
      { isConnected: true, isInternetReachable: true } as never
    );
    fetchCourse.mockClear();
    getLessonLaunch.mockReset().mockResolvedValue({ value: launch(), error: null });
    jest.mocked(WebBrowser.openAuthSessionAsync).mockClear();
  });

  it('plays a SCORM lesson in the app, refreshes the course on the result message, and closes with Done', async () => {
    seed(lesson());
    await render(<CoursePlayerScreen />);
    expect(screen.queryByTestId('course-lesson-web-only', hidden)).toBeNull();
    await fireEvent.press(screen.getByTestId('course-launch-start', hidden));
    await waitFor(() => expect(screen.getByTestId('lesson-launch-player', hidden)).toBeTruthy());
    expect(getLessonLaunch).toHaveBeenCalledWith(5, 9);
    expect(screen.getByTestId('webview-html', hidden)).toHaveTextContent(launch().LaunchUrl);
    expect(screen.queryByTestId('lesson-launch-browser', hidden)).toBeNull();

    fetchCourse.mockClear();
    const webview = () => screen.getByTestId('lesson-launch-webview', hidden).props;
    await webview().onMessage({ nativeEvent: { url: 'https://evil.example/', data: message() } });
    await webview().onMessage({ nativeEvent: { url: `${CORE}/lms-app/launch`, data: message({ status: 'incomplete' }) } });
    expect(fetchCourse).not.toHaveBeenCalled();
    await webview().onMessage({ nativeEvent: { url: `${CORE}/lms-app/launch`, data: message() } });
    expect(fetchCourse).toHaveBeenCalledWith(5, { bypassCache: true });

    await fireEvent.press(screen.getByTestId('lesson-launch-done', hidden));
    expect(screen.queryByTestId('lesson-launch-player', hidden)).toBeNull();
    expect(screen.getByTestId('course-launch-start', hidden)).toBeTruthy();
    expect(fetchCourse).toHaveBeenCalledTimes(2);
  });

  it('launches a cmi5 lesson the same way; a live session is still taken on the web', async () => {
    seed(lesson({ Kind: 'Cmi5' }));
    await render(<CoursePlayerScreen />);
    expect(screen.getByTestId('course-launch', hidden)).toBeTruthy();
    seed(lesson({ Kind: 'LiveSession' }));
    await waitFor(() => expect(screen.getByTestId('course-lesson-web-only', hidden)).toBeTruthy());
    expect(screen.queryByTestId('course-launch', hidden)).toBeNull();
  });

  it('checks the connection first: offline, nothing is asked of Core', async () => {
    jest.mocked(useNetInfo).mockReturnValue(
      // SAFETY: a test double: only the fields the connectivity check reads.
      { isConnected: false, isInternetReachable: false } as never
    );
    seed(lesson());
    await render(<CoursePlayerScreen />);
    expect(screen.getByTestId('course-launch-offline', hidden)).toBeTruthy();
    expect(screen.getByTestId('course-launch-start', hidden).props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('course-launch-start', hidden));
    expect(getLessonLaunch).not.toHaveBeenCalled();
  });

  it.each([
    ['NotLicensed', 'training.launch.errors.not_licensed'],
    ['LapseWindowEnded', 'training.launch.errors.lapse_ended'],
    ['RateLimited', 'training.launch.errors.rate_limited'],
    ['not_found', 'training.launch.errors.not_found'],
  ])('says why Core refused the launch (%s)', async (code, key) => {
    getLessonLaunch.mockResolvedValue({ value: null, error: code });
    seed(lesson());
    await render(<CoursePlayerScreen />);
    await fireEvent.press(screen.getByTestId('course-launch-start', hidden));
    await waitFor(() => expect(screen.getByTestId('course-launch-error', hidden)).toHaveTextContent(key));
    expect(screen.queryByTestId('lesson-launch-player', hidden)).toBeNull();
  });

  it('never opens a link off the Core origin its message names', async () => {
    getLessonLaunch.mockResolvedValue({ value: launch({ LaunchUrl: 'https://evil.example/lms-app/launch?token=x' }), error: null });
    seed(lesson());
    await render(<CoursePlayerScreen />);
    await fireEvent.press(screen.getByTestId('course-launch-start', hidden));
    await waitFor(() => expect(screen.getByTestId('course-launch-error', hidden)).toHaveTextContent('training.launch.errors.unavailable'));
    expect(screen.queryByTestId('lesson-launch-player', hidden)).toBeNull();
  });

  it('closes the player on a used or expired link, and on a refusal the page reports', async () => {
    seed(lesson());
    await render(<CoursePlayerScreen />);
    await fireEvent.press(screen.getByTestId('course-launch-start', hidden));
    await waitFor(() => expect(screen.getByTestId('lesson-launch-player', hidden)).toBeTruthy());
    await screen.getByTestId('lesson-launch-webview', hidden).props.onHttpError({ nativeEvent: { url: `${CORE}/lms-app/launch`, statusCode: 410 } });
    await waitFor(() => expect(screen.getByTestId('course-launch-error', hidden)).toHaveTextContent('training.launch.errors.expired'));

    await fireEvent.press(screen.getByTestId('course-launch-start', hidden));
    await waitFor(() => expect(screen.getByTestId('lesson-launch-player', hidden)).toBeTruthy());
    await screen.getByTestId('lesson-launch-webview', hidden).props.onMessage({ nativeEvent: { url: `${CORE}/lms-app/launch`, data: message({ status: 'unavailable', error: 'LapseWindowEnded' }) } });
    await waitFor(() => expect(screen.getByTestId('course-launch-error', hidden)).toHaveTextContent('training.launch.errors.lapse_ended'));
  });

  it('opens an LTI tool in the app, and in the system browser when it refuses the embedded view; back, the course is read again', async () => {
    const second = launch({ Kind: 'Lti13', LaunchUrl: `${CORE}/lms-app/launch?token=second` });
    getLessonLaunch.mockResolvedValueOnce({ value: launch({ Kind: 'Lti13' }), error: null }).mockResolvedValueOnce({ value: second, error: null });
    seed(lesson({ Kind: 'LtiLink' }));
    await render(<CoursePlayerScreen />);
    expect(screen.getByText('training.launch.hint_lti', hidden)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('course-launch-start', hidden));
    await waitFor(() => expect(screen.getByTestId('lesson-launch-browser', hidden)).toBeTruthy());

    fetchCourse.mockClear();
    await fireEvent.press(screen.getByTestId('lesson-launch-browser', hidden));
    await waitFor(() => expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(second.LaunchUrl, 'resgrid://training/lms-return', { preferEphemeralSession: false }));
    expect(getLessonLaunch).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(fetchCourse).toHaveBeenCalledWith(5, { bypassCache: true }));
    expect(screen.queryByTestId('lesson-launch-player', hidden)).toBeNull();
  });

  it('keeps the seat and lapse rules: no launch on a read-only course or without the member LMS', async () => {
    seed(lesson(), { Error: 'NotLicensed' });
    await render(<CoursePlayerScreen />);
    expect(screen.getByTestId('course-launch-refused', hidden)).toHaveTextContent('training.launch.errors.not_licensed');
    expect(screen.queryByTestId('course-launch-start', hidden)).toBeNull();

    seed(lesson(), {}, access({ CanBeTrained: false }));
    await waitFor(() => expect(screen.getByTestId('course-launch-refused', hidden)).toHaveTextContent('training.errors.not_available'));
    expect(screen.queryByTestId('course-launch-start', hidden)).toBeNull();
  });
});
