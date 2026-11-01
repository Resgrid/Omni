import { CONTRACT_KEYS, readLegacyString, writeLegacyString } from '@resgrid/offline';

import { authLogger } from '../runtime/logger';
import { isDevelopmentBuild } from '../runtime/platform';
import { mainKv, onAuthStorageBound } from '../runtime/storage';

// ---------------------------------------------------------------------------------------------------------------------
// The Resgrid server this installation talks to (Dispatch `lib/server-url.ts`). Stored under the frozen `baseUrl` contract
// key as the full API URL (`https://api.resgrid.com/api/v4`), JSON-encoded like every legacy build wrote it.
//
// https only; plain http only to localhost in a development build (S-3: Responder, IC and BigBoard accepted http:// to any
// host in production, sending the password grant and bearer tokens in cleartext). Switching servers is
// `switchServer()` (sign out first, then switch).
// ---------------------------------------------------------------------------------------------------------------------

export const CUSTOM_SERVER_VALUE = '__custom__';

export interface ResgridServerLocation {
  Name: string;
  DisplayName: string;
  LocationInfo: string;
  IsDefault: boolean;
  ApiUrl: string;
  AllowsFreeAccounts: boolean;
}

/** The hosted sites, always offered so a member on an unreachable or self-hosted URL can switch back. */
export const RESGRID_HOSTED_LOCATIONS: readonly ResgridServerLocation[] = [
  { Name: 'US-West', DisplayName: 'Resgrid North America (Global)', LocationInfo: '', IsDefault: true, ApiUrl: 'https://api.resgrid.com', AllowsFreeAccounts: true },
  { Name: 'EU-Central', DisplayName: 'Resgrid Europe', LocationInfo: '', IsDefault: false, ApiUrl: 'https://api-eu-central.resgrid.com', AllowsFreeAccounts: false },
];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export type ServerUrlProblem = 'empty' | 'invalid' | 'insecure';

export type ServerUrlValidation = { ok: true; baseUrl: string } | { ok: false; reason: ServerUrlProblem };

const stripTrailingSlashes = (url: string): string => url.trim().replace(/\/+$/, '');

/** The bare server base: no `/api/vN` suffix, no trailing slash. */
export const toBaseUrl = (url: string): string => stripTrailingSlashes(url).replace(/\/api\/v\d+$/i, '');

/** The full API URL clients call (base + `/api/v4`), always with exactly one suffix. */
export const buildApiUrl = (url: string, apiVersion = 'v4'): string => `${toBaseUrl(url)}/api/${apiVersion}`;

/** Whether two URLs (with or without the `/api/vN` suffix, any case) point at the same server. */
export const isSameServerUrl = (a: string, b: string): boolean => toBaseUrl(a).toLowerCase() === toBaseUrl(b).toLowerCase();

/** https://… always; http://localhost (127.0.0.1, [::1]) only when `allowLocalHttp` (development builds). */
export const validateServerUrl = (input: string | null | undefined, allowLocalHttp: boolean = isDevelopmentBuild()): ServerUrlValidation => {
  const trimmed = (input ?? '').trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    return { ok: false, reason: 'invalid' };
  }
  if (parsed.protocol === 'https:') {
    return { ok: true, baseUrl: toBaseUrl(trimmed) };
  }
  if (parsed.protocol === 'http:') {
    return allowLocalHttp && LOCAL_HOSTS.has(parsed.hostname.toLowerCase()) ? { ok: true, baseUrl: toBaseUrl(trimmed) } : { ok: false, reason: 'insecure' };
  }
  return { ok: false, reason: 'invalid' };
};

export const isAllowedServerUrl = (input: string | null | undefined, allowLocalHttp?: boolean): boolean => validateServerUrl(input, allowLocalHttp).ok;

export const findLocationByUrl = (locations: readonly ResgridServerLocation[], url: string): ResgridServerLocation | undefined => locations.find((location) => isSameServerUrl(location.ApiUrl, url));

/** Server-reported sites first (they win on a duplicate URL or name), then any built-in hosted site they did not list. */
export const mergeServerLocations = (fetched: readonly ResgridServerLocation[]): ResgridServerLocation[] => {
  const valid = fetched.filter((location) => !!location?.Name && !!location?.ApiUrl && isAllowedServerUrl(location.ApiUrl, false));
  const missing = RESGRID_HOSTED_LOCATIONS.filter((hosted) => !valid.some((location) => location.Name === hosted.Name || isSameServerUrl(location.ApiUrl, hosted.ApiUrl)));
  return [...valid, ...missing];
};

// ---- The stored server -----------------------------------------------------------------------------------------------

let defaultApiUrl = buildApiUrl(RESGRID_HOSTED_LOCATIONS[0].ApiUrl);
let cached: string | null = null;
let storedProblem: ServerUrlProblem | null = null;

/** The build's default server (`${Env.BASE_API_URL}/api/${Env.API_VERSION}`), set by `initAuth()`. */
export function setDefaultApiUrl(url: string): void {
  defaultApiUrl = buildApiUrl(url);
  cached = null;
}

const readStored = (): string => {
  const kv = mainKv();
  const stored = kv ? readLegacyString(kv, CONTRACT_KEYS.baseUrl) : null;
  storedProblem = null;
  if (!stored) {
    return defaultApiUrl;
  }
  const validation = validateServerUrl(stored);
  if (!validation.ok) {
    // An insecure server a legacy build accepted (http:// in production): never send credentials to it. The setting is
    // kept (not deleted) so the settings screen can show it and the member can fix it; requests go to the default server.
    storedProblem = validation.reason;
    authLogger.warn({ message: 'Stored server URL is not allowed; using the default server', context: { reason: validation.reason } });
    return defaultApiUrl;
  }
  return buildApiUrl(validation.baseUrl);
};

onAuthStorageBound(() => {
  cached = null;
});

/** The API URL every request goes to (read on each request so a switch applies at once). */
export const getBaseApiUrl = (): string => {
  if (cached === null) {
    cached = readStored();
  }
  return cached;
};

/** Why the stored server is not being used (a legacy insecure URL), or null. */
export const getStoredServerUrlProblem = (): ServerUrlProblem | null => {
  getBaseApiUrl();
  return storedProblem;
};

/** Writes the server (already validated); `switchServer()` is the public way to change it. */
export const writeBaseApiUrl = (apiUrl: string): void => {
  const kv = mainKv();
  if (kv) {
    writeLegacyString(kv, CONTRACT_KEYS.baseUrl, apiUrl);
  }
  cached = apiUrl;
  storedProblem = null;
};
