import { useTranslation } from '@resgrid/i18n';
import { ChatFlagReason, type ChatMessageResultData, ChatMessageType } from '@resgrid/models';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper, ActionsheetItem, ActionsheetItemText, HStack, Pressable, Text } from '@resgrid/ui';
import { Copy, Flag, Pencil, Pin, PinOff, ShieldX, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🙏', '🔥', '✅'] as const;

export interface MessageActionsSheetProps {
  message: ChatMessageResultData | null;
  isOpen: boolean;
  onClose: () => void;
  isOwn: boolean;
  isModerator: boolean;
  /**
   * Point-in-time record (a closed incident's chat): reactions, edits and self-deletes go away; copy, flagging and
   * moderator delete stay.
   */
  frozen?: boolean;
  onReact?: (message: ChatMessageResultData, emoji: string) => void;
  onCopy?: (message: ChatMessageResultData) => void;
  onEdit?: (message: ChatMessageResultData) => void;
  onDelete?: (message: ChatMessageResultData) => void;
  onFlag?: (message: ChatMessageResultData, reason: number) => void;
  onTogglePin?: (message: ChatMessageResultData, pinned: boolean) => void;
  onModeratorDelete?: (message: ChatMessageResultData) => void;
}

/** Long-press actions on a message (IC baseline): quick reactions, copy, edit, delete, pin, report, moderator delete. */
export function MessageActionsSheet({ message, isOpen, onClose, isOwn, isModerator, frozen = false, onReact, onCopy, onEdit, onDelete, onFlag, onTogglePin, onModeratorDelete }: MessageActionsSheetProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'actions' | 'flag'>('actions');

  const close = () => {
    setMode('actions');
    onClose();
  };
  const act = (handler: (() => void) | undefined) => () => {
    handler?.();
    close();
  };

  if (!message) return null;
  const isDeleted = !!message.DeletedOn;
  const isText = message.MessageType === ChatMessageType.Text;
  // Assistant replies are Bot messages: copying an answer is the action people want most (legacy offered Text only).
  const isCopyable = isText || message.MessageType === ChatMessageType.Bot;
  const isPinned = !!message.PinnedOn;
  const flagReasons = [
    { reason: ChatFlagReason.Inappropriate, key: 'chat.flag_inappropriate' },
    { reason: ChatFlagReason.Harassment, key: 'chat.flag_harassment' },
    { reason: ChatFlagReason.Spam, key: 'chat.flag_spam' },
    { reason: ChatFlagReason.SensitiveInformation, key: 'chat.flag_sensitive' },
    { reason: ChatFlagReason.PolicyViolation, key: 'chat.flag_policy' },
    { reason: ChatFlagReason.Other, key: 'chat.flag_other' },
  ];

  return (
    <Actionsheet isOpen={isOpen} onClose={close}>
      <ActionsheetBackdrop />
      <ActionsheetContent testID="message-actions-sheet">
        <ActionsheetDragIndicatorWrapper>
          <ActionsheetDragIndicator />
        </ActionsheetDragIndicatorWrapper>
        {mode === 'flag' ? (
          <>
            <Text className="w-full px-4 py-2 text-sm font-semibold text-typography-500">{t('chat.flag_reason')}</Text>
            {flagReasons.map((item) => (
              <ActionsheetItem key={item.reason} onPress={act(() => onFlag?.(message, item.reason))} testID={`message-flag-${item.reason}`}>
                <ActionsheetItemText>{t(item.key)}</ActionsheetItemText>
              </ActionsheetItem>
            ))}
          </>
        ) : (
          <>
            {!isDeleted && !frozen && onReact ? (
              <HStack className="w-full justify-around px-2 py-3" space="sm">
                {QUICK_REACTIONS.map((emoji) => (
                  <Pressable key={emoji} className="p-1" onPress={act(() => onReact(message, emoji))} accessibilityRole="button" accessibilityLabel={emoji} testID={`message-react-${emoji}`}>
                    <Text className="text-2xl">{emoji}</Text>
                  </Pressable>
                ))}
              </HStack>
            ) : null}
            {isCopyable && !isDeleted && onCopy ? (
              <ActionsheetItem onPress={act(() => onCopy(message))} testID="message-action-copy">
                <Copy size={18} color="#6b7280" />
                <ActionsheetItemText>{t('chat.copy')}</ActionsheetItemText>
              </ActionsheetItem>
            ) : null}
            {isOwn && isText && !isDeleted && !frozen && onEdit ? (
              <ActionsheetItem onPress={act(() => onEdit(message))} testID="message-action-edit">
                <Pencil size={18} color="#6b7280" />
                <ActionsheetItemText>{t('chat.edit')}</ActionsheetItemText>
              </ActionsheetItem>
            ) : null}
            {isOwn && !isDeleted && !frozen && onDelete ? (
              <ActionsheetItem onPress={act(() => onDelete(message))} testID="message-action-delete">
                <Trash2 size={18} color="#dc2626" />
                <ActionsheetItemText>{t('chat.delete')}</ActionsheetItemText>
              </ActionsheetItem>
            ) : null}
            {isModerator && onTogglePin ? (
              <ActionsheetItem onPress={act(() => onTogglePin(message, !isPinned))} testID="message-action-pin">
                {isPinned ? <PinOff size={18} color="#6b7280" /> : <Pin size={18} color="#6b7280" />}
                <ActionsheetItemText>{isPinned ? t('chat.unpin') : t('chat.pin')}</ActionsheetItemText>
              </ActionsheetItem>
            ) : null}
            {!isOwn && !isDeleted && onFlag ? (
              <ActionsheetItem onPress={() => setMode('flag')} testID="message-action-flag">
                <Flag size={18} color="#6b7280" />
                <ActionsheetItemText>{t('chat.flag')}</ActionsheetItemText>
              </ActionsheetItem>
            ) : null}
            {isModerator && !isDeleted && onModeratorDelete ? (
              <ActionsheetItem onPress={act(() => onModeratorDelete(message))} testID="message-action-moderator-delete">
                <ShieldX size={18} color="#dc2626" />
                <ActionsheetItemText>{t('chat.moderator_delete')}</ActionsheetItemText>
              </ActionsheetItem>
            ) : null}
          </>
        )}
      </ActionsheetContent>
    </Actionsheet>
  );
}
