import type { AppAccessDecision } from '@resgrid/auth';

/** What the shell shows instead of the app (or `app`). */
export type GateStep = 'loading' | 'onboarding' | 'login' | 'maintenance' | 'personal-lock' | 'access-denied' | 'shared-lock' | 'app';

export interface GateInputs {
  /** Startup finished: storage open, translations and the session restored. */
  startupReady: boolean;
  /** Variant has onboarding, the platform shows it, and it has not been completed (`IS_FIRST_TIME`). */
  onboardingRequired: boolean;
  signedIn: boolean;
  /** The app-access check signed the member out; shown until dismissed (before the login screen). */
  accessDeniedNotice: boolean;
  /** Variant honours maintenance mode and the deployment switched it on. */
  maintenance: boolean;
  /** Personal inactivity lock engaged (Dispatch). */
  personalLocked: boolean;
  /** `checkAppAccess()` against the loaded rights (only an explicit `false` denies). */
  appAccess: AppAccessDecision;
  /** Shared-device session locked by the server. */
  sharedLocked: boolean;
}

/**
 * Gate order (omni-plan §5.4): onboarding → login → maintenance → personal lock → app-access right → shared-device lock.
 * One constant, so a variant-wide change of order is a one-line diff (Dispatch and BigBoard checked maintenance first).
 */
export const GATE_ORDER = ['onboarding', 'login', 'maintenance', 'personal-lock', 'app-access', 'shared-lock'] as const;
export type GateCheck = (typeof GATE_ORDER)[number];

const CHECKS: Record<GateCheck, (inputs: GateInputs) => GateStep | null> = {
  onboarding: (inputs) => (inputs.onboardingRequired ? 'onboarding' : null),
  login: (inputs) => (inputs.signedIn ? null : inputs.accessDeniedNotice ? 'access-denied' : 'login'),
  maintenance: (inputs) => (inputs.maintenance ? 'maintenance' : null),
  'personal-lock': (inputs) => (inputs.personalLocked ? 'personal-lock' : null),
  'app-access': (inputs) => (inputs.appAccess === 'denied' || inputs.accessDeniedNotice ? 'access-denied' : null),
  'shared-lock': (inputs) => (inputs.sharedLocked ? 'shared-lock' : null),
};

/** The ShellGate state machine: the first gate that applies, `loading` before startup, else `app`. */
export function resolveGateStep(inputs: GateInputs, order: readonly GateCheck[] = GATE_ORDER): GateStep {
  if (!inputs.startupReady) {
    return 'loading';
  }
  for (const check of order) {
    const step = CHECKS[check](inputs);
    if (step) {
      return step;
    }
  }
  return 'app';
}
