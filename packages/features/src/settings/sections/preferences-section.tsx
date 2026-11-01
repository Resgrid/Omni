import { isKeepAwakeSupported, setKeepAwake } from '@resgrid/core';
import { LANGUAGE_AUTONYMS, LANGUAGE_LABEL_KEYS, LANGUAGE_ORDER, OptionSheet, useLanguagePreference } from '@resgrid/features/auth-ui';
import { type Language, useTranslation } from '@resgrid/i18n';
import type { ModeType } from '@resgrid/ui';
import React, { useMemo, useState } from 'react';

import { SettingsRow, ToggleRow } from '../components/settings-row';
import { getNavigationApp, getNavigationAppOptions, NAVIGATION_APP_LABEL_KEYS, type NavigationApp, setNavigationApp } from '../lib/navigation-app';
import { getKeepAlivePreference, getThemeMode, setKeepAlivePreference, setThemeMode, usePreferencesVersion } from '../lib/preferences';

type Picker = 'theme' | 'language' | 'navigation' | null;

const THEME_KEYS: Record<ModeType, string> = { light: 'settings.theme.light', dark: 'settings.theme.dark', system: 'settings.theme.system' };

/** Preferences: theme, language, navigation app and keep-awake (Responder/Unit items; device preferences kept across logout). */
export const PreferencesSection: React.FC = () => {
  const { t } = useTranslation();
  usePreferencesVersion();
  const { language, setLanguage } = useLanguagePreference();
  const [picker, setPicker] = useState<Picker>(null);
  const theme = getThemeMode();
  const navigationApp = getNavigationApp();
  const keepAlive = getKeepAlivePreference();

  const themeOptions = useMemo(() => (['system', 'light', 'dark'] as const).map((value) => ({ value, label: t(THEME_KEYS[value]) })), [t]);
  const languageOptions = useMemo(() => LANGUAGE_ORDER.map((value) => ({ value, label: t(LANGUAGE_LABEL_KEYS[value]), description: LANGUAGE_AUTONYMS[value] })), [t]);
  const navigationOptions = useMemo(() => getNavigationAppOptions().map((value) => ({ value, label: t(NAVIGATION_APP_LABEL_KEYS[value]) })), [t]);
  const close = () => setPicker(null);

  return (
    <>
      <SettingsRow label={t('settings.theme.title')} value={t(THEME_KEYS[theme])} onPress={() => setPicker('theme')} testID="settings-theme" />
      <SettingsRow label={t('settings.language')} value={t(LANGUAGE_LABEL_KEYS[language])} onPress={() => setPicker('language')} testID="settings-language" />
      <SettingsRow
        label={t('settings.navigation_app.title')}
        value={t(NAVIGATION_APP_LABEL_KEYS[navigationApp])}
        description={t('settings.navigation_app.description')}
        onPress={() => setPicker('navigation')}
        testID="settings-navigation-app"
      />
      {isKeepAwakeSupported() ? (
        <ToggleRow
          label={t('settings.keep_alive')}
          value={keepAlive}
          note={t('settings.keep_alive_warning')}
          onValueChange={(enabled) => {
            setKeepAlivePreference(enabled);
            void setKeepAwake(enabled);
          }}
          testID="settings-keep-alive"
        />
      ) : null}

      <OptionSheet<ModeType> isOpen={picker === 'theme'} onClose={close} title={t('settings.theme.title')} options={themeOptions} selected={theme} onSelect={setThemeMode} testID="theme-sheet" />
      <OptionSheet<Language>
        isOpen={picker === 'language'}
        onClose={close}
        title={t('settings.language')}
        options={languageOptions}
        selected={language}
        onSelect={(value) => void setLanguage(value)}
        testID="language-sheet"
      />
      <OptionSheet<NavigationApp>
        isOpen={picker === 'navigation'}
        onClose={close}
        title={t('settings.navigation_app.title')}
        options={navigationOptions}
        selected={navigationApp}
        onSelect={setNavigationApp}
        testID="navigation-app-sheet"
      />
    </>
  );
};
