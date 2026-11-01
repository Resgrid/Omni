// One module per namespace, so each app bundles only `common` plus its own strings (see initI18n). English is bundled
// (the default and fallback); every other language is loaded when it is chosen, a separate chunk in the web export.
// The JSON comes from scripts/merge-legacy-translations.mjs.
import en from '../translations/ic/en.json';
import type { NamespaceResources } from './types';

export const icResources: NamespaceResources = {
  en,
  loaders: {
    ar: () => import('../translations/ic/ar.json'),
    de: () => import('../translations/ic/de.json'),
    el: () => import('../translations/ic/el.json'),
    es: () => import('../translations/ic/es.json'),
    fr: () => import('../translations/ic/fr.json'),
    it: () => import('../translations/ic/it.json'),
    pl: () => import('../translations/ic/pl.json'),
    sv: () => import('../translations/ic/sv.json'),
    uk: () => import('../translations/ic/uk.json'),
  },
};
