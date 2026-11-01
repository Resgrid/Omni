import { ProtectedLabel } from '@resgrid/features/data-protection';
import { useTranslation } from '@resgrid/i18n';
import { Badge, BadgeText, HStack, Pressable, Text, useThemeColors, VStack } from '@resgrid/ui';
import { CheckSquare, Clock, Mail, MailOpen, Send, Square, User } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { formatSentOn, getMessageTypeAction, getMessageTypeKey, isMessageExpired, isWithheld, type MessageListItem } from '../lib/message-format';

export interface MessageCardProps {
  item: MessageListItem;
  isRead: boolean;
  isSelected?: boolean;
  /** Selection mode (long press): rows show a checkbox and a press toggles selection. */
  selectionMode?: boolean;
  onPress: (item: MessageListItem) => void;
  onLongPress?: (item: MessageListItem) => void;
}

/** An inbox or sent message: sender (or recipients for sent), time, type, subject and a preview; unread is bold with a dot. */
export const MessageCard: React.FC<MessageCardProps> = React.memo(({ item, isRead, isSelected = false, selectionMode = false, onPress, onLongPress }) => {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const { message, isOwn } = item;
  const expired = isMessageExpired(message.ExpiredOn);
  const sender = isOwn ? t('messages.sent') : message.IsSystem ? t('messages.system_sender') : message.SendingName || t('messages.unknown_sender');
  const recipients = message.Recipients ?? [];
  const unread = !isRead;
  const subjectWithheld = isWithheld(message.Subject);
  const bodyWithheld = isWithheld(message.Body);
  const StatusIcon = isOwn ? Send : unread ? Mail : MailOpen;
  const SelectIcon = isSelected ? CheckSquare : Square;
  return (
    <Pressable
      onPress={() => onPress(item)}
      onLongPress={onLongPress ? () => onLongPress(item) : undefined}
      accessibilityRole={selectionMode ? 'checkbox' : 'button'}
      accessibilityState={selectionMode ? { checked: isSelected } : undefined}
      accessibilityLabel={[sender, subjectWithheld ? t('data_protection.protected_value') : message.Subject || t('messages.no_subject'), unread ? t('messages.unread') : ''].filter((part) => !!part).join(', ')}
      accessibilityHint={selectionMode ? undefined : t('messages.open_hint')}
      testID={`message-card-${message.MessageId}`}
      className={`mx-4 mb-2 rounded-lg border bg-background-0 p-4 ${isSelected ? 'border-primary-500 bg-primary-50' : 'border-outline-200'} ${expired ? 'opacity-60' : ''}`}
    >
      <VStack space="sm">
        <HStack space="sm" className="items-center justify-between">
          <HStack space="sm" className="flex-1 items-center">
            {selectionMode ? (
              <View testID={`message-select-${message.MessageId}`}>
                <SelectIcon size={20} color={isSelected ? colors.primary : colors.icon} />
              </View>
            ) : null}
            <View style={styles.statusIcon} testID={unread ? 'message-unread-icon' : 'message-read-icon'}>
              <StatusIcon size={16} color={unread ? colors.primary : colors.textSubtle} />
              {unread ? <View style={StyleSheet.flatten([styles.unreadDot, { backgroundColor: colors.primary, borderColor: colors.background }])} /> : null}
            </View>
            <VStack className="flex-1">
              <Text className={unread ? 'font-bold text-typography-900' : 'font-medium text-typography-900'} numberOfLines={1}>
                {sender}
              </Text>
              <HStack space="xs" className="items-center">
                <View>
                  <Clock size={12} color={colors.textMuted} />
                </View>
                <Text size="xs" className="text-typography-500">
                  {formatSentOn(message, i18n.language)}
                </Text>
              </HStack>
            </VStack>
          </HStack>
          <Badge action={getMessageTypeAction(message.Type)} size="sm">
            <BadgeText>{t(getMessageTypeKey(message.Type))}</BadgeText>
          </Badge>
        </HStack>

        {subjectWithheld ? (
          <ProtectedLabel size="sm" testID={`message-subject-protected-${message.MessageId}`} />
        ) : (
          <Text className={unread ? 'font-bold text-typography-900' : 'font-semibold text-typography-900'} numberOfLines={1}>
            {message.Subject || t('messages.no_subject')}
          </Text>
        )}
        {bodyWithheld ? null : message.Body ? (
          <Text size="sm" className="text-typography-600" numberOfLines={2}>
            {message.Body}
          </Text>
        ) : null}

        {message.Responded || expired || recipients.length > 0 ? (
          <HStack space="sm" className="items-center">
            {message.Responded ? (
              <Badge action="success" variant="outline" size="sm">
                <BadgeText>{t('messages.responded')}</BadgeText>
              </Badge>
            ) : null}
            {expired ? (
              <Badge action="error" variant="outline" size="sm" testID={`message-expired-${message.MessageId}`}>
                <BadgeText>{t('messages.expired')}</BadgeText>
              </Badge>
            ) : null}
            {recipients.length > 0 ? (
              <HStack space="xs" className="items-center">
                <View>
                  <User size={12} color={colors.textMuted} />
                </View>
                <Text size="xs" className="text-typography-500">
                  {t('messages.recipients_count', { count: recipients.length })}
                </Text>
              </HStack>
            ) : null}
          </HStack>
        ) : null}
      </VStack>
    </Pressable>
  );
});

MessageCard.displayName = 'MessageCard';

const styles = StyleSheet.create({
  statusIcon: { padding: 4 },
  unreadDot: { position: 'absolute', top: 0, right: 0, width: 10, height: 10, borderRadius: 5, borderWidth: 1 },
});
