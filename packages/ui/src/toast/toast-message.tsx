import React from 'react';
import { type GestureResponderEvent, Pressable } from 'react-native';

import { HStack } from '../hstack';
import { X } from '../lucide-icons';
import { useTranslation } from '../utils/i18n';
import { VStack } from '../vstack';
import { Toast, ToastDescription, ToastTitle } from './primitive';
import { type ToastItem, useToastStore } from './store';

/**
 * One toast (IC UI): pressable when it has an action, always explicitly dismissible.
 *
 * Title and message are rendered verbatim — callers pass text already run through t(). Re-translating
 * here (as Unit/IC did) made i18next parse any text containing ':' as `namespace:key` and silently strip
 * the prefix (Responder's fix).
 */
export const ToastMessage: React.FC<ToastItem> = ({ id, type, title, message, onPress }) => {
  const { t } = useTranslation();
  const removeToast = useToastStore((state) => state.removeToast);

  const handlePress = () => {
    onPress?.();
    removeToast(id);
  };

  const handleDismiss = (event?: GestureResponderEvent) => {
    event?.stopPropagation?.();
    removeToast(id);
  };

  return (
    // typography-0 flips against the toast backgrounds (dark in light mode, pastel in dark mode); a fixed white vanishes in dark mode.
    <Pressable accessibilityRole={onPress ? 'button' : 'alert'} accessibilityLiveRegion="polite" className="w-full" onPress={onPress ? handlePress : undefined} disabled={!onPress} testID={`toast-message-${id}`}>
      <Toast className="w-full rounded-lg border" action={type}>
        <HStack className="items-start justify-between" space="md">
          <VStack className="min-w-0 flex-1" space="xs">
            {title ? <ToastTitle className="font-medium">{title}</ToastTitle> : null}
            <ToastDescription className="text-typography-0">{message}</ToastDescription>
          </VStack>
          <Pressable accessibilityLabel={t('common.dismiss', { defaultValue: 'Dismiss' })} accessibilityRole="button" className="p-1" hitSlop={8} onPress={handleDismiss} testID={`toast-dismiss-${id}`}>
            <X className="text-typography-0" size={18} />
          </Pressable>
        </HStack>
      </Toast>
    </Pressable>
  );
};
