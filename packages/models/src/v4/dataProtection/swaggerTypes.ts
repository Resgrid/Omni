// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** An approved `MfaApproval/Request` (purpose `adp`) to use once for a grant. */
export interface AdpApprovalStepUpInput {
  ApprovalRequestId?: string | null;
}

/** A brokered provider step-up (`Sso/Begin`, purpose `adp_step_up`) to redeem once for a grant. */
export interface AdpFederatedStepUpInput {
  SsoTransactionId?: string | null;
  SsoCode?: string | null;
  CodeVerifier?: string | null;
}

/** A passkey assertion for `DataProtection/VerifyPasskey` (passkey plan section 8.1). */
export interface AdpPasskeyStepUpInput {
  /** The request id from `DataProtection/PasskeyOptions`. */
  RequestId?: string | null;
  /** The platform's assertion (PublicKeyCredential.toJSON()), as an object or a JSON string. */
  Credential?: unknown;
}

/** How the caller can verify for this department's protected data now (passkey plan section 7.5 rule 5): every usable method is an equal choice, and !:Preferred is the one to show first. Advisory: every command rechecks. */
export interface AdpStepUpMethodsResult {
  Data?: AdpStepUpMethodsResultData;
  /** Number of records returned */
  PageSize?: number;
  /** The requested page size */
  Page?: number;
  /** Timestamp in UTC of the operation */
  Timestamp?: string;
  /** API Version that produced the response */
  Version?: string | null;
  /** Name of the node the processed the operation */
  Node?: string | null;
  /** Name of the environment that the api is running under */
  Environment?: string | null;
  /** Trace or Request Id for the operation */
  RequestId?: string | null;
  /** Status of the Response */
  Status?: string | null;
  /** If pagination values were supplied what is the previous page url (if empty this is the first page) */
  PreviousPageUrl?: string | null;
  /** If pagination values were supplied what is the next page url (if empty there is no more records) */
  NextPageUrl?: string | null;
}

/** Core `v4.DataProtection.AdpStepUpMethodsResultData` (generated from Swagger v4). */
export interface AdpStepUpMethodsResultData {
  /** Methods the caller has and the department accepts for protected data: totp, passkey, passkey_approval, federated. */
  Methods?: string[] | null;
  Preferred?: string | null;
  EnrolledMethods?: string[] | null;
  AllowedMethods?: string[] | null;
}

/** ADP capability report for the calling department (ADP plan sections 7.1 and 12). Contains NO protected values. Flag/addon eligibility here is ADVISORY — every enrollment command re-checks server-side; the durable state and the admission gate are never collapsed into one boolean. */
export interface DataProtectionCapabilitiesData {
  /** DepartmentDataProtectionState numeric value. */
  State?: number;
  /** DepartmentDataProtectionState name for display/debugging. */
  StateName?: string | null;
  /** True when protection is enforced for reads (Enabled/Rotating/OffboardingScheduled). */
  IsProtectionEnabled?: boolean;
  /** Advisory: global admission gate currently open AND the department could start enrollment. */
  IsEnrollmentAvailable?: boolean;
  /** Advisory: caller is the managing member and state permits an enroll command. */
  CanEnable?: boolean;
  /** Advisory: caller is the managing member and state permits cancel/offboarding control. */
  CanDisable?: boolean;
  /** Re-enabling after a completed opt-out always requires a fresh purchase and open gate. */
  ReenableRequiresFeatureFlag?: boolean;
  /** Catalog version this department's migration has verified (0 = none). */
  CatalogVersion?: number;
  /** Current platform catalog version. */
  CurrentCatalogVersion?: number;
  /** Department policy epoch; clients discard grants/state from older epochs. */
  PolicyEpoch?: number;
  /** Effective Protected Data Grant lifetime in minutes. */
  StepUpWindowMinutes?: number;
  /** Scheduled offboarding instant (ISO 8601), when state is OffboardingScheduled. */
  OffboardingEffectiveOn?: string | null;
  /** Per-channel egress modes (ProtectedDataEgressMode numeric values). */
  PushEgressMode?: number;
  EmailEgressMode?: number;
  SmsEgressMode?: number;
  VoiceEgressMode?: number;
  /** True while a department operation lock is active (mutations refused with 423). */
  IsDepartmentLocked?: boolean;
  /** Value-free lock banner reason, when locked. */
  LockReason?: string | null;
  /** Projected lock end (ISO 8601), when locked and known. */
  LockProjectedEndUtc?: string | null;
  /** The acknowledgement version QueueEnrollment requires (AdpEnrollmentAcknowledgements.Version). */
  AcknowledgementVersion?: string | null;
  /** Every section 12 disclosure key QueueEnrollment requires in acknowledgedItems. */
  AcknowledgementItems?: string[] | null;
}

/** Core `v4.DataProtection.DataProtectionCapabilitiesResult` (generated from Swagger v4). */
export interface DataProtectionCapabilitiesResult {
  Data?: DataProtectionCapabilitiesData;
  /** Number of records returned */
  PageSize?: number;
  /** The requested page size */
  Page?: number;
  /** Timestamp in UTC of the operation */
  Timestamp?: string;
  /** API Version that produced the response */
  Version?: string | null;
  /** Name of the node the processed the operation */
  Node?: string | null;
  /** Name of the environment that the api is running under */
  Environment?: string | null;
  /** Trace or Request Id for the operation */
  RequestId?: string | null;
  /** Status of the Response */
  Status?: string | null;
  /** If pagination values were supplied what is the previous page url (if empty this is the first page) */
  PreviousPageUrl?: string | null;
  /** If pagination values were supplied what is the next page url (if empty there is no more records) */
  NextPageUrl?: string | null;
}

/** Result of a successful step-up verification. The window is ABSOLUTE (never sliding): clients conceal protected values at StepUpExpiresOnUtc and prompt again on the next reveal/edit. GrantId/GrantToken carry a signed Protected Data Grant the client presents alongside its access token on protected operations; clients hold the token in MEMORY ONLY (never persisted) and discard it at expiry. A deployment without signing key material answers 503 `grants_not_configured` instead: a verification without a grant is not access (passkey plan section 8.1). */
export interface StepUpResult {
  /** Unique grant id (jti) for display/audit correlation. */
  GrantId?: string | null;
  /** Signed Protected Data Grant token. MEMORY ONLY. */
  GrantToken?: string | null;
  /** The grant's absolute UTC expiry (ISO 8601): the verification time plus the department's window, never past the session's end (passkey plan section 9.2). Conceal at this time; never add the window to the client's own clock. */
  StepUpExpiresOnUtc?: string | null;
  /** The department's effective step-up window in minutes. */
  StepUpWindowMinutes?: number;
  /** Number of records returned */
  PageSize?: number;
  /** The requested page size */
  Page?: number;
  /** Timestamp in UTC of the operation */
  Timestamp?: string;
  /** API Version that produced the response */
  Version?: string | null;
  /** Name of the node the processed the operation */
  Node?: string | null;
  /** Name of the environment that the api is running under */
  Environment?: string | null;
  /** Trace or Request Id for the operation */
  RequestId?: string | null;
  /** Status of the Response */
  Status?: string | null;
  /** If pagination values were supplied what is the previous page url (if empty this is the first page) */
  PreviousPageUrl?: string | null;
  /** If pagination values were supplied what is the next page url (if empty there is no more records) */
  NextPageUrl?: string | null;
}

/** Step-up verification payload: the user's current authenticator (TOTP) code. Never logged. */
export interface VerifyStepUpInput {
  Code?: string | null;
}
