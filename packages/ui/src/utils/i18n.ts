// Single seam for translations inside @resgrid/ui (L5 may import @resgrid/i18n, L1).
import { translate as translateKey, useTranslation } from '@resgrid/i18n';

export { useTranslation };

/** Non-React translation for helpers outside components (falls back to `defaultValue` before i18n is ready). */
export function translate(key: string, defaultValue: string, options?: Record<string, unknown>): string {
  try {
    const value = translateKey(key, { defaultValue, ...options });
    return typeof value === 'string' && value.length > 0 && value !== key ? value : defaultValue;
  } catch {
    return defaultValue;
  }
}
