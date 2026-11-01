// One module per namespace, so each app bundles only `common` plus its own strings (see initI18n). English is bundled
// (the default and fallback); every other language is loaded when it is chosen, a separate chunk in the web export.
// The JSON comes from scripts/merge-legacy-translations.mjs.
import en from '../translations/unit/en.json';
import type { NamespaceResources } from './types';

export const unitResources: NamespaceResources = {
  en,
  loaders: {
    ar: () => import('../translations/unit/ar.json'),
    de: () => import('../translations/unit/de.json'),
    el: () => import('../translations/unit/el.json'),
    es: () => import('../translations/unit/es.json'),
    fr: () => import('../translations/unit/fr.json'),
    it: () => import('../translations/unit/it.json'),
    pl: () => import('../translations/unit/pl.json'),
    sv: () => import('../translations/unit/sv.json'),
    uk: () => import('../translations/unit/uk.json'),
  },
};
