import { getCurrentLanguage, isSupportedLanguage, type Language, LEGACY_LANGUAGE_STORAGE_KEY, setLanguage, SUPPORTED_LANGUAGES, useTranslation } from '@resgrid/i18n';
import { useCallback } from 'react';

import { devicePreferencesKv } from './device-kv';

/** Each language in its own name (shown under the translated name, so a member who cannot read the current language finds theirs). */
export const LANGUAGE_AUTONYMS: Readonly<Record<Language, string>> = {
  en: 'English',
  es: 'Español',
  sv: 'Svenska',
  de: 'Deutsch',
  el: 'Ελληνικά',
  fr: 'Français',
  it: 'Italiano',
  pl: 'Polski',
  uk: 'Українська',
  ar: 'العربية',
};

/** `settings.<name>` keys in the common namespace (Unit's language list). */
export const LANGUAGE_LABEL_KEYS: Readonly<Record<Language, string>> = {
  en: 'settings.english',
  es: 'settings.spanish',
  sv: 'settings.swedish',
  de: 'settings.german',
  el: 'settings.greek',
  fr: 'settings.french',
  it: 'settings.italian',
  pl: 'settings.polish',
  uk: 'settings.ukrainian',
  ar: 'settings.arabic',
};

/** Display order of the legacy pickers (English first, Arabic last). */
export const LANGUAGE_ORDER: readonly Language[] = (['en', 'es', 'sv', 'de', 'el', 'fr', 'it', 'pl', 'uk', 'ar'] as const).filter((language) => (SUPPORTED_LANGUAGES as readonly string[]).includes(language));

export interface LanguagePreference {
  language: Language;
  setLanguage: (language: Language) => Promise<void>;
}

/**
 * The app language and a setter that applies it and saves it under the frozen `local` key (a raw string, as the legacy
 * `useMMKVString` wrote it). Language is a device preference: logout keeps it (DEVICE_PREFERENCE_KEYS).
 */
export const useLanguagePreference = (): LanguagePreference => {
  const { i18n } = useTranslation();
  const language: Language = isSupportedLanguage(i18n.language) ? i18n.language : getCurrentLanguage();
  const select = useCallback(async (next: Language) => {
    await setLanguage(next);
    devicePreferencesKv()?.set(LEGACY_LANGUAGE_STORAGE_KEY, next);
  }, []);
  return { language, setLanguage: select };
};
