import type { ApiContext } from '@resgrid/api';

import type { ApprovalRequestData, ApprovalStatusData, CompletionData, FactorRecoveryStatusData, PasskeyCeremonyData, RecoveryCompleteData, SsoBeginData, SsoRedeemData, TotpSetupData } from '../mfa/types';
import { authData } from './auth-request';
import { accountSecurityEndpoints, authenticationEndpoints, mfaApprovalEndpoints, ssoEndpoints } from './endpoints';

// ---------------------------------------------------------------------------------------------------------------------
// The sign-in transaction calls (passkey plan sections 7.5 and 7.7.2): no bearer token; the transaction secret is the
// only authority, and the app header must match the app that started it. Bodies are PascalCase JSON (the server binds
// names case-insensitively but never snake_case). Identical in R/U/I/D.
// ---------------------------------------------------------------------------------------------------------------------

// ---- Second factor for a sign-in ---------------------------------------------------------------------------------------

export const completeTotp = (ctx: ApiContext, transaction: string, code: string): Promise<CompletionData> => authData(ctx, authenticationEndpoints.completeTotp, { body: { Transaction: transaction, Code: code } });

export const completeRecoveryCode = (ctx: ApiContext, transaction: string, code: string): Promise<CompletionData> =>
  authData(ctx, authenticationEndpoints.completeRecoveryCode, { body: { Transaction: transaction, Code: code } });

export const loginPasskeyOptions = (ctx: ApiContext, transaction: string): Promise<PasskeyCeremonyData> => authData(ctx, authenticationEndpoints.passkeyOptions, { body: { Transaction: transaction } });

export const completePasskey = (ctx: ApiContext, transaction: string, requestId: string, credential: Record<string, unknown>): Promise<CompletionData> =>
  authData(ctx, authenticationEndpoints.completePasskey, { body: { Transaction: transaction, RequestId: requestId, Credential: credential } });

export const completeApproval = (ctx: ApiContext, transaction: string, approvalRequestId: string): Promise<CompletionData> =>
  authData(ctx, authenticationEndpoints.completeApproval, { body: { Transaction: transaction, ApprovalRequestId: approvalRequestId } });

export const completeFederated = (ctx: ApiContext, transaction: string, ssoTransactionId: string, ssoCode: string, codeVerifier: string): Promise<CompletionData> =>
  authData(ctx, authenticationEndpoints.completeFederated, { body: { Transaction: transaction, SsoTransactionId: ssoTransactionId, SsoCode: ssoCode, CodeVerifier: codeVerifier } });

// ---- Setting up an authenticator the department requires (plan section 6.2) ---------------------------------------------

export const totpSetupOptions = (ctx: ApiContext, transaction: string): Promise<TotpSetupData> => authData(ctx, authenticationEndpoints.totpSetupOptions, { body: { Transaction: transaction } });

export const completeTotpSetup = (ctx: ApiContext, transaction: string, code: string): Promise<CompletionData> =>
  authData(ctx, authenticationEndpoints.completeTotpSetup, { body: { Transaction: transaction, Code: code } });

// ---- Approve with Responder, for a sign-in (plan section 7.9) -------------------------------------------------------------

export const requestLoginApproval = (ctx: ApiContext, transaction: string): Promise<ApprovalRequestData> => authData(ctx, mfaApprovalEndpoints.requestForLogin, { body: { Purpose: 'login', Transaction: transaction } });

export const loginApprovalStatus = (ctx: ApiContext, transaction: string, approvalRequestId: string): Promise<ApprovalStatusData> =>
  authData(ctx, mfaApprovalEndpoints.statusForLogin, { body: { Transaction: transaction, ApprovalRequestId: approvalRequestId } });

export const cancelLoginApproval = (ctx: ApiContext, transaction: string, approvalRequestId: string): Promise<ApprovalStatusData> =>
  authData(ctx, mfaApprovalEndpoints.cancelForLogin, { body: { Transaction: transaction, ApprovalRequestId: approvalRequestId } });

// ---- Brokered SSO (plan section 7.7.2) -----------------------------------------------------------------------------------

export interface SsoBeginInput {
  Purpose: 'login' | 'step_up';
  ReturnTarget: string;
  State: string;
  CodeChallenge: string;
  Platform: string;
  DepartmentToken?: string;
  DepartmentCode?: string;
  Username?: string;
  /** For a provider step-up that finishes a password sign-in. */
  Transaction?: string;
}

export const ssoBegin = (ctx: ApiContext, input: SsoBeginInput): Promise<SsoBeginData> => authData(ctx, ssoEndpoints.beginLogin, { body: { ...input, CodeChallengeMethod: 'S256' } });

export const ssoRedeem = (ctx: ApiContext, ssoTransactionId: string, ssoCode: string, codeVerifier: string): Promise<SsoRedeemData> =>
  authData(ctx, ssoEndpoints.redeemLogin, { body: { SsoTransactionId: ssoTransactionId, SsoCode: ssoCode, CodeVerifier: codeVerifier } });

// ---- "I lost my authenticator" (plan sections 5.4 and 6.3) --------------------------------------------------------------

export const beginFactorRecovery = (ctx: ApiContext, transaction: string, recoveryCode: string): Promise<FactorRecoveryStatusData> =>
  authData(ctx, accountSecurityEndpoints.beginFactorRecovery, { body: { Transaction: transaction, Code: recoveryCode } });

export const factorRecoveryStatus = (ctx: ApiContext, recovery: string): Promise<FactorRecoveryStatusData> => authData(ctx, accountSecurityEndpoints.factorRecoveryStatus, { body: { Transaction: recovery } });

export const prepareRecoveryReplacement = (ctx: ApiContext, recovery: string): Promise<TotpSetupData> => authData(ctx, accountSecurityEndpoints.prepareReplacement, { body: { Transaction: recovery } });

export const completeFactorRecovery = (ctx: ApiContext, recovery: string, code: string, removePasskeyIds: string[]): Promise<RecoveryCompleteData> =>
  authData(ctx, accountSecurityEndpoints.completeFactorRecovery, { body: { Transaction: recovery, Code: code, RemovePasskeyIds: removePasskeyIds } });

export const cancelFactorRecovery = (ctx: ApiContext, recovery: string): Promise<FactorRecoveryStatusData> => authData(ctx, accountSecurityEndpoints.cancelFactorRecovery, { body: { Transaction: recovery } });
