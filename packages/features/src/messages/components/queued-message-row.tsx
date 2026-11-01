import type { QueuedMessage } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Badge, BadgeText, HStack, Text, useThemeColors, VStack } from '@resgrid/ui';
import { CloudOff } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

export interface QueuedMessageRowProps {
  message: QueuedMessage;
}

/** A message composed on this device that the server has not accepted yet (offline), or refused (see Pending sync). */
export const QueuedMessageRow: React.FC<QueuedMessageRowProps> = ({ message }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const rejected = message.state === 'rejected';
  return (
    <VStack space="xs" className="mx-4 mb-2 rounded-lg border border-dashed border-outline-300 bg-background-0 p-4" testID={`queued-message-${message.localId}`}>
      <HStack space="sm" className="items-center justify-between">
        <HStack space="sm" className="flex-1 items-center">
          <View>
            <CloudOff size={16} color={rejected ? colors.error : colors.warning} />
          </View>
          <Text className="flex-1 font-semibold text-typography-900" numberOfLines={1}>
            {message.input.Title || t('messages.no_subject')}
          </Text>
        </HStack>
        <Badge action={rejected ? 'error' : 'warning'} size="sm">
          <BadgeText>{rejected ? t('messages.not_sent') : t('messages.waiting_to_send')}</BadgeText>
        </Badge>
      </HStack>
      <Text size="sm" className="text-typography-600" numberOfLines={2}>
        {message.input.Body ?? ''}
      </Text>
      <Text size="xs" className="text-typography-500">
        {t('messages.recipients_count', { count: (message.input.Recipients ?? []).length })}
      </Text>
    </VStack>
  );
};
