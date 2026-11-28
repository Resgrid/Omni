import '../../calls/__tests__/test-setup';

import type { LmsLessonLaunchData } from '@resgrid/models';

import { canPlayInApp, LESSON_LAUNCH_IFRAME_SANDBOX, playsLessonInApp } from '../components/lesson-launch-surface.web';
import { prepareLaunchBrowser } from '../lib/launch-browser.web';

// Web and Electron builds (`.web` modules, imported directly: Jest resolves the native ones by default).

const mockElectron = { value: false };

jest.mock('@resgrid/core/platform/platform', () => ({ ...jest.requireActual('@resgrid/core/platform/platform'), isElectron: () => mockElectron.value }));

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

describe('web and Electron', () => {
  const location = Object.getOwnPropertyDescriptor(globalThis, 'location');

  afterEach(() => {
    mockElectron.value = false;

    if (location) Object.defineProperty(globalThis, 'location', location);
  });

  it('frames a package with the sandbox Core needs, never an LTI tool, and never a page on the app origin', () => {
    expect(LESSON_LAUNCH_IFRAME_SANDBOX).toBe('allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads');
    Object.defineProperty(globalThis, 'location', { value: { href: 'https://responder.resgrid.com/training/course/5' }, configurable: true });
    expect(canPlayInApp(launch())).toBe(true);
    expect(canPlayInApp(launch({ Kind: 'Lti13' }))).toBe(false);
    expect(playsLessonInApp({ Kind: 'LtiLink' })).toBe(false);
    expect(playsLessonInApp({ Kind: 'Scorm' })).toBe(true);
    Object.defineProperty(globalThis, 'location', { value: { href: 'https://resgrid.com/app' }, configurable: true });
    expect(canPlayInApp(launch())).toBe(false);
  });

  it('opens a browser window while the tap counts, cuts it off from the app, and points it at the link', async () => {
    const popup = { closed: false, opener: {}, location: { href: '' }, close: jest.fn() };
    const open = jest.fn(() => popup);
    Object.defineProperty(globalThis, 'open', { value: open, configurable: true, writable: true });
    const browser = prepareLaunchBrowser();
    expect(open).toHaveBeenCalledWith('', 'resgrid-lms-lesson');
    await expect(browser.open(launch().LaunchUrl)).resolves.toBe('opened');
    expect(popup).toMatchObject({ opener: null, location: { href: launch().LaunchUrl } });
    prepareLaunchBrowser().discard();
    expect(popup.close).toHaveBeenCalled();
  });

  it('says the window is blocked instead of opening one late, when the browser refused it or the member closed it', async () => {
    const closed = { closed: true, opener: {}, location: { href: '' }, close: jest.fn() };
    const open = jest.fn((): typeof closed | null => null);
    Object.defineProperty(globalThis, 'open', { value: open, configurable: true, writable: true });
    await expect(prepareLaunchBrowser().open(launch().LaunchUrl)).resolves.toBe('blocked');
    expect(open).toHaveBeenCalledTimes(1);

    open.mockReturnValue(closed);
    await expect(prepareLaunchBrowser().open(launch().LaunchUrl)).resolves.toBe('blocked');
    expect(open).toHaveBeenCalledTimes(2);
    expect(closed.location.href).toBe('');
  });

  it('in Electron, hands the link to the system browser (the shell denies the window and opens it outside)', async () => {
    mockElectron.value = true;
    const open = jest.fn(() => null);
    Object.defineProperty(globalThis, 'open', { value: open, configurable: true, writable: true });
    const browser = prepareLaunchBrowser();
    expect(open).not.toHaveBeenCalled();
    await expect(browser.open(launch().LaunchUrl)).resolves.toBe('opened');
    expect(open).toHaveBeenCalledWith(launch().LaunchUrl, '_blank', 'noopener,noreferrer');
  });
});
