import { endSharedShift, lockSharedSession, useSharedSessionStore } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text, View, VStack } from '@resgrid/ui';
import { Lock, UserCog } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ConfirmDialog } from './confirm-dialog';

export interface SharedSessionCardProps {
  buttonMinHeight?: number;
  iconSize?: number;
  testID?: string;
}

const formatTime = (epochMs: number): string => {
  try {
    return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

/**
 * The shared vehicle session on the console (variant `auth.sharedDevice`, shown only while the server says this session
 * is shared): who is signed in, when the shift ends, and the crew's own Lock and Switch operator actions. The lock screen
 * and unlock flows live in `@resgrid/features/auth-ui` and the session rules in `@resgrid/auth`.
 */
export const SharedSessionCard: React.FC<SharedSessionCardProps> = ({ buttonMinHeight = 48, iconSize = 18, testID = 'unit-shared-session' }) => {
  const { t } = useTranslation();
  const auth = useCapability('auth');
  const shared = useSharedSessionStore((state) => state.shared);
  const operator = useSharedSessionStore((state) => state.operator);
  const label = useSharedSessionStore((state) => state.installationLabel);
  const shiftEndsAt = useSharedSessionStore((state) => state.shiftEndsAt);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  if (!auth.sharedDevice || !shared) return null;

  const switchOperator = async () => {
    setIsBusy(true);
    try {
      await endSharedShift(true);
    } finally {
      setIsBusy(false);
      setIsConfirmOpen(false);
    }
  };

  return (
    <VStack space="sm" className="rounded-xl border border-outline-100 bg-background-50 p-3" testID={testID}>
      <Text className="text-xs font-semibold uppercase text-typography-500">{label ? t('shared_session.bar_label', { label }) : t('shared_session.bar')}</Text>
      {operator ? <Text className="text-sm text-typography-900">{t('shared_session.locked_operator', { operator })}</Text> : null}
      {shiftEndsAt ? <Text className="text-xs text-typography-500">{t('shared_session.shift_ends_soon', { time: formatTime(shiftEndsAt) })}</Text> : null}
      <HStack space="sm">
        <Pressable
          onPress={() => void lockSharedSession('explicit')}
          accessibilityRole="button"
          accessibilityLabel={t('shared_session.lock')}
          testID={`${testID}-lock`}
          className="flex-1 flex-row items-center justify-center rounded-lg border border-outline-200 bg-background-0"
          style={{ minHeight: buttonMinHeight }}
        >
          <View style={styles.icon}>
            <Lock size={iconSize} color="#2563eb" />
          </View>
          <Text className="font-medium text-typography-900">{t('shared_session.lock')}</Text>
        </Pressable>
        <Pressable
          onPress={() => setIsConfirmOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('shared_session.switch_operator')}
          testID={`${testID}-switch`}
          className="flex-1 flex-row items-center justify-center rounded-lg border border-outline-200 bg-background-0"
          style={{ minHeight: buttonMinHeight }}
        >
          <View style={styles.icon}>
            <UserCog size={iconSize} color="#2563eb" />
          </View>
          <Text className="font-medium text-typography-900">{t('shared_session.switch_operator')}</Text>
        </Pressable>
      </HStack>
      <ConfirmDialog
        isOpen={isConfirmOpen}
        title={t('shared_session.switch_operator')}
        message={t('unit_status.switch_operator_body')}
        confirmLabel={t('shared_session.switch_operator')}
        cancelLabel={t('common.cancel')}
        isBusy={isBusy}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => void switchOperator()}
        testID={`${testID}-switch-dialog`}
      />
    </VStack>
  );
};

const styles = StyleSheet.create({
  icon: { marginRight: 6 },
});
