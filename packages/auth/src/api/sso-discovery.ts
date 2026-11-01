import { type ApiContext, getSsoConfig, getSsoConfigForUser } from '@resgrid/api';

import { httpFailureOf } from '../errors/http-shape';
import { authLogger, describeError } from '../runtime/logger';

/** SSO discovery is on the login screen's critical path: it never waits longer than this (the legacy apps had no timeout). */
export const SSO_DISCOVERY_TIMEOUT_MS = 10_000;

export interface DepartmentSsoConfig {
  ssoEnabled: boolean;
  providerType: 'oidc' | 'saml2' | null;
  authority: string | null;
  clientId: string | null;
  metadataUrl: string | null;
  entityId: string | null;
  /** Where a SAML sign-in without the broker starts (discovery's SamlLoginUrl): this server's page, sent on to the IdP. */
  samlLoginUrl: string | null;
  allowLocalLogin: boolean;
  requireSso: boolean;
  requireMfa: boolean;
  oidcRedirectUri: string;
  oidcScopes: string;
  departmentCode: string | null;
  departmentName: string | null;
  /** The department's id, when the lookup resolved one (never for an unknown user). */
  departmentId: number | null;
  /** A system-encrypted department reference for `Sso/Begin` and the legacy exchange (passkey workbook section 7.3). */
  departmentToken: string | null;
  /** Whether sign-in can go through the Resgrid broker for this department now (plan section 7.7.2). */
  brokeredSsoAvailable: boolean;
}

type WireConfig = Record<string, unknown>;

/**
 * The v4 API is PascalCase (`SsoEnabled`, `Authority`, ...); reading camelCase names left every field undefined, so SSO
 * looked disabled. Both spellings are read so an older server still works (null-safe: any field may be missing).
 */
const read = (data: WireConfig, name: string): unknown => data[name.charAt(0).toUpperCase() + name.slice(1)] ?? data[name];

const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

export const normalizeSsoConfig = (data: unknown): DepartmentSsoConfig | null => {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const wire = data as WireConfig;
  const providerType = text(read(wire, 'providerType'))?.toLowerCase();
  const departmentId = read(wire, 'departmentId');
  return {
    ssoEnabled: read(wire, 'ssoEnabled') === true,
    providerType: providerType === 'oidc' || providerType === 'saml2' ? providerType : null,
    authority: text(read(wire, 'authority')),
    clientId: text(read(wire, 'clientId')),
    metadataUrl: text(read(wire, 'metadataUrl')),
    entityId: text(read(wire, 'entityId')),
    samlLoginUrl: text(read(wire, 'samlLoginUrl')),
    allowLocalLogin: read(wire, 'allowLocalLogin') !== false,
    requireSso: read(wire, 'requireSso') === true,
    requireMfa: read(wire, 'requireMfa') === true,
    oidcRedirectUri: text(read(wire, 'oidcRedirectUri')) ?? '',
    oidcScopes: text(read(wire, 'oidcScopes')) ?? '',
    departmentCode: text(read(wire, 'departmentCode')),
    departmentName: text(read(wire, 'departmentName')),
    departmentId: typeof departmentId === 'number' && departmentId > 0 ? departmentId : null,
    departmentToken: text(read(wire, 'departmentToken')),
    brokeredSsoAvailable: read(wire, 'brokeredSsoAvailable') === true,
  };
};

/** Department-code (or department-token) discovery (Responder). Throws on a network/server failure; never logs the code. */
export async function fetchDepartmentSsoConfig(ctx: ApiContext, lookup: { departmentCode?: string; departmentToken?: string }): Promise<DepartmentSsoConfig | null> {
  try {
    const result = await getSsoConfig(ctx, lookup, { timeoutMs: SSO_DISCOVERY_TIMEOUT_MS });
    return normalizeSsoConfig((result as { Data?: unknown } | null)?.Data);
  } catch (error) {
    authLogger.warn({ message: 'SSO discovery by department failed', context: describeError(error) });
    throw error;
  }
}

export interface SsoConfigForUserResult {
  config: DepartmentSsoConfig | null;
  userExists: boolean;
  /** The lookup itself failed (offline, timeout, 5xx): the screen falls back to password sign-in. */
  failed: boolean;
}

/**
 * Username-first discovery (Unit): resolves the user's active/default department, or the given one. The server answers
 * an unknown account like a non-SSO one (no account enumeration), so an empty answer reads as "not found". The username
 * is never logged.
 */
export async function fetchSsoConfigForUser(ctx: ApiContext, username: string, departmentId?: number): Promise<SsoConfigForUserResult> {
  try {
    const result = await getSsoConfigForUser(ctx, { username, ...(departmentId !== undefined && departmentId > 0 ? { departmentId } : {}) }, { timeoutMs: SSO_DISCOVERY_TIMEOUT_MS });
    const config = normalizeSsoConfig((result as { Data?: unknown } | null)?.Data);
    return config ? { config, userExists: true, failed: false } : { config: null, userExists: false, failed: false };
  } catch (error) {
    if (httpFailureOf(error)?.status === 404) {
      // Not a member of the department that was asked for.
      return { config: null, userExists: false, failed: false };
    }
    authLogger.warn({ message: 'SSO discovery for user failed', context: describeError(error) });
    return { config: null, userExists: false, failed: true };
  }
}
