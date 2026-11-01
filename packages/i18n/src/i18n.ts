import { getActiveVariant, type VariantId } from '@resgrid/config';
import { createInstance, type TOptions } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager, Platform } from 'react-native';

import { resolveInitialLanguage } from './detect';
import { FALLBACK_LANGUAGE, isRTLLanguage, isSupportedLanguage, type Language, SUPPORTED_LANGUAGES } from './languages';
import { COMMON_NAMESPACE, type Namespace } from './namespaces';
import { commonResources } from './resources/common';
import type { LoadableLanguage, NamespaceResources, TranslationTree } from './resources/types';

/**
 * The app's i18next instance. Created (not the global default) so it carries exactly the namespaces of one app;
 * `initI18n` registers it with react-i18next, so `useTranslation()` resolves against it.
 */
export const i18n = createInstance();

export interface InitI18nOptions {
  /** The persisted user choice (read by the app from its storage). Ignored when unsupported. */
  language?: string | null;
  /** Default namespace. Defaults to the active variant's id, or `common` when no variant is set (tests, tooling). */
  variantId?: VariantId;
  /** The variant's own strings, e.g. `unitResources` from `@resgrid/i18n/resources/unit`. */
  variantResources?: NamespaceResources;
  /** Product name for `{{appName}}`. Defaults to the active variant's `identity.name`. */
  appName?: string;
}

export interface LanguageChange {
  language: Language;
  previous: Language | null;
  isRTL: boolean;
  /**
   * True on iOS/Android when the layout direction flipped: React Native applies `forceRTL` only after a reload,
   * so the app should offer or perform one (e.g. `Updates.reloadAsync()`). Web switches `dir` immediately.
   */
  requiresReload: boolean;
}

type LanguageListener = (change: LanguageChange) => void;

const listeners = new Set<LanguageListener>();
const translateCache = new Map<string, string>();
let lastLanguage: Language | null = null;
let listenerAttached = false;

/** The running app's namespaces and their resources, for loading further languages on demand. */
let activeNamespaces: { ns: Namespace; resources: NamespaceResources | undefined }[] = [{ ns: COMMON_NAMESPACE, resources: commonResources }];
/** `${namespace}/${language}` bundles added to the instance (English is added at init), and loads in flight. */
const loadedBundles = new Set<string>();
const pendingBundles = new Map<string, Promise<void>>();

const isDev = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__;

const activeVariant = (): { id: VariantId; name: string } | null => {
  try {
    const variant = getActiveVariant();
    return { id: variant.id, name: variant.identity.name };
  } catch {
    return null;
  }
};

/** Applies the layout direction for a language. Returns true when a native reload is needed for it to show. */
const applyDirection = (language: Language): boolean => {
  const rtl = isRTLLanguage(language);
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = language;
    }
    return false;
  }
  const changed = I18nManager.isRTL !== rtl;
  try {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  } catch {
    // I18nManager is unavailable in some test and headless contexts; direction then stays as it is.
  }
  return changed;
};

const handleLanguageChanged = (lng: string): void => {
  // `translate()` memoizes per key; without this every cached string would stay in the previous language
  // (LTR→LTR switches do not reload the app). Responder's fix.
  translateCache.clear();
  const language = isSupportedLanguage(lng) ? lng : FALLBACK_LANGUAGE;
  // A direct `i18n.changeLanguage()` (not setLanguage) shows the English fallback until the strings arrive.
  void loadLanguage(language);
  const previous = lastLanguage;
  lastLanguage = language;
  const change: LanguageChange = { language, previous, isRTL: isRTLLanguage(language), requiresReload: applyDirection(language) };
  for (const listener of [...listeners]) {
    try {
      listener(change);
    } catch {
      // One failing subscriber must not stop the others.
    }
  }
};

/** The bundled English strings of the app's namespaces; other languages are added by `loadLanguage`. */
const buildResources = (variantId: VariantId | undefined, variantResources: NamespaceResources | undefined): Record<string, Record<string, TranslationTree>> => {
  const en: Record<string, TranslationTree> = { [COMMON_NAMESPACE]: commonResources.en };
  if (variantId) en[variantId] = variantResources?.en ?? {};
  return { [FALLBACK_LANGUAGE]: en };
};

const loadBundle = (ns: Namespace, resources: NamespaceResources | undefined, language: LoadableLanguage): Promise<void> => {
  const key = `${ns}/${language}`;
  if (loadedBundles.has(key)) return Promise.resolve();
  const pending = pendingBundles.get(key);
  if (pending) return pending;
  const load = (resources ? resources.loaders[language]().then((module) => module.default) : Promise.resolve<TranslationTree>({}))
    .then((tree) => {
      i18n.addResourceBundle(language, ns, tree, true, true);
      loadedBundles.add(key);
      translateCache.clear();
    })
    .finally(() => pendingBundles.delete(key));
  pendingBundles.set(key, load);
  return load;
};

/**
 * Loads a language's strings for the app's namespaces (English is bundled) and resolves once they are added; mounted
 * components re-render then. Resolves `false` when they could not be loaded (an offline web client missing the chunk):
 * the UI stays on the English fallback and the next call tries again.
 */
export async function loadLanguage(language: Language): Promise<boolean> {
  if (language === 'en') return true;
  try {
    await Promise.all(activeNamespaces.map(({ ns, resources }) => loadBundle(ns, resources, language)));
    return true;
  } catch (error) {
    if (isDev()) console.warn(`[i18n] could not load the "${language}" strings; showing English.`, error);
    return false;
  }
}

/**
 * Initialises translations synchronously with the bundled English strings and starts loading the chosen language
 * (`loadLanguage`; the shell's startup waits for it). Call once at startup, after `setActiveVariant()`. Calling it again
 * updates the language, product name and variant resources in place.
 *
 * - Default namespace = the variant id, `fallbackNS: 'common'`, so flat legacy keys (`t('calls.title')`) resolve
 *   from the variant's namespace first, then from `common`.
 * - Language: the stored choice when supported, else the first supported device locale, else English.
 * - `{{appName}}` is filled from the variant manifest unless the caller passes its own value.
 */
export function initI18n(options: InitI18nOptions = {}): typeof i18n {
  const variant = activeVariant();
  const variantId = options.variantId ?? variant?.id;
  const appName = options.appName ?? variant?.name ?? 'Resgrid';
  const language = resolveInitialLanguage(options.language);
  const defaultNS: Namespace = variantId ?? COMMON_NAMESPACE;
  const resources = buildResources(variantId, options.variantResources);
  activeNamespaces = [{ ns: COMMON_NAMESPACE, resources: commonResources }, ...(variantId ? [{ ns: variantId, resources: options.variantResources }] : [])];

  if (variantId && !options.variantResources && isDev()) {
    console.warn(`[i18n] initI18n: no resources passed for the "${variantId}" namespace; only common strings are available.`);
  }

  if (!listenerAttached) {
    i18n.on('languageChanged', handleLanguageChanged);
    listenerAttached = true;
  }

  if (i18n.isInitialized) {
    for (const [lang, namespaces] of Object.entries(resources)) {
      for (const [ns, tree] of Object.entries(namespaces)) i18n.addResourceBundle(lang, ns, tree, true, true);
    }
    i18n.options.ns = [COMMON_NAMESPACE, ...(variantId ? [variantId] : [])];
    i18n.options.defaultNS = defaultNS;
    i18n.options.interpolation = { ...i18n.options.interpolation, defaultVariables: { ...i18n.options.interpolation?.defaultVariables, appName } };
    translateCache.clear();
    if (i18n.language !== language) void i18n.changeLanguage(language);
    void loadLanguage(language);
    return i18n;
  }

  void i18n.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    ns: [COMMON_NAMESPACE, ...(variantId ? [variantId] : [])],
    defaultNS,
    fallbackNS: COMMON_NAMESPACE,
    // Legacy files use v3 plural keys (`_plural`); keep their behaviour until the keys are migrated.
    compatibilityJSON: 'v3',
    initImmediate: false,
    interpolation: {
      // React escapes rendered text already.
      escapeValue: false,
      defaultVariables: { appName },
    },
    // Re-render when a language's strings arrive after the first render (loadLanguage).
    react: { useSuspense: false, bindI18nStore: 'added' },
  });
  void loadLanguage(language);
  return i18n;
}

/** Changes the UI language. Persisting the choice is the caller's job (the app's storage); language survives logout. */
export async function setLanguage(language: Language): Promise<void> {
  if (!isSupportedLanguage(language)) throw new Error(`Unsupported language: ${String(language)}`);
  if (i18n.language === language) return;
  await loadLanguage(language);
  await i18n.changeLanguage(language);
}

/** Legacy name for `setLanguage`. */
export const changeLanguage = setLanguage;

/** Subscribes to language changes (including the initial one). Returns the unsubscribe function. */
export function onLanguageChanged(listener: LanguageListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCurrentLanguage(): Language {
  return isSupportedLanguage(i18n.language) ? i18n.language : FALLBACK_LANGUAGE;
}

export function isRTL(): boolean {
  return isRTLLanguage(getCurrentLanguage());
}

/**
 * Translation for code outside React (services, notifications). Memoized per language, key and options; the
 * cache is cleared on every language change. Stores must not call this (omni-plan §5.2) — they return keys or
 * codes and the UI translates.
 */
export function translate(key: string, options?: TOptions): string {
  let cacheKey: string | null;
  try {
    cacheKey = `${i18n.language}|${key}${options ? JSON.stringify(options) : ''}`;
  } catch {
    cacheKey = null;
  }
  if (cacheKey !== null) {
    const cached = translateCache.get(cacheKey);
    if (cached !== undefined) return cached;
  }
  const value = String(options ? i18n.t(key, options) : i18n.t(key));
  if (cacheKey !== null) translateCache.set(cacheKey, value);
  return value;
}
