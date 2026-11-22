import { parseUtcMs } from '@resgrid/core/utils/dates';
import { isOfferedTo, isWaitingInQueue } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type DispatcherQueueItemData, DispatcherQueueItemState } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, HStack, Pressable, Text, useThemeColors, VStack } from '@resgrid/ui';
import React from 'react';
import { View } from 'react-native';

import { formatCountdown, itemPreview, itemStateLabelKey, itemStateTone, itemTitle, kindIcon, kindLabelKey, waitingMs, wholeMinutes } from '../lib/desk-format';
import { DeskPill } from './desk-pill';

export interface QueueItemRowProps {
  item: DispatcherQueueItemData;
  userId: string | null;
  now: number;
  isSelected?: boolean;
  /** Waiting work: anyone signed in can take it. */
  canTake?: boolean;
  isBusy?: boolean;
  onPress: (item: DispatcherQueueItemData) => void;
  onTake?: (item: DispatcherQueueItemData) => void;
}

/**
 * One piece of desk work: what it is (icon and kind), who or what it is about, a preview, its state (offered with the
 * time left to answer, held by whom), how long it has waited and the unread count. Waiting work has a Take button.
 */
export const QueueItemRow: React.FC<QueueItemRowProps> = ({ item, userId, now, isSelected = false, canTake = false, isBusy = false, onPress, onTake }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const Icon = kindIcon(item.Kind);
  const title = itemTitle(item) || t(kindLabelKey(item.Kind));
  const offeredToMe = isOfferedTo(item, userId);
  const expires = parseUtcMs(item.OfferExpiresOn);
  const heldByOther = item.State === DispatcherQueueItemState.Accepted && item.AssignedUserId !== userId;
  const stateLabel = offeredToMe && expires !== null ? t('dispatcher_desk.offer.expires_in', { time: formatCountdown(expires - now) }) : t(itemStateLabelKey(item.State));
  const waited = wholeMinutes(waitingMs(item, now));
  const preview = itemPreview(item);

  return (
    <HStack className={`mb-2 items-center rounded-xl border p-3 ${isSelected ? 'border-primary-500 bg-primary-50' : offeredToMe ? 'border-warning-400 bg-background-warning' : 'border-outline-200 bg-background-0'}`}>
      <Pressable
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={`${t(kindLabelKey(item.Kind))}: ${title}`}
        className="flex-1 flex-row items-start"
        testID={`desk-item-${item.DispatcherQueueItemId}`}
      >
        <View className="mr-2 mt-0.5">
          <Icon size={18} color={offeredToMe ? colors.warning : colors.icon} />
        </View>
        <VStack className="flex-1">
          <HStack className="items-center justify-between">
            <Text className="mr-2 shrink font-semibold text-typography-900" numberOfLines={1}>
              {title}
            </Text>
            {item.UnreadCount > 0 ? (
              <View className="rounded-full bg-error-500 px-1.5" testID={`desk-item-${item.DispatcherQueueItemId}-unread`}>
                <Text size="xs" className="font-bold text-typography-0">
                  {item.UnreadCount > 99 ? '99+' : String(item.UnreadCount)}
                </Text>
              </View>
            ) : null}
          </HStack>
          {preview ? (
            <Text size="sm" className="text-typography-600" numberOfLines={2}>
              {preview}
            </Text>
          ) : null}
          <HStack space="xs" className="mt-1 flex-wrap items-center">
            <DeskPill label={stateLabel} tone={offeredToMe ? 'warning' : itemStateTone(item.State)} />
            {heldByOther && item.AssignedUserName ? (
              <Text size="xs" className="text-typography-500" numberOfLines={1}>
                {t('dispatcher_desk.queue.held_by', { name: item.AssignedUserName })}
              </Text>
            ) : null}
            {item.CallerWaiting ? <DeskPill label={t('dispatcher_desk.voice.caller_waiting')} tone="error" /> : null}
            {item.EscalatedOn && isWaitingInQueue(item) ? <DeskPill label={t('dispatcher_desk.queue.escalated')} tone="error" /> : null}
            <Text size="xs" className="text-typography-500">
              {t('dispatcher_desk.queue.waited', { minutes: waited })}
            </Text>
          </HStack>
        </VStack>
      </Pressable>
      {canTake && onTake ? (
        <Button size="sm" onPress={() => onTake(item)} isDisabled={isBusy} accessibilityLabel={t('dispatcher_desk.queue.take')} className="ml-2 min-h-[40px]" testID={`desk-item-${item.DispatcherQueueItemId}-take`}>
          {isBusy ? <ButtonSpinner /> : <ButtonText>{t('dispatcher_desk.queue.take')}</ButtonText>}
        </Button>
      ) : null}
    </HStack>
  );
};
