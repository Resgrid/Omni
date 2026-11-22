import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { deskItemKey, selectMyWork, selectWaitingWork, useDispatcherDeskStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { DispatcherDeskMemberData, DispatcherQueueItemData } from '@resgrid/models';
import { BottomAnchoredKeyboardView, Button, ButtonText, FlatList, HStack, Loading, Pressable, RefreshControl, Spinner, TabBar, Text, useFormFactor, useThemeColors, VStack, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Coffee, Headset, RefreshCw } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { DeskItemDetail } from '../components/item-detail';
import { PlanBreakSheet, type PlanBreakTarget } from '../components/plan-break-sheet';
import { QueueItemRow } from '../components/queue-item-row';
import { TeamBoard } from '../components/team-board';
import { useDeskActions } from '../hooks/use-desk-actions';
import { useDispatcherDeskView, useIsDispatcherDeskEnabled, useNow } from '../hooks/use-dispatcher-desk';
import { openDeskSheet } from '../lib/desk-ui-store';
import { dispatcherDeskRoutes } from '../routes';

export type DeskTab = 'mine' | 'waiting' | 'recent' | 'team';

export interface DispatcherDeskScreenProps {
  /** In-content title row (default true; off when the shell header already titles the screen). */
  showHeader?: boolean;
}

const firstParam = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** Why the desk cannot be used, when it cannot. */
const DeskUnavailable: React.FC<{ onRetry: () => Promise<void> }> = ({ onRetry }) => {
  const { t } = useTranslation();
  const enabled = useIsDispatcherDeskEnabled();
  const unsupported = useDispatcherDeskStore((state) => state.unsupported);
  const desk = useDispatcherDeskStore((state) => state.desk);
  const error = useDispatcherDeskStore((state) => state.errors.desk ?? null);
  const loading = useDispatcherDeskStore((state) => state.loading.desk === true);

  if (!enabled) return <ZeroState heading={t('dispatcher_desk.not_available')} icon={Headset} testID="dispatcher-desk-disabled" />;

  if (unsupported) return <ZeroState heading={t('dispatcher_desk.unsupported')} description={t('dispatcher_desk.unsupported_description')} icon={Headset} testID="dispatcher-desk-unsupported" />;

  if (!desk && loading) return <Loading text={t('dispatcher_desk.loading')} />;

  if (!desk) return <ZeroState heading={t('common.errorOccurred')} description={error ? t(error.messageKey) : undefined} isError onRetry={onRetry} testID="dispatcher-desk-error" />;

  if (!desk.Enabled) return <ZeroState heading={t('dispatcher_desk.desk_off')} description={t('dispatcher_desk.desk_off_description')} icon={Headset} onRetry={onRetry} testID="dispatcher-desk-off" />;

  return <ZeroState heading={t('dispatcher_desk.not_dispatcher')} description={t('dispatcher_desk.not_dispatcher_description')} icon={Headset} onRetry={onRetry} testID="dispatcher-desk-not-dispatcher" />;
};

/**
 * The dispatcher desk (Dispatch, plan D5): the member's work (offered to them, then held), the shared queue anyone signed
 * in can take from, recent work and the team. A tablet or desktop shows the lists beside the picked item (the team when
 * none is picked); a phone shows the lists as tabs and opens an item on its own screen. A desk push (`?itemId=`) picks
 * its item; a break push (`?breakId=`) opens the breaks. Kept current by the desk's realtime pings.
 */
export default function DispatcherDeskScreen({ showHeader = true }: DispatcherDeskScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const { isPhone } = useFormFactor();
  const params = useLocalSearchParams<{ itemId?: string | string[]; breakId?: string | string[] }>();
  const linkedItemId = firstParam(params.itemId);
  const linkedBreakId = firstParam(params.breakId);
  const { desk, me, queue, isAvailable, isSignedIn } = useDispatcherDeskView();
  const recent = useDispatcherDeskStore((state) => state.recent);
  const actions = useDeskActions();
  const now = useNow(1000, isAvailable);
  const [tab, setTab] = useState<DeskTab>('mine');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [planTarget, setPlanTarget] = useState<PlanBreakTarget | null>(null);
  const split = !isPhone;
  const userId = me?.UserId ?? null;
  const mine = useMemo(() => selectMyWork(queue, userId), [queue, userId]);
  const waiting = useMemo(() => selectWaitingWork(queue), [queue]);

  const refresh = useCallback(async () => {
    setRefreshing(true);

    try {
      await useDispatcherDeskStore.getState().fetchDesk({ bypassCache: true });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void useDispatcherDeskStore.getState().fetchDesk({ bypassCache: true });
  }, []);

  // A push or link to an item: picked beside the lists on a tablet, opened on a phone.
  useEffect(() => {
    if (!linkedItemId || !isSafeRouteId(linkedItemId)) return;

    if (split) setSelectedId(linkedItemId);
    else pushRoutePath(router, dispatcherDeskRoutes.item(linkedItemId));
  }, [linkedItemId, router, split]);

  useEffect(() => {
    if (linkedBreakId) pushRoutePath(router, dispatcherDeskRoutes.breaks());
  }, [linkedBreakId, router]);

  const openItem = useCallback(
    (item: DispatcherQueueItemData) => {
      if (split) setSelectedId(item.DispatcherQueueItemId);
      else pushRoutePath(router, dispatcherDeskRoutes.item(item.DispatcherQueueItemId));
    },
    [router, split]
  );

  const take = useCallback(
    async (item: DispatcherQueueItemData) => {
      const outcome = await actions.run(() => useDispatcherDeskStore.getState().accept(item.DispatcherQueueItemId));

      if (outcome.ok) openItem(item);
    },
    [actions, openItem]
  );

  const planFor = useCallback((member: DispatcherDeskMemberData) => setPlanTarget({ userId: member.UserId, name: member.Name ?? member.UserId }), []);

  if (!isAvailable || !desk) {
    return (
      <View className="flex-1 bg-background-50 p-4" testID="dispatcher-desk-screen">
        <DeskUnavailable onRetry={refresh} />
      </View>
    );
  }

  const tabs: { key: DeskTab; label: string; badge?: number; testID: string }[] = [
    { key: 'mine', label: t('dispatcher_desk.queue.mine'), badge: mine.length, testID: 'desk-tab-mine' },
    { key: 'waiting', label: t('dispatcher_desk.queue.waiting'), badge: waiting.length, testID: 'desk-tab-waiting' },
    { key: 'recent', label: t('dispatcher_desk.queue.recent'), testID: 'desk-tab-recent' },
    ...(split ? [] : [{ key: 'team' as const, label: t('dispatcher_desk.team.title'), testID: 'desk-tab-team' }]),
  ];

  const listTab: DeskTab = split && tab === 'team' ? 'mine' : tab;
  const items = listTab === 'mine' ? mine : listTab === 'waiting' ? waiting : recent;
  const emptyKey = listTab === 'mine' ? 'dispatcher_desk.queue.mine_empty' : listTab === 'waiting' ? 'dispatcher_desk.queue.waiting_empty' : 'dispatcher_desk.queue.recent_empty';
  const busyKeys = actions.busyKeys;

  const header = showHeader ? (
    <HStack className="mb-3 items-center justify-between">
      <VStack className="mr-2 flex-1">
        <Text className="text-lg font-bold">{t('dispatcher_desk.title')}</Text>
        <Text size="xs" className={desk.BelowMinimum ? 'font-semibold text-error-700' : 'text-typography-500'} testID="desk-coverage-summary">
          {t('dispatcher_desk.team.summary', { available: desk.AvailableCount, onBreak: desk.OnBreakCount, onDuty: desk.OnDutyCount, minimum: desk.MinimumAvailable })}
        </Text>
      </VStack>
      <Pressable
        onPress={() => pushRoutePath(router, dispatcherDeskRoutes.breaks())}
        accessibilityRole="button"
        accessibilityLabel={t('dispatcher_desk.breaks.title')}
        className="mr-2 min-h-[44px] min-w-[44px] items-center justify-center"
        testID="desk-open-breaks"
      >
        <View>
          <Coffee size={20} color={colors.icon} />
        </View>
      </Pressable>
      <Pressable onPress={() => void refresh()} accessibilityRole="button" accessibilityLabel={t('common.refresh')} className="min-h-[44px] min-w-[44px] items-center justify-center" testID="desk-refresh">
        {refreshing ? (
          <Spinner size="small" />
        ) : (
          <View>
            <RefreshCw size={18} color={colors.icon} />
          </View>
        )}
      </Pressable>
    </HStack>
  ) : null;

  const signInPrompt = isSignedIn ? null : (
    <View className="mb-3 rounded-xl border border-info-300 bg-info-50 p-3" testID="desk-sign-in-prompt">
      <Text className="font-semibold text-info-800">{t('dispatcher_desk.sign_in.prompt_title')}</Text>
      <Text size="sm" className="mb-2 text-info-800">
        {t('dispatcher_desk.sign_in.prompt')}
      </Text>
      <Button size="md" className="self-start" onPress={() => openDeskSheet('signIn')} accessibilityLabel={t('dispatcher_desk.actions.sign_in')} testID="desk-sign-in-open">
        <ButtonText>{t('dispatcher_desk.actions.sign_in')}</ButtonText>
      </Button>
    </View>
  );

  const list = (
    <FlatList
      testID="desk-queue-list"
      data={items}
      keyExtractor={(item: DispatcherQueueItemData) => item.DispatcherQueueItemId}
      extraData={[now, selectedId, busyKeys]}
      renderItem={({ item }: { item: DispatcherQueueItemData }) => (
        <QueueItemRow
          item={item}
          userId={userId}
          now={now}
          isSelected={split ? item.DispatcherQueueItemId === selectedId : false}
          canTake={listTab === 'waiting' ? isSignedIn : false}
          isBusy={busyKeys.includes(deskItemKey(item.DispatcherQueueItemId))}
          onPress={openItem}
          onTake={(entry) => void take(entry)}
        />
      )}
      ListEmptyComponent={
        <Text size="sm" className="mt-4 text-center text-typography-500" testID="desk-queue-empty">
          {t(emptyKey)}
        </Text>
      }
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      contentContainerStyle={styles.list}
    />
  );

  const tabBar = <TabBar tabs={tabs} activeKey={split ? listTab : tab} onChange={(key) => setTab(key)} variant="segmented" scrollable={false} />;

  if (split) {
    return (
      <View className="flex-1 bg-background-50 px-4 pt-4" testID="dispatcher-desk-screen">
        {header}
        {signInPrompt}
        <BottomAnchoredKeyboardView>
          <HStack className="flex-1">
            <View style={styles.listPane} className="mr-4" testID="desk-list-pane">
              {tabBar}
              <View className="mt-2 flex-1">{list}</View>
            </View>
            <View className="flex-1 rounded-xl border border-outline-200 bg-background-50 p-3" testID="desk-detail-pane">
              {selectedId ? (
                <DeskItemDetail key={selectedId} itemId={selectedId} onLeave={() => setSelectedId(null)} />
              ) : (
                <ScrollView contentContainerStyle={styles.list}>
                  <Text className="mb-2 font-semibold text-typography-900">{t('dispatcher_desk.team.title')}</Text>
                  <TeamBoard onPlanBreaks={planFor} />
                </ScrollView>
              )}
            </View>
          </HStack>
        </BottomAnchoredKeyboardView>
        <PlanBreakSheet target={planTarget} onClose={() => setPlanTarget(null)} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background-50 px-4 pt-4" testID="dispatcher-desk-screen">
      {header}
      {signInPrompt}
      {tabBar}
      <View className="mt-2 flex-1">
        {tab === 'team' ? (
          <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
            <TeamBoard onPlanBreaks={planFor} />
          </ScrollView>
        ) : (
          list
        )}
      </View>
      <PlanBreakSheet target={planTarget} onClose={() => setPlanTarget(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24 },
  listPane: { width: '40%', minWidth: 300, maxWidth: 480 },
});
