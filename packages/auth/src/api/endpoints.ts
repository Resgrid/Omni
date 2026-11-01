import { defineEndpoints, type EndpointDefinition } from '@resgrid/api';

// Core v4 auth endpoints this package calls that @resgrid/api does not wrap. Every entry is checked against Core's
// Swagger by this package's contract test (src/__tests__/contract.test.ts), like the api package's own registry.
//
// `anonymous` endpoints carry no bearer token: the sign-in transaction secret (or the refresh token, password or
// external token in a form body) is the only authority. The app/installation headers still go out on them.

/**
 * OpenIddict token endpoints. Read as `application/x-www-form-urlencoded` by OpenIddict whatever Swagger says, and
 * addressed with the exact lowercase path every shipped build uses (PathString matching is case-insensitive).
 */
export const connectEndpoints = defineEndpoints('auth.connect', {
  token: { method: 'POST', path: '/connect/token', body: 'form', anonymous: true },
  externalToken: { method: 'POST', path: '/connect/external-token', body: 'form', anonymous: true },
});

/** Finishing a sign-in on its login transaction (passkey plan sections 7.5 and 6.2). */
export const authenticationEndpoints = defineEndpoints('auth.authentication', {
  completeTotp: { method: 'POST', path: '/Authentication/CompleteTotp', body: 'json', anonymous: true },
  completeRecoveryCode: { method: 'POST', path: '/Authentication/CompleteRecoveryCode', body: 'json', anonymous: true },
  passkeyOptions: { method: 'POST', path: '/Authentication/PasskeyOptions', body: 'json', anonymous: true },
  completePasskey: { method: 'POST', path: '/Authentication/CompletePasskey', body: 'json', anonymous: true },
  completeApproval: { method: 'POST', path: '/Authentication/CompleteApproval', body: 'json', anonymous: true },
  completeFederated: { method: 'POST', path: '/Authentication/CompleteFederated', body: 'json', anonymous: true },
  totpSetupOptions: { method: 'POST', path: '/Authentication/TotpSetupOptions', body: 'json', anonymous: true },
  completeTotpSetup: { method: 'POST', path: '/Authentication/CompleteTotpSetup', body: 'json', anonymous: true },
});

/**
 * Approve with Responder (plan section 7.9). A sign-in asks with its transaction (anonymous); a signed-in step-up (ADP)
 * asks with its bearer token; Responder, as the approver, lists and decides with its own session.
 */
export const mfaApprovalEndpoints = defineEndpoints('auth.mfa-approval', {
  requestForLogin: { method: 'POST', path: '/MfaApproval/Request', body: 'json', anonymous: true },
  statusForLogin: { method: 'POST', path: '/MfaApproval/Status', body: 'json', anonymous: true },
  cancelForLogin: { method: 'POST', path: '/MfaApproval/Cancel', body: 'json', anonymous: true },
  request: { method: 'POST', path: '/MfaApproval/Request', body: 'json' },
  status: { method: 'POST', path: '/MfaApproval/Status', body: 'json' },
  cancel: { method: 'POST', path: '/MfaApproval/Cancel', body: 'json' },
  pending: { method: 'GET', path: '/MfaApproval/Pending' },
  options: { method: 'POST', path: '/MfaApproval/Options', body: 'json' },
  approve: { method: 'POST', path: '/MfaApproval/Approve', body: 'json' },
  deny: { method: 'POST', path: '/MfaApproval/Deny', body: 'json' },
  disableInstallations: { method: 'POST', path: '/MfaApproval/Installations/Disable', body: 'json' },
});

/** Brokered SSO (plan section 7.7.2): a sign-in begins anonymously; reauthentication and an ADP step-up begin with the session. */
export const ssoEndpoints = defineEndpoints('auth.sso', {
  beginLogin: { method: 'POST', path: '/Sso/Begin', body: 'json', anonymous: true },
  redeemLogin: { method: 'POST', path: '/Sso/Redeem', body: 'json', anonymous: true },
  begin: { method: 'POST', path: '/Sso/Begin', body: 'json' },
  redeem: { method: 'POST', path: '/Sso/Redeem', body: 'json' },
});

/** The account methods view, fresh verification before a change, and "I lost my authenticator" (anonymous: the recovery secret). */
export const accountSecurityEndpoints = defineEndpoints('auth.account-security', {
  methods: { method: 'GET', path: '/AccountSecurity/Methods' },
  reportActivity: { method: 'POST', path: '/AccountSecurity/ReportActivity', body: 'json' },
  reauthenticate: { method: 'POST', path: '/AccountSecurity/Reauthenticate', body: 'json' },
  beginFactorRecovery: { method: 'POST', path: '/AccountSecurity/BeginFactorRecovery', body: 'json', anonymous: true },
  factorRecoveryStatus: { method: 'POST', path: '/AccountSecurity/FactorRecoveryStatus', body: 'json', anonymous: true },
  prepareReplacement: { method: 'POST', path: '/AccountSecurity/PrepareReplacement', body: 'json', anonymous: true },
  completeFactorRecovery: { method: 'POST', path: '/AccountSecurity/CompleteFactorRecovery', body: 'json', anonymous: true },
  cancelFactorRecovery: { method: 'POST', path: '/AccountSecurity/CancelFactorRecovery', body: 'json', anonymous: true },
});

/** Signed-in step-up for sensitive account changes. */
export const mfaEndpoints = defineEndpoints('auth.mfa', {
  stepUpOptions: { method: 'GET', path: '/Mfa/StepUpOptions', query: ['operation'] },
  verifyStepUp: { method: 'POST', path: '/Mfa/VerifyStepUp', body: 'json' },
});

/** Passkeys for this app (plan section 6.1). */
export const passkeysEndpoints = defineEndpoints('auth.passkeys', {
  list: { method: 'GET', path: '/Passkeys/List' },
  registrationOptions: { method: 'POST', path: '/Passkeys/RegistrationOptions' },
  completeRegistration: { method: 'POST', path: '/Passkeys/CompleteRegistration', body: 'json' },
  rename: { method: 'POST', path: '/Passkeys/Rename', body: 'json' },
  revoke: { method: 'POST', path: '/Passkeys/Revoke', body: 'json' },
  revokeAllForClient: { method: 'POST', path: '/Passkeys/RevokeAllForClient', body: 'json' },
  setApproval: { method: 'POST', path: '/Passkeys/SetApproval', body: 'json' },
});

/** Shared-device and personal session management (passkey plan section 10.5): bearer, and the only paths a locked session may use. */
export const sessionsEndpoints = defineEndpoints('auth.sessions', {
  list: { method: 'GET', path: '/sessions' },
  current: { method: 'GET', path: '/sessions/current' },
  lock: { method: 'POST', path: '/sessions/lock' },
  endShift: { method: 'POST', path: '/sessions/end-shift', body: 'json' },
  unlockOptions: { method: 'POST', path: '/sessions/unlock-options', body: 'json' },
  requestUnlockApproval: { method: 'POST', path: '/sessions/unlock-approval', body: 'json' },
  unlockApprovalStatus: { method: 'GET', path: '/sessions/unlock-approval/{approvalRequestId}' },
  cancelUnlockApproval: { method: 'DELETE', path: '/sessions/unlock-approval/{approvalRequestId}' },
  beginUnlockSso: { method: 'POST', path: '/sessions/unlock-sso', body: 'json' },
  completeUnlock: { method: 'POST', path: '/sessions/complete-unlock', body: 'json' },
  revoke: { method: 'DELETE', path: '/sessions/{sessionId}' },
  revokeOthers: { method: 'POST', path: '/sessions/revoke-others' },
  revokeAll: { method: 'POST', path: '/sessions/revoke-all' },
});

/** Every auth endpoint definition, grouped by domain. */
export const authEndpointDomains = {
  connect: connectEndpoints,
  authentication: authenticationEndpoints,
  'mfa-approval': mfaApprovalEndpoints,
  sso: ssoEndpoints,
  'account-security': accountSecurityEndpoints,
  mfa: mfaEndpoints,
  passkeys: passkeysEndpoints,
  sessions: sessionsEndpoints,
} as const;

/** Flat list for the contract test (and any tooling that lists what the app calls). */
export const authEndpointRegistry: readonly EndpointDefinition[] = Object.freeze(Object.values(authEndpointDomains).flatMap((domain) => Object.values(domain)));

/** Endpoints OpenIddict serves: form-encoded bodies regardless of what Swagger documents for the controller action. */
export const OPENIDDICT_ENDPOINT_PATHS: readonly string[] = [connectEndpoints.token.path, connectEndpoints.externalToken.path];
