// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** Response for the SSO configuration discovery endpoint consumed by mobile apps. */
export interface GetDepartmentSsoConfigResult {
  Data?: GetDepartmentSsoConfigResultData;
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

/** SSO configuration data returned to mobile clients. Only non-secret fields are included — credentials are never exposed. */
export interface GetDepartmentSsoConfigResultData {
  /** Whether SSO is enabled for this department. */
  SsoEnabled?: boolean;
  /** The SSO provider protocol ("saml2" or "oidc"). */
  ProviderType?: string | null;
  /** OIDC authority/issuer URL (OIDC only). */
  Authority?: string | null;
  /** OIDC client ID (OIDC only — public client, safe to expose). */
  ClientId?: string | null;
  /** SAML metadata URL (SAML only). */
  MetadataUrl?: string | null;
  /** SAML entity ID / service-provider identifier (SAML only). */
  EntityId?: string | null;
  /** Where an app opens a legacy (unbrokered) SAML sign-in, with `RelayState=<app>.<nonce>` added: this server's start page, which sends the browser to the department's IdP with an AuthnRequest. The response returns to the app through `connect/saml-mobile-callback`. SAML only, and only when the department's configuration can start one (its IdP SSO URL, entity ID, ACS URL and IdP certificate). */
  SamlLoginUrl?: string | null;
  /** Whether local username/password login is permitted in addition to SSO. */
  AllowLocalLogin?: boolean;
  /** Whether the department security policy requires SSO for all logins. */
  RequireSso?: boolean;
  /** Whether the department security policy requires MFA. */
  RequireMfa?: boolean;
  /** The redirect URI the calling app uses for the legacy (unbrokered) OIDC authorization-code flow: its own scheme, by the app named in `X-Resgrid-Client` (for example `resgridunit://auth/callback`). A caller that names no app gets Responder's `resgrid://auth/callback`. */
  OidcRedirectUri?: string | null;
  /** OIDC scopes the mobile app should request (space-separated). e.g. "openid email profile offline_access" */
  OidcScopes?: string | null;
  /** The department, for clients that must name it again (for example Dispatch's department selection). */
  DepartmentId?: number | null;
  /** Opaque, system-encrypted department token: send it as `department_token` (legacy `external-token`) or `DepartmentToken` (`Sso/Begin`) instead of a department code or username. */
  DepartmentToken?: string | null;
  /** True when this department can sign in through server-brokered SSO (`Sso/Begin`). */
  BrokeredSsoAvailable?: boolean;
}
