import type { Language } from '../languages';

export interface TranslationTree {
  [key: string]: string | TranslationTree;
}

/** One namespace's strings for every supported language. */
export type NamespaceResources = Record<Language, TranslationTree>;
