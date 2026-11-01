// One module per namespace, so each app bundles only `common` plus its own strings (see initI18n). English is bundled
// (the default and fallback); every other language is loaded when it is chosen, a separate chunk in the web export.
// The JSON comes from scripts/merge-legacy-translations.mjs.
import en from '../translations/responder/en.json';
import type { NamespaceResources } from './types';

export const responderResources: NamespaceResources = {
  en,
  loaders: {
    ar: () => import('../translations/responder/ar.json'),
    de: () => import('../translations/responder/de.json'),
    el: () => import('../translations/responder/el.json'),
    es: () => import('../translations/responder/es.json'),
    fr: () => import('../translations/responder/fr.json'),
    it: () => import('../translations/responder/it.json'),
    pl: () => import('../translations/responder/pl.json'),
    sv: () => import('../translations/responder/sv.json'),
    uk: () => import('../translations/responder/uk.json'),
  },
};
