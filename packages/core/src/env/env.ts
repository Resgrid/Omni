import { APP_ENVS, type AppEnv } from '@resgrid/config';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { isDev } from '../dev';

/**
 * The client environment (omni-plan §7.1). Build-time values come from `extra.env` in the Expo config
 * (written by @resgrid/config-plugins `buildClientEnv`); on web, the Docker entrypoint can override them at
 * container start through `window.__ENV__` (env-config.js).
 */
export interface ClientEnv {
  APP_ENV: AppEnv;
  APP_VARIANT: string;
  BASE_API_URL: string;
  API_VERSION: string;
  RESGRID_API_URL: string;
  CHANNEL_HUB_NAME: string;
  REALTIME_GEO_HUB_NAME: string;
  CHAT_HUB_NAME: string;
  LOGGING_KEY: string;
  APP_KEY: string;
  SENTRY_DSN: string;
  COUNTLY_APP_KEY: string;
  COUNTLY_SERVER_URL: string;
  /** True on iOS/Android, always false on web and Electron (Dispatch). Derived from the platform, never from env. */
  IS_MOBILE_APP: boolean;
  /** Web/Docker maintenance switch (BigBoard). */
  MAINTENANCE_MODE: boolean;
}

/** Build/version facts written to `extra.version` by app.config.ts (packages/config `computeVariantVersion`). */
export interface AppVersionInfo {
  version: string;
  buildNumber: number;
  electronVersion?: string;
  tag?: string;
}

const STRING_KEYS = [
  'APP_VARIANT',
  'BASE_API_URL',
  'API_VERSION',
  'RESGRID_API_URL',
  'CHANNEL_HUB_NAME',
  'REALTIME_GEO_HUB_NAME',
  'CHAT_HUB_NAME',
  'LOGGING_KEY',
  'APP_KEY',
  'SENTRY_DSN',
  'COUNTLY_APP_KEY',
  'COUNTLY_SERVER_URL',
] as const;
type StringKey = (typeof STRING_KEYS)[number];

const DEFAULTS: Record<StringKey, string> = {
  APP_VARIANT: '',
  BASE_API_URL: 'https://qaapi.resgrid.dev',
  API_VERSION: 'v4',
  RESGRID_API_URL: '/api/v4',
  CHANNEL_HUB_NAME: 'eventingHub',
  REALTIME_GEO_HUB_NAME: 'geolocationHub',
  CHAT_HUB_NAME: 'chatHub',
  LOGGING_KEY: '',
  APP_KEY: '',
  SENTRY_DSN: '',
  COUNTLY_APP_KEY: '',
  COUNTLY_SERVER_URL: '',
};

type RawEnv = Record<string, unknown>;

const isRecord = (value: unknown): value is RawEnv => typeof value === 'object' && value !== null && !Array.isArray(value);

/** An env-config.js value the entrypoint did not substitute (`'${BIGBOARD_SENTRY_DSN}'`). */
const isPlaceholder = (value: unknown): boolean => typeof value === 'string' && value.includes('${');

const toBoolean = (value: unknown): boolean => value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');

/**
 * Keeps only the runtime values that should override build values: drops unsubstituted `${...}` placeholders
 * (BigBoard) and empty strings (an unset container variable must not wipe a build-time value).
 */
export function filterRuntimeEnv(raw: unknown): RawEnv {
  if (!isRecord(raw)) return {};
  const out: RawEnv = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null || isPlaceholder(value)) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    out[key] = value;
  }
  return out;
}

const toAppEnv = (value: unknown): AppEnv => {
  if (typeof value === 'string' && (APP_ENVS as readonly string[]).includes(value)) return value as AppEnv;
  return isDev() ? 'development' : 'production';
};

/**
 * Merges build-time and runtime env: runtime wins (Dispatch), placeholders are ignored (BigBoard), and
 * `IS_MOBILE_APP` follows the platform (false on web even if a deployment says otherwise).
 */
export function mergeClientEnv(buildEnv: unknown, runtimeEnv: unknown, platformOS: string): ClientEnv {
  const build = isRecord(buildEnv) ? filterRuntimeEnv(buildEnv) : {};
  const runtime = platformOS === 'web' ? filterRuntimeEnv(runtimeEnv) : {};
  const merged: RawEnv = { ...build, ...runtime };

  const strings = {} as Record<StringKey, string>;
  for (const key of STRING_KEYS) {
    const value = merged[key];
    strings[key] = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : DEFAULTS[key];
  }

  return {
    ...strings,
    APP_ENV: toAppEnv(merged.APP_ENV),
    IS_MOBILE_APP: platformOS === 'ios' || platformOS === 'android',
    MAINTENANCE_MODE: toBoolean(merged.MAINTENANCE_MODE),
  };
}

const readExtra = (): RawEnv => {
  const extra: unknown = Constants.expoConfig?.extra;
  return isRecord(extra) ? extra : {};
};

const readWebRuntimeEnv = (): unknown => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  return (window as unknown as { __ENV__?: unknown }).__ENV__;
};

let cachedEnv: ClientEnv | null = null;

/** The merged client env, read once and cached. */
export function getEnv(): ClientEnv {
  if (!cachedEnv) cachedEnv = mergeClientEnv(readExtra().env, readWebRuntimeEnv(), Platform.OS);
  return cachedEnv;
}

/** Version info from `extra.version`, falling back to the Expo config's `version`. */
export function getAppVersionInfo(): AppVersionInfo | null {
  const raw = readExtra().version;
  if (isRecord(raw) && typeof raw.version === 'string') {
    return {
      version: raw.version,
      buildNumber: typeof raw.buildNumber === 'number' ? raw.buildNumber : Number(raw.buildNumber) || 0,
      electronVersion: typeof raw.electronVersion === 'string' ? raw.electronVersion : undefined,
      tag: typeof raw.tag === 'string' ? raw.tag : undefined,
    };
  }
  const version = Constants.expoConfig?.version;
  return typeof version === 'string' ? { version, buildNumber: 0 } : null;
}

/** Test helper: forget the cached env so the next read re-merges. Not for app code. */
export function resetEnvForTests(): void {
  cachedEnv = null;
}

/**
 * Legacy-shaped accessor (`Env.SENTRY_DSN`), resolved lazily on first property read so importing it never
 * touches Expo constants at module evaluation.
 */
export const Env: Readonly<ClientEnv> = Object.defineProperties(
  {} as ClientEnv,
  Object.fromEntries(([...STRING_KEYS, 'APP_ENV', 'IS_MOBILE_APP', 'MAINTENANCE_MODE'] as const).map((key) => [key, { enumerable: true, get: () => getEnv()[key] }]))
);
