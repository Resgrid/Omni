import { useTranslation } from '@resgrid/i18n';
import { useCallback, useMemo } from 'react';

import strings from './i18n.en.json';

/**
 * The shell's own strings (flat key → English) live in `i18n.en.json`; `packages/i18n/scripts/add-keys.ts --features`
 * merges them into the `common` namespace in all ten languages. Until a key is merged, the English text is the
 * `defaultValue`, so the UI never shows a raw key.
 */
export type ShellStringKey = keyof typeof strings;

export const SHELL_STRINGS: Readonly<Record<ShellStringKey, string>> = strings;

export type ShellTranslate = (key: ShellStringKey, options?: Record<string, unknown>) => string;

export interface ShellTranslation {
  /** A shell string (English default from `i18n.en.json`). */
  t: ShellTranslate;
  /** Any translation key with an explicit fallback (nav labels reuse existing `tabs.*` keys). */
  tk: (key: string, fallback: string, options?: Record<string, unknown>) => string;
}

export function useShellTranslation(): ShellTranslation {
  const { t } = useTranslation();
  const shellT = useCallback<ShellTranslate>((key, options) => String(t(key, { defaultValue: SHELL_STRINGS[key], ...options })), [t]);
  const tk = useCallback((key: string, fallback: string, options?: Record<string, unknown>) => String(t(key, { defaultValue: fallback, ...options })), [t]);
  return useMemo(() => ({ t: shellT, tk }), [shellT, tk]);
}
