// Href builders for the sign-in, session-gate and account-security screens (omni-plan §5.3.4). Each variant's route file
// is a one-line re-export of the matching screen; ShellGate renders Login, Onboarding, Maintenance, PersonalLock,
// SharedDeviceLock and AccessDenied directly, so those routes exist only for deep links and the web.

export const authRoutes = {
  login: (): string => '/login',
  sso: (): string => '/login/sso',
  recovery: (): string => '/login/recovery',
  sharedDevice: (): string => '/login/shared-device',
  /** The page the Resgrid SSO broker returns to (`<scheme>://sso-return`, or `/sso-return` on the web). */
  ssoReturn: (): string => '/sso-return',
  onboarding: (): string => '/onboarding',
  maintenance: (): string => '/maintenance',
  lockscreen: (): string => '/lockscreen',
  /** Canonical for every variant (Responder and Unit used `/account-security`). */
  accountSecurity: (): string => '/settings/account-security',
  /** Responder only (`capabilities.push.approveSignIns`); the push tap passes the request id. */
  approveSignIn: (id?: string | null): string => (id ? `/approve-sign-in?id=${encodeURIComponent(id)}` : '/approve-sign-in'),
} as const;

export type AuthRouteName = keyof typeof authRoutes;
