import { safeFormatDate } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text, useThemeColors, View, VStack } from '@resgrid/ui';
import { CheckSquare, ChevronRight, ExternalLink, Square } from 'lucide-react-native';
import React from 'react';

import { type InboxItem, inboxTargetOf } from '../lib/inbox-item';

export interface NotificationRowProps {
  item: InboxItem;
  onPress: (item: InboxItem) => void;
  /** Long press starts selecting (mark read / delete several at once). */
  onLongPress?: (item: InboxItem) => void;
  /** While selecting, a press toggles the row instead of opening it. */
  selectionMode?: boolean;
  isSelected?: boolean;
}

/**
 * One inbox entry (Responder inbox row): unread dot, subject/body, time, and an open marker when it points somewhere safe.
 * While selecting it is a checkbox instead.
 */
export const NotificationRow: React.FC<NotificationRowProps> = React.memo(({ item, onPress, onLongPress, selectionMode = false, isSelected = false }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const target = inboxTargetOf(item);
  const SelectIcon = isSelected ? CheckSquare : Square;
  const background = isSelected ? 'bg-primary-100' : item.isRead ? 'bg-background-0' : 'bg-primary-50';

  return (
    <Pressable
      testID={`notification-row-${item.id}`}
      onPress={() => onPress(item)}
      onLongPress={onLongPress ? () => onLongPress(item) : undefined}
      accessibilityRole={selectionMode ? 'checkbox' : 'button'}
      accessibilityState={selectionMode ? { checked: isSelected } : undefined}
      accessibilityLabel={item.isRead ? item.body : `${t('notifications.unread')}, ${item.body}`}
      className={`border-b border-outline-100 px-4 py-3 ${background}`}
    >
      <HStack space="md" className="items-center">
        {selectionMode ? (
          <View testID={`notification-select-${item.id}`}>
            <SelectIcon size={20} color={isSelected ? colors.primary : colors.icon} />
          </View>
        ) : null}
        {item.isRead ? <View className="size-2" /> : <View className="size-2 rounded-full bg-primary-500" testID={`notification-row-${item.id}-unread`} />}
        <VStack className="flex-1" space="xs">
          {item.subject ? <Text className={`text-sm ${item.isRead ? 'font-medium' : 'font-bold'} text-typography-900`}>{item.subject}</Text> : null}
          <Text className={`text-sm ${item.isRead ? 'text-typography-700' : 'text-typography-900'}`} numberOfLines={3}>
            {item.body}
          </Text>
          <Text className="text-xs text-typography-400">{safeFormatDate(item.createdAt, 'MMM d, yyyy h:mm a', '')}</Text>
        </VStack>
        {selectionMode ? null : <View>{target ? <ExternalLink size={18} color={colors.primary} /> : <ChevronRight size={18} color={colors.textSubtle} />}</View>}
      </HStack>
    </Pressable>
  );
});

NotificationRow.displayName = 'NotificationRow';
