import { useTranslation } from '@resgrid/i18n';
import { Pressable, Text, useThemeColors } from '@resgrid/ui';
import { Server } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { useLoginServer } from '../lib/login-server';

const BADGE_CLASS = 'flex-row items-center self-center rounded-full border border-outline-300 px-3 py-1.5';

/** Names the server the login form signs in to (US West, EU Central or Custom), so a wrong server is spotted before signing in. */
export const LoginServerBadge: React.FC<{ onPress?: () => void }> = ({ onPress }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { name } = useLoginServer();
  const label = t('login.server.signing_in_to', { server: name });

  const content = (
    <>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Server size={14} color={colors.textMuted} />
      </View>
      <Text className="ml-1.5 text-sm text-typography-600">
        {t('login.server.label')} <Text className="text-sm font-semibold text-typography-900">{name}</Text>
      </Text>
    </>
  );

  // Only a badge that does something is a button; a label stays a label for assistive technologies.
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={t('login.server.change_hint')} testID="login-server-badge" className={BADGE_CLASS}>
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={label} testID="login-server-badge" className={BADGE_CLASS}>
      {content}
    </View>
  );
};
