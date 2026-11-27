import { isDev } from '@resgrid/core/dev';
import type { LmsLessonCompletionMessageData, LmsLessonData, LmsLessonLaunchData } from '@resgrid/models';
import { z } from 'zod';

// ---------------------------------------------------------------------------------------------------------------------
// SCORM, cmi5 and LTI lessons in the app (Core round 10 A8). `Lms/GetLessonLaunch` hands out a signed, single-use link (five
// minutes at most) to Core's in-app launch page; the app opens it at once — a native web view on iOS/Android, a sandboxed iframe on
// web and Electron, the system browser for LTI tools that refuse to be framed — and the page reports the lesson's state with one
// message. The message is a hint only: the app reads the course again (`Lms/GetCourse`), which is the record.
// ---------------------------------------------------------------------------------------------------------------------

/** Lesson kinds that run through the launch page (Core `LmsLessonKinds`; Scorm covers SCORM 1.2 and 2004). */
const LAUNCH_LESSON_KINDS = new Set<string>(['Scorm', 'Cmi5', 'LtiLink']);

export const isLaunchLesson = (lesson: Pick<LmsLessonData, 'Kind'>): boolean => LAUNCH_LESSON_KINDS.has(lesson.Kind ?? '');

/** An LTI 1.3 tool (its own site, its own sign-in), as opposed to a package Core plays itself. */
export const isLtiLaunch = (launch: Pick<LmsLessonLaunchData, 'Kind'>): boolean => launch.Kind === 'Lti13';

export const isLtiLesson = (lesson: Pick<LmsLessonData, 'Kind'>): boolean => lesson.Kind === 'LtiLink';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const ORIGIN = /^(https?):\/\/([^/?#\s@\\]+)(?:[/?#]|$)/i;

const DEFAULT_PORTS = new Map([
  ['https', ':443'],
  ['http', ':80'],
]);

/**
 * The origin (`scheme://host[:port]`, lower-case, default port dropped) of an http(s) URL; null for anything else, a URL with
 * credentials included. Parsed by hand: React Native's URL has no `origin`.
 */
export function originOf(url: string | null | undefined): string | null {
  const match = ORIGIN.exec((url ?? '').trim());

  if (!match) return null;

  const scheme = (match[1] ?? '').toLowerCase();
  const authority = (match[2] ?? '').toLowerCase();
  const defaultPort = DEFAULT_PORTS.get(scheme) ?? '';
  const host = authority.endsWith(defaultPort) ? authority.slice(0, authority.length - defaultPort.length) : authority;

  return host ? `${scheme}://${host}` : null;
}

const hostOf = (origin: string): string => origin.replace(/^https?:\/\//, '').replace(/:\d+$/, '');

/** Https, or plain http to this computer in a development build (a local Core). */
function isSecureOrigin(origin: string, allowLocalHttp: boolean): boolean {
  return origin.startsWith('https://') || (allowLocalHttp && origin.startsWith('http://') && LOOPBACK.has(hostOf(origin)));
}

/**
 * Whether a launch can be opened: the link is on the Core web origin the completion message names, over https (http to loopback in
 * development), and the message contract is the one this app reads (`resgrid.lms.lesson` version 1).
 */
export function isTrustedLaunch(launch: LmsLessonLaunchData, allowLocalHttp: boolean = isDev()): boolean {
  const origin = originOf(launch.CompletionMessage?.Origin);

  return (
    origin !== null &&
    isSecureOrigin(origin, allowLocalHttp) &&
    originOf(launch.LaunchUrl) === origin &&
    launch.CompletionMessage.Type === LESSON_MESSAGE_TYPE &&
    launch.CompletionMessage.Version === LESSON_MESSAGE_VERSION
  );
}

/** The Core web origin a launch's page and its messages must come from. */
export const launchOrigin = (launch: LmsLessonLaunchData): string | null => originOf(launch.CompletionMessage?.Origin);

/**
 * Whether a message came from the launch page: a native web view's `nativeEvent.url` or a frame's `event.origin` must be on the
 * completion message's origin exactly (a look-alike host such as `resgrid.com.example.org` is not).
 */
export function isFromLaunchOrigin(urlOrOrigin: string | null | undefined, launch: LmsLessonLaunchData): boolean {
  const expected = launchOrigin(launch);

  return expected !== null && originOf(urlOrOrigin) === expected;
}

export const LESSON_MESSAGE_TYPE = 'resgrid.lms.lesson';
export const LESSON_MESSAGE_VERSION = 1;

/** Core's completion message (`resgrid.lms.lesson`, version 1). */
const LESSON_MESSAGE = z.object({
  type: z.literal(LESSON_MESSAGE_TYPE),
  version: z.number().int(),
  enrollmentId: z.number().int(),
  lessonId: z.number().int(),
  kind: z.string().max(32).optional(),
  status: z.string().regex(/^[a-zA-Z]{2,32}$/),
  satisfied: z.boolean().optional(),
  score: z.number().optional(),
  error: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_]{1,80}$/)
    .optional(),
});

export type LessonLaunchMessage = z.infer<typeof LESSON_MESSAGE>;

/**
 * The launch page's message, when it is one for this launch: the type and version this app reads, this enrollment and lesson, and a
 * status the launch said it may send. Anything else (another page's message, a malformed or foreign payload) is null.
 */
export function parseLessonMessage(json: string, expected: LmsLessonCompletionMessageData): LessonLaunchMessage | null {
  let value: z.input<typeof LESSON_MESSAGE> | null;

  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }

  const parsed = LESSON_MESSAGE.safeParse(value);

  if (!parsed.success) return null;

  const message = parsed.data;

  if (message.version !== expected.Version || message.enrollmentId !== expected.EnrollmentId || message.lessonId !== expected.LessonId) return null;

  return expected.Statuses.includes(message.status) ? message : null;
}

/**
 * A framed launch page's `message` event: counted only when it comes from the launch frame's own window, on the launch's origin, and
 * parses as this lesson's message.
 */
export function frameMessage(origin: string, fromLaunchFrame: boolean, json: string, launch: LmsLessonLaunchData): LessonLaunchMessage | null {
  return fromLaunchFrame && isFromLaunchOrigin(origin, launch) ? parseLessonMessage(json, launch.CompletionMessage) : null;
}

/** A status that means the attempt reached an outcome (the course is read again then). */
export const isResultMessage = (message: LessonLaunchMessage, expected: LmsLessonCompletionMessageData): boolean => expected.ResultStatuses.includes(message.status);

/**
 * Whether the native web view may load a page in place: Core's own origin (the launch, return and item pages), and for an LTI tool
 * any https site (its sign-in and content). Frames inside the page (the sandboxed package) are left to the page.
 */
export function isLaunchNavigationAllowed(url: string, launch: LmsLessonLaunchData): boolean {
  if (url === 'about:blank' || url === 'about:srcdoc') return true;

  const origin = originOf(url);

  if (origin === null) return false;

  return origin === launchOrigin(launch) || (isLtiLaunch(launch) && origin.startsWith('https://'));
}

/** A page the launch opens in a new window (a SCORM popup, a tool's help page): http(s) only, opened in the system browser. */
export const isExternalOpenable = (url: string | null | undefined): boolean => originOf(url)?.startsWith('https://') === true;

/** Why a launch could not open or ended early (refusal codes from `GetLessonLaunch`, the page's `error`, and the app's own). */
const LAUNCH_ERROR_KEYS = new Map<string, string>([
  ['LessonLocked', 'training.errors.locked'],
  ['NotLicensed', 'training.launch.errors.not_licensed'],
  ['LapseWindowEnded', 'training.launch.errors.lapse_ended'],
  ['AddonRequired', 'training.launch.errors.addon_required'],
  ['NotEntitled', 'training.errors.not_available'],
  ['MediaUnavailable', 'training.launch.errors.unavailable'],
  ['RateLimited', 'training.launch.errors.rate_limited'],
  ['not_found', 'training.launch.errors.not_found'],
  ['NotFound', 'training.launch.errors.not_found'],
  ['CodeExpired', 'training.launch.errors.expired'],
  ['expired', 'training.launch.errors.expired'],
  ['offline', 'training.launch.offline'],
  ['network', 'training.launch.offline'],
]);

export const launchErrorKey = (code: string | null | undefined): string => LAUNCH_ERROR_KEYS.get(code ?? '') ?? 'training.errors.generic';

/** What a document load failure inside the native web view means (410 used or expired link, 429 too many opens). */
const HTTP_FAILURES = new Map<number, string>([
  [410, 'expired'],
  [429, 'RateLimited'],
]);

export const launchHttpFailure = (statusCode: number): string | null => HTTP_FAILURES.get(statusCode) ?? null;
