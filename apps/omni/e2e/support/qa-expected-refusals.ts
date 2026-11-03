import { flagsExpected, type QaDepartment, type QaUser } from './qa-departments';

/** A failed Core response seen by the app during a QA test. */
export interface ApiFailure {
  method: string;
  url: string;
  status: number;
  /** OAuth `error`, problem-details `type`, or the v4 envelope `Status`. */
  code: string | null;
  /** Core's `X-Resgrid-Reason` header: a deliberate refusal (module or feature off for the department). */
  reason: string | null;
}

/** Who the test signed in as. */
export interface QaSignedIn {
  department: QaDepartment | null;
  user: QaUser | null;
}

interface ExpectedRefusal {
  matches: (failure: ApiFailure, context: QaSignedIn) => boolean;
  /** Why the server refuses this by design and the app copes; shown next to every tolerated failure. */
  why: string;
}

const path = (failure: ApiFailure): string => new URL(failure.url).pathname.toLowerCase();

// Core refusals the apps meet on a correctly working server. Keep this list short: each entry is a server decision the
// app is expected to absorb, never a defect. Anything not listed, and every 5xx, fails the test.
const EXPECTED: readonly ExpectedRefusal[] = [
  {
    matches: (f) => path(f).endsWith('/connect/token') && (f.status === 400 || f.status === 401) && ['invalid_client', 'invalid_grant', 'mfa_required', 'mfa_enrollment_required', 'invalid_totp'].includes(f.code ?? ''),
    why: 'Sign-in refusals are asserted by the sign-in tests; invalid_client means the server has no OAuth client for this app id and the app retries without it (packages/auth connect.ts).',
  },
  {
    matches: (f) => path(f).endsWith('/mfaapproval/pending') && f.status === 400 && f.code === 'approval_unavailable',
    why: 'Approve-with-Responder is not enabled on this server; the app reads the refusal as no pending approval.',
  },
  {
    matches: (f) => path(f).endsWith('/sessions/current') && f.status === 409 && f.code === 'session_required',
    why: 'Shared-device apps (Unit, IC, Dispatch) ask how a shared session stands; a personal session has none and the app ignores the answer (packages/auth shared-session-controller.ts).',
  },
  {
    matches: (f, { department, user }) => f.status === 403 && user !== null && !user.admin && (department?.features.permissions.length ?? 0) > 0,
    why: 'The department restricts this permission and the persona is not an admin; the sweep deep-links into every screen anyway.',
  },
  {
    matches: (f, { department: d }) => /\/api\/v4\/record[a-z]*\//.test(path(f)) && f.status === 404 && d !== null && flagsExpected(d, ['Records.System']) === false,
    why: 'Records is off for this department, so Core answers 404 (RecordsGate); the sweep deep-links into the screen anyway.',
  },
  {
    matches: (f) => f.reason !== null && [400, 403, 404].includes(f.status),
    why: 'Core marked the refusal with X-Resgrid-Reason: the module or feature is off for this department.',
  },
];

/** The failures no expected refusal explains, as readable lines. */
export function unexpectedFailures(failures: readonly ApiFailure[], context: QaSignedIn): string[] {
  return failures.flatMap((failure) => (EXPECTED.some((rule) => rule.matches(failure, context)) ? [] : [describeFailure(failure)]));
}

export function describeFailure(failure: ApiFailure): string {
  return `${failure.method} ${new URL(failure.url).pathname} -> ${failure.status}${failure.code ? ` ${failure.code}` : ''}${failure.reason ? ` (${failure.reason})` : ''}`;
}
