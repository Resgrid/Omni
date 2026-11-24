import { useTranslation } from '@resgrid/i18n';
import { HStack, Text, useThemeColors, View } from '@resgrid/ui';
import { AlertTriangle } from 'lucide-react-native';
import React from 'react';

/**
 * The "never include PII or PHI" notice shown directly above a text box whose content is sent to an AI model (the
 * assistant). Same wording as Core's web prompts (`Common.AiPromptPiiWarning`, decision 2026-11-23).
 */
export const AiPromptWarning: React.FC = () => {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <HStack space="sm" className="mb-2 items-start rounded-lg border border-warning-300 bg-background-warning px-3 py-2" accessibilityRole="alert" testID="ai-prompt-warning">
      <View className="pt-0.5">
        <AlertTriangle size={14} color={colors.warning} />
      </View>
      <Text size="xs" className="shrink text-warning-800">
        {t('chatbot.pii_warning')}
      </Text>
    </HStack>
  );
};
