/** The ten shipped languages (resgrid-i18n skill). Every namespace has all of them, in key parity. */
export const SUPPORTED_LANGUAGES = ['en', 'ar', 'de', 'el', 'es', 'fr', 'it', 'pl', 'sv', 'uk'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const FALLBACK_LANGUAGE: Language = 'en';

/** Right-to-left languages. */
export const RTL_LANGUAGES: readonly Language[] = ['ar'];

/**
 * Storage key the legacy apps persist the chosen language under (MMKV, plain string). Persisting the choice is
 * the app's job (storage workstream); the key is exported so every app keeps reading the same value after the
 * upgrade, and it must survive logout (language is a device preference).
 */
export const LEGACY_LANGUAGE_STORAGE_KEY = 'local';

export const isSupportedLanguage = (value: unknown): value is Language => typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);

export const isRTLLanguage = (language: string): boolean => (RTL_LANGUAGES as readonly string[]).includes(language);
