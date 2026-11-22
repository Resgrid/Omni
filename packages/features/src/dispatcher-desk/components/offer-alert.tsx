import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { parseUtcMs } from '@resgrid/core/utils/dates';
import { deskItemKey, useDispatcherDeskStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { DispatcherQueueItemData } from '@resgrid/models';
import { Box, Button, ButtonSpinner, ButtonText, Heading, HStack, NativeModal, Text, useFormFactor, useThemeColors, VStack } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useDeskActions } from '../hooks/use-desk-actions';
import { useNow } from '../hooks/use-dispatcher-desk';
import { formatCountdown, itemPreview, itemTitle, kindIcon, kindLabelKey } from '../lib/desk-format';
import { dispatcherDeskRoutes } from '../routes';

export interface OfferAlertProps {
  offer: DispatcherQueueItemData | null;
  /** Offers waiting behind this one. */
  moreOffers?: number;
}

/**
 * Work offered to the member (plan D5): a prominent card over everything — what it is, who it came from, a preview and
 * the time left to answer — with Accept and Decline. It stays until the member answers or the offer runs out (it then
 * goes to the next dispatcher, and the desk may set the member Away after missed offers). Accepting opens the item.
 */
export const OfferAlert: React.FC<OfferAlertProps> = ({ offer, moreOffers = 0 }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const { isPhone } = useFormFactor();
  const actions = useDeskActions();
  const now = useNow(1000, offer !== null);
  const busy = useDispatcherDeskStore((state) => (offer ? state.busyKeys.includes(deskItemKey(offer.DispatcherQueueItemId)) : false));

  if (!offer) return null;
  const Icon = kindIcon(offer.Kind);
  const expires = parseUtcMs(offer.OfferExpiresOn);
  const left = expires === null ? null : Math.max(0, expires - now);
  const title = itemTitle(offer) || t(kindLabelKey(offer.Kind));
  const id = offer.DispatcherQueueItemId;

  const accept = async () => {
    const outcome = await actions.run(() => useDispatcherDeskStore.getState().accept(id));

    if (outcome.ok) pushRoutePath(router, isPhone ? dispatcherDeskRoutes.item(id) : dispatcherDeskRoutes.deskWithItem(id));
  };

  return (
    <NativeModal visible transparent animationType="fade" onRequestClose={() => undefined} testID="desk-offer-alert">
      <View style={styles.backdrop} />
      <Box className="flex-1 items-center justify-center p-4" pointerEvents="box-none">
        <Box className="w-full max-w-md rounded-2xl border-2 border-warning-400 bg-background-0 p-5" accessibilityViewIsModal accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <VStack space="md">
            <HStack space="sm" className="items-center">
              <View className="rounded-full bg-warning-100 p-2">
                <Icon size={22} color={colors.warning} />
              </View>
              <VStack className="flex-1">
                <Text size="xs" className="font-semibold uppercase text-warning-800">
                  {t('dispatcher_desk.offer.title')}
                </Text>
                <Heading size="md" numberOfLines={2} testID="desk-offer-title">
                  {title}
                </Heading>
              </VStack>
            </HStack>
            <Text size="sm" className="text-typography-600">
              {t(kindLabelKey(offer.Kind))}
              {offer.SourceAddress && offer.SourceAddress !== title ? ` · ${offer.SourceAddress}` : ''}
            </Text>
            {itemPreview(offer) ? (
              <Text className="text-typography-900" numberOfLines={4} testID="desk-offer-preview">
                {itemPreview(offer)}
              </Text>
            ) : null}
            {left !== null ? (
              <Text size="sm" className={`font-semibold ${left <= 10000 ? 'text-error-700' : 'text-typography-700'}`} testID="desk-offer-countdown">
                {t('dispatcher_desk.offer.expires_in', { time: formatCountdown(left) })}
              </Text>
            ) : null}
            {moreOffers > 0 ? (
              <Text size="xs" className="text-typography-500">
                {t('dispatcher_desk.offer.more', { count: moreOffers })}
              </Text>
            ) : null}
            <HStack space="sm">
              <Button
                variant="outline"
                action="secondary"
                size="lg"
                className="flex-1"
                onPress={() => void actions.run(() => useDispatcherDeskStore.getState().decline(id))}
                isDisabled={busy}
                accessibilityLabel={t('dispatcher_desk.offer.decline')}
                testID="desk-offer-decline"
              >
                <ButtonText>{t('dispatcher_desk.offer.decline')}</ButtonText>
              </Button>
              <Button size="lg" className="flex-1" onPress={() => void accept()} isDisabled={busy} accessibilityLabel={t('dispatcher_desk.offer.accept')} testID="desk-offer-accept">
                {busy ? <ButtonSpinner /> : <ButtonText>{t('dispatcher_desk.offer.accept')}</ButtonText>}
              </Button>
            </HStack>
          </VStack>
        </Box>
      </Box>
    </NativeModal>
  );
};

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
});
