import { type GateInputs, resolveGateStep } from '../gate-state';

const open: GateInputs = {
  startupReady: true,
  onboardingRequired: false,
  signedIn: true,
  accessDeniedNotice: false,
  maintenance: false,
  personalLocked: false,
  appAccess: 'allowed',
  sharedLocked: false,
};

describe('resolveGateStep (ShellGate state machine)', () => {
  it('shows the app when no gate applies', () => {
    expect(resolveGateStep(open)).toBe('app');
  });

  it('is loading until startup finished, whatever else is true', () => {
    expect(resolveGateStep({ ...open, startupReady: false, signedIn: false, onboardingRequired: true })).toBe('loading');
  });

  it.each<[string, Partial<GateInputs>, string]>([
    ['onboarding', { onboardingRequired: true }, 'onboarding'],
    ['login', { signedIn: false }, 'login'],
    ['maintenance', { maintenance: true }, 'maintenance'],
    ['personal lock', { personalLocked: true }, 'personal-lock'],
    ['app-access right', { appAccess: 'denied' }, 'access-denied'],
    ['shared-device lock', { sharedLocked: true }, 'shared-lock'],
  ])('%s gate', (_name, patch, expected) => {
    expect(resolveGateStep({ ...open, ...patch })).toBe(expected);
  });

  it('applies the gates in order: onboarding → login → maintenance → personal lock → app access → shared lock', () => {
    const all: GateInputs = { ...open, onboardingRequired: true, signedIn: false, maintenance: true, personalLocked: true, appAccess: 'denied', sharedLocked: true };
    expect(resolveGateStep(all)).toBe('onboarding');
    expect(resolveGateStep({ ...all, onboardingRequired: false })).toBe('login');
    expect(resolveGateStep({ ...all, onboardingRequired: false, signedIn: true })).toBe('maintenance');
    expect(resolveGateStep({ ...all, onboardingRequired: false, signedIn: true, maintenance: false })).toBe('personal-lock');
    expect(resolveGateStep({ ...all, onboardingRequired: false, signedIn: true, maintenance: false, personalLocked: false })).toBe('access-denied');
    expect(resolveGateStep({ ...all, onboardingRequired: false, signedIn: true, maintenance: false, personalLocked: false, appAccess: 'allowed' })).toBe('shared-lock');
  });

  it('shows the access denial instead of the login screen after the app-access check signed the member out', () => {
    expect(resolveGateStep({ ...open, signedIn: false, accessDeniedNotice: true })).toBe('access-denied');
    expect(resolveGateStep({ ...open, signedIn: false, accessDeniedNotice: false })).toBe('login');
  });

  it('never locks a member out on unknown rights (only an explicit false denies)', () => {
    expect(resolveGateStep({ ...open, appAccess: 'unknown' })).toBe('app');
  });

  it('accepts a custom order', () => {
    expect(resolveGateStep({ ...open, signedIn: false, maintenance: true }, ['maintenance', 'login'])).toBe('maintenance');
  });
});
