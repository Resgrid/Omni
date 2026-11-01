import { type Language, useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text, useThemeColors } from '@resgrid/ui';
import { ChevronDown, Globe } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { LANGUAGE_AUTONYMS, LANGUAGE_LABEL_KEYS, LANGUAGE_ORDER, useLanguagePreference } from '../lib/languages';
import { OptionSheet } from './option-sheet';

/** The login screen's language selector (Responder): the current language in its own name, opening the list of ten. */
export const LanguagePicker: React.FC<{ testID?: string }> = ({ testID = 'login-language' }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { language, setLanguage } = useLanguagePreference();
  const [open, setOpen] = useState(false);
  const options = useMemo(() => LANGUAGE_ORDER.map((value) => ({ value, label: LANGUAGE_AUTONYMS[value], description: t(LANGUAGE_LABEL_KEYS[value]) })), [t]);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${t('settings.language')}: ${LANGUAGE_AUTONYMS[language]}`}
        accessibilityHint={t('login.language_hint')}
        testID={`${testID}-trigger`}
        className="self-center p-2"
      >
        <HStack space="xs" className="items-center">
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Globe size={16} color={colors.textMuted} />
          </View>
          <Text size="sm" className="text-typography-500">
            {t('settings.language')}:
          </Text>
          <Text size="sm" className="font-medium text-typography-700">
            {LANGUAGE_AUTONYMS[language]}
          </Text>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ChevronDown size={14} color={colors.textMuted} />
          </View>
        </HStack>
      </Pressable>
      <OptionSheet<Language> isOpen={open} onClose={() => setOpen(false)} title={t('settings.language')} options={options} selected={language} onSelect={(value) => void setLanguage(value)} testID={`${testID}-sheet`} />
    </>
  );
};
