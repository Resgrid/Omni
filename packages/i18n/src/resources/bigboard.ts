// One module per namespace, so each app bundles only `common` plus its own strings (see initI18n). English is bundled
// (the default and fallback); every other language is loaded when it is chosen, a separate chunk in the web export.
// The JSON comes from scripts/merge-legacy-translations.mjs.
import en from '../translations/bigboard/en.json';
import type { NamespaceResources } from './types';

export const bigboardResources: NamespaceResources = {
  en,
  loaders: {
    ar: () => import('../translations/bigboard/ar.json'),
    de: () => import('../translations/bigboard/de.json'),
    el: () => import('../translations/bigboard/el.json'),
    es: () => import('../translations/bigboard/es.json'),
    fr: () => import('../translations/bigboard/fr.json'),
    it: () => import('../translations/bigboard/it.json'),
    pl: () => import('../translations/bigboard/pl.json'),
    sv: () => import('../translations/bigboard/sv.json'),
    uk: () => import('../translations/bigboard/uk.json'),
  },
};
