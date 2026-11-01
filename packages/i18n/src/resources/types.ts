import type { Language } from '../languages';

export interface TranslationTree {
  [key: string]: string | TranslationTree;
}

/** A language that is loaded on demand: every supported language except the bundled fallback. */
export type LoadableLanguage = Exclude<Language, 'en'>;

/** Loads one language of one namespace (a dynamic import of its JSON; a separate chunk in the web export). */
export type TranslationLoader = () => Promise<{ default: TranslationTree }>;

/**
 * One namespace as an app ships it: English bundled (the default language and the fallback for missing keys), every
 * other language behind a loader, so a web export carries only the strings of the language in use.
 */
export interface NamespaceResources {
  en: TranslationTree;
  loaders: Record<LoadableLanguage, TranslationLoader>;
}

/** One namespace's strings for every supported language, all loaded (tests and tooling). */
export type NamespaceTranslations = Record<Language, TranslationTree>;
