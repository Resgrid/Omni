import { getLocales } from 'expo-localization';

import { FALLBACK_LANGUAGE, isSupportedLanguage, type Language } from './languages';

/** The parts of an expo-localization locale this module reads. */
export interface DeviceLocale {
  languageCode?: string | null;
  languageTag?: string | null;
}

const languageOf = (locale: DeviceLocale): string | null => {
  const code = locale.languageCode ?? locale.languageTag?.split(/[-_]/)[0] ?? null;
  return code ? code.toLowerCase() : null;
};

const readDeviceLocales = (): DeviceLocale[] => {
  try {
    return getLocales();
  } catch {
    return [];
  }
};

/**
 * The first supported language among ALL the device's preferred locales (Unit/IC behaviour), so a device set
 * to e.g. Catalan then Spanish gets Spanish rather than English. Falls back to English.
 */
export function detectDeviceLanguage(locales: readonly DeviceLocale[] = readDeviceLocales()): Language {
  for (const locale of locales) {
    const code = languageOf(locale);
    if (isSupportedLanguage(code)) return code;
  }
  return FALLBACK_LANGUAGE;
}

/** The user's stored choice when it is still supported, otherwise the device language. */
export function resolveInitialLanguage(stored?: string | null, locales?: readonly DeviceLocale[]): Language {
  if (isSupportedLanguage(stored)) return stored;
  return detectDeviceLanguage(locales);
}
