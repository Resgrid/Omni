import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Platform } from 'react-native';

import { logger } from '../logging/logger';

/**
 * Keep the screen awake (Settings → Keep alive). Persisting the choice is the storage layer's job; it must keep
 * the legacy key so the setting survives the upgrade, and it survives logout (device preference).
 */
export const KEEP_ALIVE_STORAGE_KEY = 'KEEP_ALIVE_ENABLED';

const KEEP_AWAKE_TAG = 'settings';

/** Keep-awake is skipped on web and Electron (Dispatch/BigBoard). */
export const isKeepAwakeSupported = (): boolean => Platform.OS !== 'web';

/**
 * Turns keep-awake on or off. Resolves true when applied, false when unsupported (web) or when it failed — a
 * failure is logged (Unit/IC), never thrown, so a settings toggle cannot crash.
 */
export async function setKeepAwake(enabled: boolean): Promise<boolean> {
  if (!isKeepAwakeSupported()) {
    logger.debug({ message: 'Keep awake is not supported on web; skipped', context: { enabled } });
    return false;
  }
  try {
    if (enabled) await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    else await deactivateKeepAwake(KEEP_AWAKE_TAG);
    return true;
  } catch (error) {
    logger.error({ message: 'Failed to update keep alive state', context: { error, enabled } });
    return false;
  }
}

/**
 * Re-applies the persisted keep-alive choice at startup. `readEnabled` reads the stored flag (e.g.
 * `() => storage.getBoolean(KEEP_ALIVE_STORAGE_KEY)`).
 */
export async function loadKeepAliveState(readEnabled: () => boolean | null | undefined): Promise<void> {
  if (!isKeepAwakeSupported()) return;
  let enabled: boolean | null | undefined;
  try {
    enabled = readEnabled();
  } catch (error) {
    logger.error({ message: 'Failed to load keep alive state on startup', context: { error } });
    return;
  }
  if (enabled === true) await setKeepAwake(true);
}
