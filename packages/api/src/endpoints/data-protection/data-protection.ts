import type {
  AdpApprovalStepUpInput,
  AdpFederatedStepUpInput,
  AdpPasskeyStepUpInput,
  AdpStepUpMethodsResult,
  DataProtectionCapabilitiesResult,
  PasskeyCeremonyResult,
  StepUpResult,
  VerifyStepUpInput,
} from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for data-protection (DataProtection). The contract test checks every entry against Swagger. */
export const dataProtectionEndpoints = defineEndpoints('data-protection', {
  completeStepUpApproval: { method: 'POST', path: '/DataProtection/CompleteApproval', body: 'json' },
  completeStepUpFederated: { method: 'POST', path: '/DataProtection/CompleteFederated', body: 'json' },
  getDataProtectionCapabilities: { method: 'GET', path: '/DataProtection/Capabilities' },
  getStepUpMethods: { method: 'GET', path: '/DataProtection/StepUpMethods' },
  getStepUpPasskeyOptions: { method: 'POST', path: '/DataProtection/PasskeyOptions' },
  requestProtectedGrant: { method: 'POST', path: '/DataProtection/RequestGrant' },
  verifyStepUp: { method: 'POST', path: '/DataProtection/VerifyStepUp', body: 'json' },
  verifyStepUpPasskey: { method: 'POST', path: '/DataProtection/VerifyPasskey', body: 'json' },
});

const E = dataProtectionEndpoints;

/** Uses an approved Responder request (`MfaApproval/Request`, purpose `adp`, from this session and department) once, and returns a `passkey_approval` grant. Answers 409 `approval_pending` until it is decided. `POST /DataProtection/CompleteApproval` — legacy: DIRU. */
export const completeStepUpApproval = (ctx: ApiContext, body: AdpApprovalStepUpInput, options?: RequestOptions): Promise<StepUpResult> => request<StepUpResult>(ctx, E.completeStepUpApproval, { body }, options);

/** Redeems a brokered provider step-up (`Sso/Begin`, purpose `adp_step_up`) once and returns a `federated` grant, where the department accepts its provider's MFA for protected data (passkey plan section 7.8). `POST /DataProtection/CompleteFederated` — legacy: DIRU. */
export const completeStepUpFederated = (ctx: ApiContext, body: AdpFederatedStepUpInput, options?: RequestOptions): Promise<StepUpResult> => request<StepUpResult>(ctx, E.completeStepUpFederated, { body }, options);

/** Value-free ADP capability report for the caller's department: durable state, catalog and policy versions, step-up window, egress summary, and lock state. Never returns protected values, ciphertext, or key material. `GET /DataProtection/Capabilities` — legacy: DIRU. */
export const getDataProtectionCapabilities = (ctx: ApiContext, options?: RequestOptions): Promise<DataProtectionCapabilitiesResult> =>
  request<DataProtectionCapabilitiesResult>(ctx, E.getDataProtectionCapabilities, {}, options);

/** How the caller can verify for this department's protected data now: the methods it has that the department accepts, and which to show first (passkey plan section 7.5 rule 5). Advisory; every verification rechecks. `GET /DataProtection/StepUpMethods` — legacy: DIRU. */
export const getStepUpMethods = (ctx: ApiContext, options?: RequestOptions): Promise<AdpStepUpMethodsResult> => request<AdpStepUpMethodsResult>(ctx, E.getStepUpMethods, {}, options);

/** Assertion options for a passkey bound to this app, for this department's protected data (passkey plan section 8.1). Needs a tracked session; the department and deployment must accept passkeys for protected data. `POST /DataProtection/PasskeyOptions` — legacy: DIRU. */
export const getStepUpPasskeyOptions = (ctx: ApiContext, options?: RequestOptions): Promise<PasskeyCeremonyResult> => request<PasskeyCeremonyResult>(ctx, E.getStepUpPasskeyOptions, {}, options);

/** Issues a grant without a second factor for a client the department has exempted from the step-up prompt (plan section 3.3). Refused with `step_up_required` for every other client, which is what the app treats as "show the code prompt". The exemption is per client application and is off for every app until a department's managing member turns it off deliberately. It removes the PROMPT, not the grant: the caller is still authenticated, the grant is still bound to this department and policy epoch, still expires, and still authorizes an audited read. `POST /DataProtection/RequestGrant` — legacy: DIRU. */
export const requestProtectedGrant = (ctx: ApiContext, options?: RequestOptions): Promise<StepUpResult> => request<StepUpResult>(ctx, E.requestProtectedGrant, {}, options);

/** `POST /DataProtection/VerifyStepUp` — legacy: DIRU. */
export const verifyStepUp = (ctx: ApiContext, body: VerifyStepUpInput, options?: RequestOptions): Promise<StepUpResult> => request<StepUpResult>(ctx, E.verifyStepUp, { body }, options);

/** Verifies the passkey assertion and returns a `passkey` grant (the same Resgrid.Web.Services.Models.v4.DataProtection.StepUpResult as a code). `POST /DataProtection/VerifyPasskey` — legacy: DIRU. */
export const verifyStepUpPasskey = (ctx: ApiContext, body: AdpPasskeyStepUpInput, options?: RequestOptions): Promise<StepUpResult> => request<StepUpResult>(ctx, E.verifyStepUpPasskey, { body }, options);
