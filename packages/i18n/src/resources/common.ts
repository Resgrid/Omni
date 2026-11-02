// One module per namespace, so each app bundles only `common` plus its own strings (see initI18n). English is bundled
// (the default and fallback); every other language is loaded when it is chosen, a separate chunk in the web export.
// The JSON comes from scripts/merge-legacy-translations.mjs.
import en from '../translations/common/en.json';
import type { NamespaceResources } from './types';

export const commonResources: NamespaceResources = {
  en,
  loaders: {
    ar: () => import('../translations/common/ar.json'),
    de: () => import('../translations/common/de.json'),
    el: () => import('../translations/common/el.json'),
    es: () => import('../translations/common/es.json'),
    fr: () => import('../translations/common/fr.json'),
    it: () => import('../translations/common/it.json'),
    pl: () => import('../translations/common/pl.json'),
    sv: () => import('../translations/common/sv.json'),
    uk: () => import('../translations/common/uk.json'),
  },
};
