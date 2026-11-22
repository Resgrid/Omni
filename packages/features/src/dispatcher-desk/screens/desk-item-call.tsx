import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useDispatcherDeskStore } from '@resgrid/data';
import { type CallFormCreated, CallFormScreen, type CallFormValues } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import { DispatcherMessageDirection, type DispatcherQueueItemData, type DispatcherQueueItemDetailData } from '@resgrid/models';
import { Loading, useToast, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams } from 'expo-router';
import { Headset } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useIsDispatcherDeskEnabled } from '../hooks/use-dispatcher-desk';
import { kindLabelKey } from '../lib/desk-format';

type Translate = (key: string, options?: Record<string, string | number>) => string;

/** The longest nature a conversation fills in (the call form's own limit is the server's). */
const MAX_NATURE_LENGTH = 4000;

/**
 * What a call created from a desk conversation starts with: the caller's inbound messages (oldest first) as the nature,
 * the sender as the contact (name and number or address), and a name saying where it came from.
 */
export const callPrefillFromItem = (item: DispatcherQueueItemData, detail: DispatcherQueueItemDetailData | null, t: Translate): Partial<CallFormValues> => {
  const inbound = (detail?.Messages ?? []).filter((message) => message.Direction === DispatcherMessageDirection.Inbound && message.Body?.trim()).map((message) => message.Body?.trim() ?? '');
  const nature = (inbound.length > 0 ? inbound.join('\n') : (item.Preview ?? '')).slice(0, MAX_NATURE_LENGTH);
  const source = item.SourceName?.trim() || item.SourceAddress?.trim() || '';

  return {
    name: item.Subject?.trim() || t('dispatcher_desk.create_call.name', { kind: t(kindLabelKey(item.Kind)), source }),
    nature,
    contactName: item.SourceName?.trim() ?? '',
    contactInfo: item.SourceAddress?.trim() ?? '',
  };
};

/**
 * "Create call from conversation" (`/desk/item/[id]/call`): the new-call form, prefilled from the item's conversation.
 * Once the call is saved it is linked to the item (the item then shows it, and completing it can say a call was created).
 */
export default function DeskItemCallScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const enabled = useIsDispatcherDeskEnabled();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  const itemId = raw && isSafeRouteId(raw) ? raw : null;
  const detail = useDispatcherDeskStore((state) => (itemId ? (state.items[itemId] ?? null) : null));
  const queued = useDispatcherDeskStore((state) => (itemId ? (state.desk?.Queue.find((entry) => entry.DispatcherQueueItemId === itemId) ?? null) : null));
  const item = queued ?? detail?.Item ?? null;
  // The form starts once, from the conversation as read now: wait for that read (or its failure) first.
  const [readDone, setReadDone] = useState(detail !== null);
  const prefill = useMemo(() => (item && (readDone || detail) ? callPrefillFromItem(item, detail, t) : null), [detail, item, readDone, t]);

  useEffect(() => {
    if (!itemId) return undefined;
    let live = true;

    void useDispatcherDeskStore
      .getState()
      .fetchItem(itemId, { bypassCache: true })
      .finally(() => {
        if (live) setReadDone(true);
      });

    return () => {
      live = false;
    };
  }, [itemId]);

  const onCreated = useCallback(
    (created: CallFormCreated) => {
      if (!itemId) return;
      const callId = created.callId ? Number(created.callId) : NaN;

      if (!Number.isSafeInteger(callId) || callId <= 0) {
        toast.info(t('dispatcher_desk.create_call.link_later'));

        return;
      }

      void useDispatcherDeskStore
        .getState()
        .linkCall(itemId, callId)
        .then((outcome) => {
          if (outcome.ok) toast.success(t('dispatcher_desk.create_call.linked'));
          else toast.warning(t('dispatcher_desk.create_call.link_failed'));
        });
    },
    [itemId, t, toast]
  );

  if (!enabled) return <ZeroState heading={t('dispatcher_desk.not_available')} icon={Headset} testID="desk-item-call-disabled" />;

  if (!itemId) return <ZeroState isError heading={t('dispatcher_desk.item.not_found')} testID="desk-item-call-invalid" />;

  if (!prefill) {
    return !readDone ? (
      <Loading text={t('dispatcher_desk.item.loading')} />
    ) : (
      <ZeroState heading={t('dispatcher_desk.item.not_found')} onRetry={() => useDispatcherDeskStore.getState().fetchItem(itemId, { bypassCache: true })} testID="desk-item-call-missing" />
    );
  }

  return <CallFormScreen mode="create" prefill={prefill} onCreated={onCreated} />;
}
