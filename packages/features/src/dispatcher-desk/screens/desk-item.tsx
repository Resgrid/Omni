import { replaceRoutePath } from '@resgrid/core/navigation/route-paths';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useDispatcherDeskStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { BottomAnchoredKeyboardView, ScreenHeader, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Headset } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { View } from 'react-native';

import { DeskItemDetail } from '../components/item-detail';
import { useIsDispatcherDeskEnabled } from '../hooks/use-dispatcher-desk';
import { itemTitle, kindLabelKey } from '../lib/desk-format';
import { dispatcherDeskRoutes } from '../routes';

/**
 * One piece of desk work on its own screen (`/desk/item/[id]`, phones; a tablet shows it beside the queue): the call, the
 * conversation with its composer pinned above the keyboard, or the held phone call, and the actions for its state.
 * Finishing, releasing or handing it over goes back to the queue.
 */
export default function DeskItemScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const enabled = useIsDispatcherDeskEnabled();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  const itemId = raw && isSafeRouteId(raw) ? raw : null;
  const item = useDispatcherDeskStore((state) => (itemId ? (state.desk?.Queue.find((entry) => entry.DispatcherQueueItemId === itemId) ?? state.items[itemId]?.Item ?? null) : null));

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else replaceRoutePath(router, dispatcherDeskRoutes.desk());
  }, [router]);

  if (!enabled) return <ZeroState heading={t('dispatcher_desk.not_available')} icon={Headset} testID="desk-item-disabled" />;

  if (!itemId) return <ZeroState isError heading={t('dispatcher_desk.item.not_found')} testID="desk-item-invalid" />;

  return (
    <View className="flex-1 bg-background-50" testID="desk-item-screen">
      <ScreenHeader title={item ? itemTitle(item) || t(kindLabelKey(item.Kind)) : t('dispatcher_desk.item.title')} onBack={back} />
      <BottomAnchoredKeyboardView>
        <View className="flex-1 px-4 pt-3">
          <DeskItemDetail itemId={itemId} onLeave={back} />
        </View>
      </BottomAnchoredKeyboardView>
    </View>
  );
}
