import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text, Textarea, TextareaInput, View, VStack } from '@resgrid/ui';
import { AlertTriangle, Send } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';

export interface MessageComposerProps {
  onSend: (body: string, urgent: boolean) => void;
  /** Read-only channel (locked, archived or frozen incident chat). */
  disabled?: boolean;
  placeholder?: string;
  /** Editing an existing message: prefilled and sent through `onSend` as the new body. */
  initialValue?: string;
  /** Hides the urgent toggle (assistant, edits). */
  allowUrgent?: boolean;
  onCancelEdit?: () => void;
  maxLength?: number;
}

/**
 * The message composer (Responder baseline): multi-line input, urgent toggle, send. Sending clears the draft at once —
 * the message is queued through the outbox, so it shows as pending and is delivered when the connection allows.
 * Mounted inside a BottomAnchoredKeyboardView by the conversation screen.
 */
export const MessageComposer: React.FC<MessageComposerProps> = ({ onSend, disabled = false, placeholder, initialValue = '', allowUrgent = true, onCancelEdit, maxLength = 4000 }) => {
  const { t } = useTranslation();
  const [text, setText] = useState(initialValue);
  const [urgent, setUrgent] = useState(false);
  const canSend = !disabled && text.trim().length > 0;

  const send = useCallback(() => {
    if (!canSend) return;
    onSend(text.trim(), urgent);
    setText('');
    setUrgent(false);
  }, [canSend, onSend, text, urgent]);

  return (
    <VStack className="border-t border-outline-200 bg-background-0 px-3 py-2" testID="chat-composer">
      {urgent ? <Text className="mb-1 text-xs font-semibold text-error-600">{t('chat.urgent_will_send')}</Text> : null}
      {onCancelEdit ? (
        <HStack className="mb-1 items-center justify-between">
          <Text className="text-xs font-semibold text-typography-600">{t('chat.edit_message')}</Text>
          <Pressable onPress={onCancelEdit} accessibilityRole="button" testID="chat-composer-cancel-edit">
            <Text className="text-xs text-primary-600">{t('common.cancel')}</Text>
          </Pressable>
        </HStack>
      ) : null}
      <HStack space="sm" className="items-end">
        {allowUrgent && !onCancelEdit ? (
          <Pressable
            testID="chat-composer-urgent"
            onPress={() => setUrgent((value) => !value)}
            disabled={disabled}
            accessibilityRole="switch"
            accessibilityState={{ checked: urgent, disabled }}
            accessibilityLabel={t('chat.urgent')}
            className={`mb-1 size-9 items-center justify-center rounded-full ${urgent ? 'bg-error-500' : 'bg-background-100'}`}
          >
            <AlertTriangle size={16} color={urgent ? '#ffffff' : '#6b7280'} />
          </Pressable>
        ) : null}
        <View className="flex-1">
          <Textarea size="sm" className="max-h-32 min-h-[40px]" isDisabled={disabled}>
            <TextareaInput testID="chat-composer-input" value={text} onChangeText={setText} placeholder={placeholder ?? t('chat.type_a_message')} maxLength={maxLength} accessibilityLabel={t('chat.type_a_message')} />
          </Textarea>
        </View>
        <Pressable
          testID="chat-composer-send"
          onPress={send}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
          accessibilityLabel={onCancelEdit ? t('chat.save') : t('chat.send')}
          className={`mb-1 size-9 items-center justify-center rounded-full ${canSend ? 'bg-primary-500' : 'bg-background-200'}`}
        >
          <Send size={16} color="#ffffff" />
        </Pressable>
      </HStack>
    </VStack>
  );
};
