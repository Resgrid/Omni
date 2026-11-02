import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Bindings for the app's local `ResgridDevice` Expo module (`apps/omni/modules/resgrid-device`): what expo-file-system
 * and expo-speech do not offer. Every call is safe without the module (web, tests, a build without it): it resolves to
 * false and does nothing. Import from `@resgrid/core/device/native-device` (not the barrel) so web bundles and tests
 * that never need it do not load expo-modules-core.
 */
interface ResgridDeviceModule {
  excludeFromBackupAsync(uri: string): Promise<boolean>;
  isExcludedFromBackupAsync(uri: string): Promise<boolean>;
  beginSpeechDuckingAsync(): Promise<boolean>;
  endSpeechDuckingAsync(): Promise<boolean>;
}

let cached: ResgridDeviceModule | null | undefined;

const nativeModule = (): ResgridDeviceModule | null => {
  if (cached === undefined) {
    try {
      cached = requireOptionalNativeModule<ResgridDeviceModule>('ResgridDevice');
    } catch {
      cached = null;
    }
  }
  return cached;
};

const call = async (run: (module: ResgridDeviceModule) => Promise<boolean>): Promise<boolean> => {
  const module = nativeModule();
  if (!module) return false;
  try {
    return (await run(module)) === true;
  } catch {
    return false;
  }
};

/**
 * Keeps a file or folder (a `file://` URI; created when missing) out of iCloud backups (`NSURLIsExcludedFromBackupKey`).
 * Android needs nothing (no app files are backed up) and resolves false.
 */
export const excludeFromBackup = (uri: string): Promise<boolean> => call((module) => module.excludeFromBackupAsync(uri));

export const isExcludedFromBackup = (uri: string): Promise<boolean> => call((module) => module.isExcludedFromBackupAsync(uri));

/**
 * Lowers other apps' audio while a spoken prompt plays (iOS `duckOthers`, Android transient may-duck focus). False when
 * nothing was changed — no module, or a call / push-to-talk session owns the audio — and then `endSpeechDucking` is a no-op.
 */
export const beginSpeechDucking = (): Promise<boolean> => call((module) => module.beginSpeechDuckingAsync());

/** Gives the audio back after the prompt (other apps return to their volume). */
export const endSpeechDucking = (): Promise<boolean> => call((module) => module.endSpeechDuckingAsync());

/** Test helper: forget the looked-up module. */
export const resetNativeDeviceForTests = (): void => {
  cached = undefined;
};
