// @resgrid/i18n (layer L1) — translations for all five apps (omni-plan §7.12, resgrid-i18n skill).
// Namespaces: `common` plus one per variant; the variant namespace is the default, `common` the fallback.
// Apps pass their own namespace's resources to initI18n, e.g.
//   import { unitResources } from '@resgrid/i18n/resources/unit';
//   initI18n({ language: storedLanguage, variantResources: unitResources });
export { detectDeviceLanguage, type DeviceLocale, resolveInitialLanguage } from './detect';
export { changeLanguage, i18n as default, getCurrentLanguage, i18n, initI18n, type InitI18nOptions, isRTL, type LanguageChange, loadLanguage, onLanguageChanged, setLanguage, translate } from './i18n';
export { FALLBACK_LANGUAGE, isRTLLanguage, isSupportedLanguage, type Language, LEGACY_LANGUAGE_STORAGE_KEY, RTL_LANGUAGES, SUPPORTED_LANGUAGES } from './languages';
export { COMMON_NAMESPACE, type Namespace, NAMESPACES } from './namespaces';
export type { LoadableLanguage, NamespaceResources, NamespaceTranslations, TranslationLoader, TranslationTree } from './resources/types';
export { useTranslation } from 'react-i18next';
