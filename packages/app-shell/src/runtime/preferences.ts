import { defaultIdGenerator } from '@resgrid/data';
import { CONTRACT_KEYS, type DurableKv, readLegacyString, writeLegacyString } from '@resgrid/offline';
import type { ModeType } from '@resgrid/ui';

import { getShellRuntime } from './runtime-holder';
import { setShellState } from './shell-state';

/**
 * Device preferences under their frozen legacy keys (they survive logout: `DEVICE_PREFERENCE_KEYS`). Settings screens
 * change them through these functions until a preferences store lands in a lower layer.
 */

const THEME_MODES: readonly ModeType[] = ['light', 'dark', 'system'];

export const isThemeMode = (value: unknown): value is ModeType => typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value);

/** Applies and persists the theme choice (`SELECTED_THEME`, a raw string as `useMMKVString` wrote it). */
export function setSelectedTheme(mode: ModeType): void {
  setShellState({ themeMode: mode });
  getShellRuntime().offline?.storage.main.set(CONTRACT_KEYS.selectedTheme, mode);
}

/** Marks onboarding as done (`IS_FIRST_TIME = false`, an MMKV boolean). */
export function completeOnboarding(): void {
  setShellState({ onboardingRequired: false });
  getShellRuntime().offline?.storage.main.set(CONTRACT_KEYS.isFirstTime, false);
}

/** The per-install device id (`unitDeviceUuid`); created on first use. */
export function getOrCreateDeviceUuid(main: DurableKv): string {
  const existing = readLegacyString(main, CONTRACT_KEYS.unitDeviceUuid);
  if (existing) {
    return existing;
  }
  const created = defaultIdGenerator();
  writeLegacyString(main, CONTRACT_KEYS.unitDeviceUuid, created);
  return created;
}

export const readStoredBoolean = (kv: DurableKv | undefined, key: string): boolean | undefined => {
  try {
    return kv?.getBoolean(key);
  } catch {
    return undefined;
  }
};
