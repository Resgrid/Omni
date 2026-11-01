import { safeFormatDate } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, CustomBottomSheet, HStack, ScrollView, Text, VStack } from '@resgrid/ui';
import React from 'react';

import { inboxDetailEntries, type InboxItem, inboxTargetOf } from '../lib/inbox-item';

export interface NotificationDetailSheetProps {
  item: InboxItem | null;
  onClose: () => void;
  onOpenTarget: (item: InboxItem) => void;
}

/** An inbox entry in full (Responder NotificationDetail): subject, body, time, extra data and "Open" when it points somewhere safe. */
export const NotificationDetailSheet: React.FC<NotificationDetailSheetProps> = ({ item, onClose, onOpenTarget }) => {
  const { t } = useTranslation();
  const target = item ? inboxTargetOf(item) : null;
  const entries = item ? inboxDetailEntries(item) : [];

  return (
    <CustomBottomSheet isOpen={!!item} onClose={onClose} snapPoints={[60]} testID="notification-detail-sheet">
      {item ? (
        <VStack space="md" className="w-full flex-1">
          <Text className="text-lg font-bold text-typography-900">{item.subject || t('notifications.detail_title')}</Text>
          <Text className="text-xs text-typography-400">{safeFormatDate(item.createdAt, 'MMM d, yyyy h:mm a', '')}</Text>
          <ScrollView className="flex-1">
            <Text className="text-base text-typography-900">{item.body}</Text>
            {entries.length > 0 ? (
              <VStack className="mt-4" space="xs">
                <Text className="text-sm font-semibold text-typography-700">{t('notifications.additional_info')}</Text>
                {entries.map(([key, value]) => (
                  <HStack key={key} space="sm">
                    <Text className="text-sm text-typography-500">{key}</Text>
                    <Text className="flex-1 text-sm text-typography-900">{value}</Text>
                  </HStack>
                ))}
              </VStack>
            ) : null}
          </ScrollView>
          <HStack space="md">
            <Button variant="outline" action="secondary" className="flex-1" onPress={onClose}>
              <ButtonText>{t('common.close')}</ButtonText>
            </Button>
            {target ? (
              <Button className="flex-1" onPress={() => onOpenTarget(item)} testID="notification-detail-open">
                <ButtonText>{t('notifications.open_reference')}</ButtonText>
              </Button>
            ) : null}
          </HStack>
        </VStack>
      ) : null}
    </CustomBottomSheet>
  );
};
