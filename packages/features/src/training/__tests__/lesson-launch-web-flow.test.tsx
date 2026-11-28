import '../../calls/__tests__/test-setup';

import { useNetInfo } from '@react-native-community/netinfo';
import { featureFlagsStore } from '@resgrid/auth';
import { useTrainingStore } from '@resgrid/data';
import type { LmsCourseResult, LmsLessonData, LmsLessonLaunchData, LmsMyAccessData, LmsMyCourseData } from '@resgrid/models';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { activateVariant, hidden } from '../../calls/__tests__/test-utils';
import CoursePlayerScreen from '../screens/course-player';

// The course player as the web build runs it: the `.web` launch browser and surface (Jest resolves the native ones by default).
jest.mock('../lib/launch-browser', () => jest.requireActual('../lib/launch-browser.web'));

jest.mock('../components/lesson-launch-surface', () => jest.requireActual('../components/lesson-launch-surface.web'));

jest.mock('@resgrid/core/platform/platform', () => ({ ...jest.requireActual('@resgrid/core/platform/platform'), isElectron: () => false }));

// The app is served from Core's own web origin here, so a package is never framed: it opens in a window of its own.
const CORE = 'https://resgrid.com';

const launch = (): LmsLessonLaunchData => ({
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
});

const access: LmsMyAccessData = { TrainingModuleOn: true, LmsFlagOn: true, AddonActive: true, IsLapsed: false, CanBeTrained: true, EnhancedAiActive: false };

const course = (): LmsMyCourseData =>
  // SAFETY: a test double: it carries only the fields the code under test reads.
  ({ EnrollmentId: 5, CourseId: 50, Title: 'SCBA', IsAcademy: false, Status: 'InProgress', ProgressPercent: 10, CanRun: true }) as LmsMyCourseData;

const lesson = (): LmsLessonData => {
  const fields: Partial<LmsLessonData> = { LessonId: 9, ModuleId: 1, ModuleTitle: 'Module', Title: 'Donning', Kind: 'Scorm', IsRequired: true, IsLocked: false, Progress: 'NotStarted', Files: [] };

  // SAFETY: a test double: it carries only the fields the code under test reads.
  return fields as LmsLessonData;
};

const outline = (): LmsCourseResult =>
  // SAFETY: a test double: it carries only the fields the code under test reads.
  ({ Course: course(), CurrentLessonId: 9, Lessons: [lesson()] }) as LmsCourseResult;

describe('CoursePlayerScreen on the web, with a launch on the app origin', () => {
  const location = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const calls: string[] = [];
  const popup = { closed: false, opener: {}, location: { href: '' }, close: jest.fn() };

  const open = jest.fn((url: string): typeof popup | null => {
    calls.push(`open:${url}`);

    // A browser blocks a window opened once the launch request was made (no tap counts any more).
    return calls.includes('launch') ? null : popup;
  });

  const getLessonLaunch = jest.fn(async () => {
    calls.push('launch');

    return { value: launch(), error: null };
  });

  beforeEach(() => {
    activateVariant('responder');
    // SAFETY: a test double: it carries only the fields the code under test reads.
    featureFlagsStore.setState({ flags: { 'Training.Lms': { enabled: true } } as never, isLoaded: true });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '5' });
    jest.mocked(useNetInfo).mockReturnValue(
      // SAFETY: a test double: only the fields the connectivity check reads.
      { isConnected: true, isInternetReachable: true } as never
    );
    Object.defineProperty(globalThis, 'location', { value: { href: `${CORE}/app/training/course/5` }, configurable: true });
    Object.defineProperty(globalThis, 'open', { value: open, configurable: true, writable: true });
    // SAFETY: a test double: only the store actions the screen calls.
    useTrainingStore.setState({ coursesByEnrollment: { 5: outline() }, access, fetchCourse: jest.fn(async () => undefined), getLessonLaunch, saveProgress: jest.fn(async () => undefined) } as never);
  });

  afterEach(() => {
    if (location) Object.defineProperty(globalThis, 'location', location);
  });

  it('asks for a new tap instead of claiming a blocked window opened, then reserves the window before Core is asked', async () => {
    await render(<CoursePlayerScreen />);
    await fireEvent.press(screen.getByTestId('course-launch-start', hidden));
    await waitFor(() => expect(screen.getByTestId('course-launch-error', hidden)).toHaveTextContent('training.launch.errors.window_blocked'));
    expect(screen.queryByTestId('course-launch-elsewhere', hidden)).toBeNull();
    expect(popup.location.href).toBe('');

    calls.length = 0;
    await fireEvent.press(screen.getByTestId('course-launch-start', hidden));
    await waitFor(() => expect(screen.getByTestId('course-launch-elsewhere', hidden)).toBeTruthy());
    // The blank window opened while the tap counted, before the launch was asked for, and was then pointed at the link.
    expect(calls).toEqual(['open:', 'launch']);
    expect(popup).toMatchObject({ opener: null, location: { href: launch().LaunchUrl } });
  });
});
