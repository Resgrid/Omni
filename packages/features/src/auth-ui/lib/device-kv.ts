import { getDataStorageKv } from '@resgrid/data';
import type { DurableKv } from '@resgrid/offline';

let override: DurableKv | null | undefined;

/**
 * The variant's main MMKV instance (`runtime.storage.main`, bound by the app shell through `configureData`), where device
 * preferences live under their frozen legacy keys (`local`, `SELECTED_THEME`, `IS_FIRST_TIME`, `NAVIGATION_APP`, …). Null
 * until storage is open; every reader falls back to a default then.
 */
export const devicePreferencesKv = (): DurableKv | null => (override !== undefined ? override : getDataStorageKv());

/** Binds a specific instance (tests, or a shell that opens storage before configureData). Pass undefined to follow @resgrid/data again. */
export const setDevicePreferencesKv = (kv: DurableKv | null | undefined): void => {
  override = kv;
};
