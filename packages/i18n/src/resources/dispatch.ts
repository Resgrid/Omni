// One module per namespace, so each app bundles only `common` plus its own strings (see initI18n). English is bundled
// (the default and fallback); every other language is loaded when it is chosen, a separate chunk in the web export.
// The JSON comes from scripts/merge-legacy-translations.mjs.
import en from '../translations/dispatch/en.json';
import type { NamespaceResources } from './types';

export const dispatchResources: NamespaceResources = {
  en,
  loaders: {
    ar: () => import('../translations/dispatch/ar.json'),
    de: () => import('../translations/dispatch/de.json'),
    el: () => import('../translations/dispatch/el.json'),
    es: () => import('../translations/dispatch/es.json'),
    fr: () => import('../translations/dispatch/fr.json'),
    it: () => import('../translations/dispatch/it.json'),
    pl: () => import('../translations/dispatch/pl.json'),
    sv: () => import('../translations/dispatch/sv.json'),
    uk: () => import('../translations/dispatch/uk.json'),
  },
};
