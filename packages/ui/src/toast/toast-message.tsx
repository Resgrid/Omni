import React from 'react';
import { Pressable } from 'react-native';

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

  const handleDismiss = () => removeToast(id);

  // The dismiss button sits beside the toast's own button, not inside it: on the web a button inside a button is invalid
  // markup. The toast's padding moves onto the two of them, so its whole surface stays pressable.
  // typography-0 flips against the toast backgrounds (dark in light mode, pastel in dark mode); a fixed white vanishes in dark mode.
  return (
    <Toast className="w-full rounded-lg border p-0" action={type}>
      <HStack className="items-start justify-between" space="md">
        <Pressable
          accessibilityRole={onPress ? 'button' : 'alert'}
          accessibilityLiveRegion="polite"
          className="min-w-0 flex-1 py-4 pl-4"
          onPress={onPress ? handlePress : undefined}
          disabled={!onPress}
          testID={`toast-message-${id}`}
        >
          <VStack space="xs">
            {title ? <ToastTitle className="font-medium">{title}</ToastTitle> : null}
            <ToastDescription className="text-typography-0">{message}</ToastDescription>
          </VStack>
        </Pressable>
        <Pressable accessibilityLabel={t('common.dismiss', { defaultValue: 'Dismiss' })} accessibilityRole="button" className="mr-4 mt-4 p-1" hitSlop={8} onPress={handleDismiss} testID={`toast-dismiss-${id}`}>
          <X className="text-typography-0" size={18} />
        </Pressable>
      </HStack>
    </Toast>
  );
};
