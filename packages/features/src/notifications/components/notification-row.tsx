import { safeFormatDate } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text, View, VStack } from '@resgrid/ui';
import { ChevronRight, ExternalLink } from 'lucide-react-native';
import React from 'react';

import { type InboxItem, inboxTargetOf } from '../lib/inbox-item';

export interface NotificationRowProps {
  item: InboxItem;
  onPress: (item: InboxItem) => void;
}

/** One inbox entry (Responder inbox row): unread dot, subject/body, time, and an open marker when it points somewhere safe. */
export const NotificationRow: React.FC<NotificationRowProps> = React.memo(({ item, onPress }) => {
  const { t } = useTranslation();
  const target = inboxTargetOf(item);
  return (
    <Pressable
      testID={`notification-row-${item.id}`}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={item.isRead ? item.body : `${t('notifications.unread')}, ${item.body}`}
      className={`border-b border-outline-100 px-4 py-3 ${item.isRead ? 'bg-background-0' : 'bg-primary-50'}`}
    >
      <HStack space="md" className="items-center">
        {item.isRead ? <View className="size-2" /> : <View className="size-2 rounded-full bg-primary-500" testID={`notification-row-${item.id}-unread`} />}
        <VStack className="flex-1" space="xs">
          {item.subject ? <Text className={`text-sm ${item.isRead ? 'font-medium' : 'font-bold'} text-typography-900`}>{item.subject}</Text> : null}
          <Text className={`text-sm ${item.isRead ? 'text-typography-700' : 'text-typography-900'}`} numberOfLines={3}>
            {item.body}
          </Text>
          <Text className="text-xs text-typography-400">{safeFormatDate(item.createdAt, 'MMM d, yyyy h:mm a', '')}</Text>
        </VStack>
        {target ? <ExternalLink size={18} color="#3b82f6" /> : <ChevronRight size={18} color="#9ca3af" />}
      </HStack>
    </Pressable>
  );
});

NotificationRow.displayName = 'NotificationRow';
