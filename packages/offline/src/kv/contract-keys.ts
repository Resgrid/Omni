import type { VariantId } from '@resgrid/config';

import type { DurableKv } from './durable-kv';

/**
 * Keys today's store builds write that Omni must keep reading after an upgrade (findings-core §0).
 * Renaming any of them signs users out or loses settings — they are part of the frozen storage
 * identity (plan D8, §5.3.3).
 */
export const CONTRACT_KEYS = {
  baseUrl: 'baseUrl',
  unitDeviceUuid: 'unitDeviceUuid',
  activeCallId: 'activeCallId',
  activeUnitId: 'activeUnitId',
  isFirstTime: 'IS_FIRST_TIME',
  language: 'local',
  selectedTheme: 'SELECTED_THEME',
  authStore: 'auth-storage',
  securityStore: 'security-storage',
  coreStore: 'core-storage',
  apiCachePrefix: 'api_cache_',
  apiCacheScope: 'api_cache_scope',
  authResponse: 'authResponse',
} as const;

/**
 * Device preferences that survive logout, department switch and server switch (plan §8.2 wipe rule).
 * Fixes the legacy bug where logout wiped language and theme (R/U/I).
 */
export const DEVICE_PREFERENCE_KEYS: readonly string[] = [
  CONTRACT_KEYS.language,
  CONTRACT_KEYS.selectedTheme,
  CONTRACT_KEYS.baseUrl,
  CONTRACT_KEYS.unitDeviceUuid,
  CONTRACT_KEYS.isFirstTime,
  'NAVIGATION_APP',
  'KEEP_ALIVE_ENABLED',
];

/** Session keys kept across a department switch (same user, same server). */
export const SESSION_KEYS: readonly string[] = [CONTRACT_KEYS.authResponse, CONTRACT_KEYS.authStore];

/**
 * Per-variant additions to the preserve list. BigBoard's widget layouts are device configuration
 * (persisted store names from BigBoard `stores/dashboard` and `stores/widget-settings`). Features can
 * add more at runtime with `registerPreservedKeys()`.
 */
export const VARIANT_PRESERVED_KEYS: Partial<Record<VariantId, readonly string[]>> = {
  bigboard: ['dashboard-widgets', 'widget-settings'],
};

/**
 * Read a string a legacy build stored either JSON-encoded (`setItem` in every app's lib/storage) or
 * raw (`useMMKVString`). Never deletes: a contract key is too important to drop on a parse miss.
 */
export function readLegacyString(kv: DurableKv, key: string): string | null {
  const raw = kv.getString(key);
  if (raw === undefined || raw === '') return null;
  if (raw.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // Not JSON after all — fall through to the raw value.
    }
  }
  return raw;
}

/** Write a string the way the legacy `setItem` helpers did (JSON-encoded), so older code paths still parse it. */
export function writeLegacyString(kv: DurableKv, key: string, value: string): void {
  kv.setJSON(key, value);
}
