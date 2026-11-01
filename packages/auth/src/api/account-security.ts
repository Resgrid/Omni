import type { ApiContext } from '@resgrid/api';

import type { ApprovalRequestData, ApprovalStatusData, PasskeyCeremonyData, PasskeyData, SsoBeginData, SsoRedeemData } from '../mfa/types';
import { authData, authRequest } from './auth-request';
import { accountSecurityEndpoints, mfaApprovalEndpoints, mfaEndpoints, passkeysEndpoints, ssoEndpoints } from './endpoints';

// ---------------------------------------------------------------------------------------------------------------------
// The signed-in side of sign-in methods (passkey plan sections 6.5, 7.6 and 7.9): the account methods view, passkeys for
// this app, Responder approval as the approver, signed-in step-ups, and the fresh verification the server asks for
// before any change. Bearer; bodies PascalCase; results carry their payload in `Data` (Responder's api/mfa module).
// ---------------------------------------------------------------------------------------------------------------------

/** The browser round-trip values for a signed-in brokered SSO (reauthentication or a step-up). */
export interface SsoRoundTripInput {
  returnTarget: string;
  state: string;
  codeChallenge: string;
  platform: string;
}

// ---- Approving another app's sign-in (Responder is the approver; `capabilities.push.approveSignIns`) -------------------

export interface PendingApprovalData {
  ApprovalRequestId: string;
  RequestingApp: string | null;
  InstallationLabel: string | null;
  Shared: boolean;
  Department: string | null;
  Purpose: 'login' | 'step_up' | 'adp' | 'unlock' | 'department_entry';
  Operation: string | null;
  OriginRegion: string | null;
  CreatedAt: string | null;
  ExpiresAt: string | null;
  AttemptsRemaining: number;
}

export const getPendingApproval = (ctx: ApiContext): Promise<PendingApprovalData | null> => authData(ctx, mfaApprovalEndpoints.pending);

export const getApprovalOptions = (ctx: ApiContext, approvalRequestId: string): Promise<PasskeyCeremonyData> => authData(ctx, mfaApprovalEndpoints.options, { body: { ApprovalRequestId: approvalRequestId } });

export const approveRequest = (ctx: ApiContext, approvalRequestId: string, matchNumber: string, requestId: string, credential: Record<string, unknown>): Promise<{ State: string }> =>
  authData(ctx, mfaApprovalEndpoints.approve, { body: { ApprovalRequestId: approvalRequestId, MatchNumber: matchNumber, RequestId: requestId, Credential: credential } });

export const denyRequest = (ctx: ApiContext, approvalRequestId: string, reason: 'declined' | 'not_me'): Promise<{ State: string }> =>
  authData(ctx, mfaApprovalEndpoints.deny, { body: { ApprovalRequestId: approvalRequestId, Reason: reason } });

export const stopApprovalInstallations = (ctx: ApiContext, installationId: string | null): Promise<{ InstallationsStopped: number; PasskeysStopped: number }> =>
  authData(ctx, mfaApprovalEndpoints.disableInstallations, { body: installationId ? { InstallationId: installationId, All: false } : { All: true } });

// ---- Asking Responder to approve a signed-in step-up (ADP, `Purpose: 'adp'`) ---------------------------------------------

export const requestStepUpApproval = (ctx: ApiContext): Promise<ApprovalRequestData> => authData(ctx, mfaApprovalEndpoints.request, { body: { Purpose: 'adp' } });

export const getStepUpApprovalStatus = (ctx: ApiContext, approvalRequestId: string): Promise<ApprovalStatusData> => authData(ctx, mfaApprovalEndpoints.status, { body: { ApprovalRequestId: approvalRequestId } });

export const cancelStepUpApproval = async (ctx: ApiContext, approvalRequestId: string): Promise<void> => {
  await authRequest(ctx, mfaApprovalEndpoints.cancel, { body: { ApprovalRequestId: approvalRequestId } });
};

/** The department's provider for protected data (plan section 7.8). */
export const beginStepUpSso = (ctx: ApiContext, input: SsoRoundTripInput): Promise<SsoBeginData> =>
  authData(ctx, ssoEndpoints.begin, {
    body: { Purpose: 'adp_step_up', ReturnTarget: input.returnTarget, State: input.state, CodeChallenge: input.codeChallenge, CodeChallengeMethod: 'S256', Platform: input.platform },
  });

// ---- Account methods view (plan section 6.5) --------------------------------------------------------------------------

export interface TotpMethodData {
  Enrolled: boolean;
  EnrolledOn: string | null;
  LastUsedOn: string | null;
  RecoveryCodesRemaining: number;
  RecoveryCodeWarning: boolean;
  SetUpOnSharedInstallation: boolean;
  CanTurnOff: boolean;
}

export interface PasskeyGroupData {
  Client: string;
  RegistrationAvailable: boolean;
  Passkeys: PasskeyData[];
}

export interface ApprovalInstallationData {
  InstallationId: string;
  Label: string | null;
  Platform: string | null;
  IsCurrent: boolean;
  ApprovalsOn: boolean;
  StoppedOn: string | null;
  LastDecisionOn: string | null;
  LastDecision: 'approved' | 'denied' | null;
}

export interface LinkedIdentityData {
  DepartmentId: number;
  DepartmentName: string | null;
  ProviderType: string | null;
  LinkedOn: string | null;
  AcceptsProviderStepUp: boolean;
  LastProviderStepUpOn: string | null;
}

export interface MfaActivityData {
  ActivityId: string;
  OccurredOn: string;
  Method: string;
  Purpose: string;
  Successful: boolean;
  Client: string | null;
  Installation: string | null;
  SharedInstallation: boolean;
  IsCurrentSession: boolean;
  ReportedOn: string | null;
}

export interface AccountMethodsData {
  CurrentClient: string | null;
  Totp: TotpMethodData;
  PasskeyGroups: PasskeyGroupData[];
  ApprovalInstallations: ApprovalInstallationData[];
  LinkedIdentities: LinkedIdentityData[];
  RecentActivity: MfaActivityData[];
}

export const getAccountMethods = (ctx: ApiContext): Promise<AccountMethodsData> => authData(ctx, accountSecurityEndpoints.methods);

/** "This wasn't me": ends the session a verification served and sends a notice. */
export const reportActivity = (ctx: ApiContext, activityId: string): Promise<{ SessionEnded: boolean; NextSteps: string[] }> =>
  authData(ctx, accountSecurityEndpoints.reportActivity, { body: { ActivityId: activityId } });

// ---- Fresh proof before a change (plan sections 6.2 and 7.6 row 14) ----------------------------------------------------

export const reauthenticateWithPassword = (ctx: ApiContext, password: string): Promise<{ VerifiedAt: string }> => authData(ctx, accountSecurityEndpoints.reauthenticate, { body: { Password: password } });

/** For a member whose department signs in through its identity provider: reauthenticate there instead of with a password. */
export const beginSsoReauthentication = (ctx: ApiContext, input: SsoRoundTripInput): Promise<SsoBeginData> =>
  authData(ctx, ssoEndpoints.begin, {
    body: { Purpose: 'reauth', ReturnTarget: input.returnTarget, State: input.state, CodeChallenge: input.codeChallenge, CodeChallengeMethod: 'S256', Platform: input.platform },
  });

export const redeemSsoReauthentication = (ctx: ApiContext, ssoTransactionId: string, ssoCode: string, codeVerifier: string): Promise<SsoRedeemData> =>
  authData(ctx, ssoEndpoints.redeem, { body: { SsoTransactionId: ssoTransactionId, SsoCode: ssoCode, CodeVerifier: codeVerifier } });

export interface StepUpOptionsData {
  Methods: string[];
  Preferred: string | null;
  EnrollmentRequired: boolean;
  WindowMinutes: number;
  Passkey: PasskeyCeremonyData | null;
}

export const getStepUpOptions = (ctx: ApiContext, operation: string): Promise<StepUpOptionsData> => authData(ctx, mfaEndpoints.stepUpOptions, { params: { operation } });

export interface AccountStepUpInput {
  Operation: string;
  Method: 'totp' | 'passkey';
  Code?: string;
  RequestId?: string;
  Credential?: Record<string, unknown>;
}

export const verifyAccountStepUp = (ctx: ApiContext, input: AccountStepUpInput): Promise<{ VerifiedAt: string; ExpiresAt: string }> => authData(ctx, mfaEndpoints.verifyStepUp, { body: input });

// ---- Passkeys for this app (plan section 6.1) --------------------------------------------------------------------------

export const listPasskeys = (ctx: ApiContext): Promise<PasskeyData[]> => authData(ctx, passkeysEndpoints.list);

export const getPasskeyRegistrationOptions = (ctx: ApiContext): Promise<PasskeyCeremonyData> => authData(ctx, passkeysEndpoints.registrationOptions);

export const completePasskeyRegistration = (ctx: ApiContext, requestId: string, credential: Record<string, unknown>, displayName: string): Promise<PasskeyData> =>
  authData(ctx, passkeysEndpoints.completeRegistration, { body: { RequestId: requestId, Credential: credential, DisplayName: displayName } });

export interface PasskeyChangeData {
  Revoked: number;
  SessionsEnded: number;
  CurrentSessionEnded: boolean;
}

export const renamePasskey = (ctx: ApiContext, passkeyId: string, displayName: string): Promise<PasskeyChangeData> => authData(ctx, passkeysEndpoints.rename, { body: { PasskeyId: passkeyId, DisplayName: displayName } });

export const revokePasskey = (ctx: ApiContext, passkeyId: string): Promise<PasskeyChangeData> => authData(ctx, passkeysEndpoints.revoke, { body: { PasskeyId: passkeyId } });

export const revokeAllPasskeysForClient = (ctx: ApiContext, client: string): Promise<PasskeyChangeData> => authData(ctx, passkeysEndpoints.revokeAllForClient, { body: { Client: client } });

/** Responder passkeys only: whether this passkey may approve other apps' sign-ins. */
export const setPasskeyApproval = (ctx: ApiContext, passkeyId: string, enabled: boolean): Promise<PasskeyChangeData> => authData(ctx, passkeysEndpoints.setApproval, { body: { PasskeyId: passkeyId, Enabled: enabled } });
