import { featureFlagsStore, isFieldRedacted, ProtectedFieldIds, useSecurity } from '@resgrid/auth';
import { getActiveVariant, useCapability } from '@resgrid/config';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { type QueuedCall, useCallDetailStore, useCallsStore, useCheckInTimersStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { useRealtimeRefetch } from '@resgrid/realtime';
import { Button, ButtonText, HtmlRenderer, Loading, Pressable, ScreenHeader, SharedTabs, type TabItem, Text, TypeIcon, useFormFactor, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { EllipsisVertical } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CallFilesModal, CallImagesModal, CallNotesModal } from '../components/call-media-modals';
import { CallMenu, type CallMenuAction, type CallMenuItem } from '../components/call-menu';
import { CloseCallSheet } from '../components/close-call-sheet';
import { ProtectedRevealBar } from '../components/detail/protected-reveal-bar';
import { QueuedCallBadge } from '../components/queued-call-badge';
import { registerBuiltInCallDetailTabs } from '../detail-tabs/built-in-tabs';
import { type CallDetailTabContext, resolveCallDetailTabs, useRegisteredCallDetailTabs } from '../detail-tabs/registry';
import { readableColors } from '../lib/call-colors';
import { resolvePriority } from '../lib/call-priority';
import { callCorrect, callEdit } from '../routes';

registerBuiltInCallDetailTabs();

export interface CallDetailScreenProps {
  /** Defaults to the `id` route param. */
  callId?: string;
  /** Map placeholder (the maps workstream renders the call location; never imported here). */
  mapSlot?: (call: CallResultData) => React.ReactNode;
  /** Extra menu entries from other modules (Dispatch escalate, Unit set-active-call…). */
  menuItems?: readonly CallMenuItem[];
  onMenuAction?: (action: CallMenuAction, call: CallResultData) => void;
  /** After the call is closed (default: navigate back). */
  onClosed?: () => void;
  showHeader?: boolean;
}

/** Realtime pings that can change an open call. */
const DETAIL_REFRESH_EVENTS = ['callsUpdated', 'callClosed', 'eventingHubJoined'] as const;

/**
 * Call detail for every variant (omni-plan §7.10). One responsive screen replaces Dispatch's duplicated `.web` copy:
 * desktop and landscape boards put the summary beside the tabs. Tabs come from the registry, so incident command,
 * records and app-specific tabs are added by their modules without forking this screen.
 */
export default function CallDetailScreen({ callId: callIdProp, mapSlot, menuItems, onMenuAction, onClosed, showHeader = true }: CallDetailScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const routeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const callId = callIdProp ?? (routeId && isSafeRouteId(routeId) ? routeId : '');
  const queuedCall = useCallsStore((state) => (callId ? state.queuedCalls[callId] : undefined));

  if (!callId) return <ZeroState isError heading={t('call_detail.not_found')} testID="call-detail-invalid" />;
  if (queuedCall) return <QueuedCallDetail queued={queuedCall} showHeader={showHeader} />;
  return <ServerCallDetail callId={callId} mapSlot={mapSlot} menuItems={menuItems} onMenuAction={onMenuAction} onClosed={onClosed} showHeader={showHeader} />;
}

function ServerCallDetail({ callId, mapSlot, menuItems, onMenuAction, onClosed, showHeader }: Required<Pick<CallDetailScreenProps, 'callId' | 'showHeader'>> & Omit<CallDetailScreenProps, 'callId' | 'showHeader'>) {
  const { t } = useTranslation();
  const router = useRouter();
  const calls = useCapability('calls');
  const security = useSecurity();
  const { formFactor, isDesktop, isLandscapeBoard } = useFormFactor();
  // Subscribed so tab visibility follows department flags as they load (unknown flags = disabled).
  const flags = featureFlagsStore((state) => state.flags);
  const detail = useCallDetailStore((state) => state.details[callId]);
  const isLoading = useCallDetailStore((state) => state.loading.detail === true);
  const error = useCallDetailStore((state) => state.errors.detail);
  const fetchCallDetail = useCallDetailStore((state) => state.fetchCallDetail);
  const priorities = useCallsStore((state) => state.callPriorities);
  const overdueCheckIns = useCheckInTimersStore((state) => (state.statusesByCall[callId] ?? []).filter((status) => status.Status === 'Overdue' || status.Status === 'Critical' || status.Status === 'Red').length);
  const registered = useRegisteredCallDetailTabs();
  const [modal, setModal] = useState<null | 'notes' | 'images' | 'files' | 'close' | 'menu'>(null);

  const refresh = useCallback(() => fetchCallDetail(callId, { bypassCache: true }), [callId, fetchCallDetail]);

  useEffect(() => {
    void fetchCallDetail(callId);
  }, [callId, fetchCallDetail]);

  useRealtimeRefetch(DETAIL_REFRESH_EVENTS, refresh);

  const call = detail?.call ?? null;
  const extraData = detail?.extraData ?? null;
  const canEdit = calls.create !== 'none' && security.canUserCreateCalls;
  const canClose = calls.close && security.canUserCreateCalls;

  const context = useMemo<CallDetailTabContext | null>(() => {
    if (!call) return null;
    const variant = getActiveVariant();
    return {
      callId,
      call,
      extraData,
      capabilities: variant.capabilities,
      variantId: variant.id,
      security,
      formFactor,
      isFeatureEnabled: (flag: string) => flags[flag]?.enabled ?? false,
      overdueCheckIns,
      refresh,
      openNotes: () => setModal('notes'),
      openImages: () => setModal('images'),
      openFiles: () => setModal('files'),
    };
  }, [call, callId, extraData, flags, formFactor, overdueCheckIns, refresh, security]);

  const tabs = useMemo<TabItem[]>(
    () =>
      context
        ? resolveCallDetailTabs(context, registered).map((definition) => ({
            key: definition.id,
            title: definition.title,
            content: definition.render(context),
            badge: definition.badge?.(context),
            badgeVariant: definition.badgeVariant,
          }))
        : [],
    [context, registered]
  );

  const back = () => router.back();
  const header = showHeader ? (
    <ScreenHeader
      title={t('call_detail.title')}
      onBack={back}
      right={
        call ? (
          <Pressable onPress={() => setModal('menu')} accessibilityRole="button" accessibilityLabel={t('calls.menu.open')} className="p-2" testID="call-detail-menu-button">
            <EllipsisVertical size={22} color="#374151" />
          </Pressable>
        ) : undefined
      }
    />
  ) : null;

  if (!call) {
    return (
      <View style={styles.screen} testID="call-detail-screen">
        {header}
        {isLoading || (!error && !detail) ? (
          <Loading text={t('call_detail.loading')} />
        ) : (
          <ZeroState isError heading={t('call_detail.not_found')} testID="call-detail-not-found">
            <Button onPress={() => void refresh()} accessibilityLabel={t('common.retry')}>
              <ButtonText>{t('common.retry')}</ButtonText>
            </Button>
          </ZeroState>
        )}
      </View>
    );
  }

  const priority = resolvePriority(priorities, call.Priority);
  const colors = readableColors(priority?.color);
  const nameProtected = isFieldRedacted(call.RedactedFields, ProtectedFieldIds.callName, call.Name);
  const natureProtected = isFieldRedacted(call.RedactedFields, ProtectedFieldIds.callNature, call.Nature);
  const twoColumn = isDesktop || isLandscapeBoard;

  const onSelect = (action: CallMenuAction) => {
    switch (action) {
      case 'edit':
        router.push(callEdit(callId));
        break;
      case 'close':
        setModal('close');
        break;
      case 'notes':
        setModal('notes');
        break;
      case 'images':
        setModal('images');
        break;
      case 'files':
        setModal('files');
        break;
      default:
        onMenuAction?.(action, call);
    }
  };

  const summary = (
    <View>
      <ProtectedRevealBar onRefresh={refresh} />
      <View style={styles.card} className="bg-background-0" testID="call-detail-summary">
        <View style={styles.titleRow}>
          <TypeIcon iconUrl={call.TypeIconUrl} mapIcon={call.TypeMapIcon} size={28} />
          <Text className="ml-2 flex-1 text-lg font-bold text-typography-900" accessibilityRole="header" testID="call-detail-title">
            {nameProtected ? `${t('data_protection.protected_value')} (#${call.Number})` : `${call.Name} (#${call.Number})`}
          </Text>
        </View>
        {priority ? (
          <View
            style={StyleSheet.flatten([styles.priority, { backgroundColor: colors.backgroundColor }])}
            accessible
            accessibilityLabel={`${t('call_detail.priority')}: ${priority.isLabelKey ? t(priority.label) : priority.label}`}
          >
            <Text size="xs" style={{ color: colors.textColor }}>
              {priority.isLabelKey ? t(priority.label) : priority.label}
            </Text>
          </View>
        ) : null}
        {natureProtected ? (
          <Text className="mt-2 italic text-typography-500">{t('data_protection.protected_value')}</Text>
        ) : call.Nature ? (
          <HtmlRenderer html={call.Nature} scrollEnabled style={styles.nature} rendererKey={`${call.CallId}-nature`} testID="call-detail-nature" />
        ) : null}
      </View>
      {mapSlot ? (
        <View style={styles.map} testID="call-detail-map-slot">
          {mapSlot(call)}
        </View>
      ) : null}
      <View style={styles.actions} className="bg-background-0">
        {(
          [
            ['notes', t('call_detail.notes'), call.NotesCount],
            ['images', t('call_detail.images'), call.ImgagesCount],
            ['files', t('call_detail.files.button'), call.FileCount],
          ] as const
        ).map(([key, label, count]) => (
          <Button key={key} variant="outline" size="sm" className="mx-1 flex-1" onPress={() => setModal(key)} accessibilityLabel={count ? `${label} (${count})` : label} testID={`call-detail-${key}`}>
            <ButtonText>{count ? `${label} (${count})` : label}</ButtonText>
          </Button>
        ))}
      </View>
    </View>
  );

  const tabsView = (
    <View style={styles.card} className="bg-background-0" testID="call-detail-tabs">
      <SharedTabs tabs={tabs} variant="underlined" scrollable size={twoColumn ? 'lg' : 'md'} tabClassName="min-h-11" />
    </View>
  );

  return (
    <View style={styles.screen} className="bg-background-50" testID="call-detail-screen">
      {header}
      {twoColumn ? (
        <View style={styles.columns}>
          <ScrollView style={styles.leftColumn} contentContainerStyle={styles.content}>
            {summary}
          </ScrollView>
          <ScrollView style={styles.rightColumn} contentContainerStyle={styles.content}>
            {tabsView}
          </ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {summary}
          {tabsView}
        </ScrollView>
      )}
      <CallNotesModal isOpen={modal === 'notes'} onClose={() => setModal(null)} callId={callId} />
      <CallImagesModal isOpen={modal === 'images'} onClose={() => setModal(null)} callId={callId} />
      <CallFilesModal isOpen={modal === 'files'} onClose={() => setModal(null)} callId={callId} />
      {canClose ? <CloseCallSheet isOpen={modal === 'close'} onClose={() => setModal(null)} callId={callId} onClosed={onClosed ?? back} /> : null}
      <CallMenu isOpen={modal === 'menu'} onClose={() => setModal(null)} canEdit={canEdit} canClose={canClose} onSelect={onSelect} extraItems={menuItems} />
    </View>
  );
}

/** A call that exists only on this device (plan §8.5): no number, nobody paged; a refused one opens for correction. */
function QueuedCallDetail({ queued, showHeader }: { queued: QueuedCall; showHeader: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View style={styles.screen} className="bg-background-50" testID="queued-call-detail">
      {showHeader ? <ScreenHeader title={t('call_detail.title')} onBack={() => router.back()} /> : null}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card} className="bg-background-0">
          <QueuedCallBadge marker={{ localId: queued.localId, state: queued.state }} />
          <Text className="mt-3 text-lg font-bold text-typography-900" accessibilityRole="header">
            {queued.request.name}
          </Text>
          {queued.request.nature ? <Text className="mt-1 text-typography-700">{queued.request.nature}</Text> : null}
          {queued.request.address ? <Text className="mt-1 text-typography-600">{queued.request.address}</Text> : null}
          <Text size="sm" className="mt-3 text-typography-600">
            {queued.state === 'rejected' ? t('calls.queued.rejected_explainer') : t('calls.queued.queued_explainer')}
          </Text>
          {queued.state === 'rejected' ? (
            <Button className="mt-4" onPress={() => router.push(callCorrect(queued.localId))} accessibilityLabel={t('calls.queued.correct')} testID="queued-call-correct">
              <ButtonText>{t('calls.queued.correct')}</ButtonText>
            </Button>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 12, paddingBottom: 24 },
  columns: { flex: 1, flexDirection: 'row' },
  leftColumn: { flex: 2 },
  rightColumn: { flex: 3 },
  card: { borderRadius: 12, padding: 12, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  priority: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, marginTop: 6 },
  nature: { height: 132, marginTop: 8 },
  map: { height: 200, borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  actions: { flexDirection: 'row', borderRadius: 12, padding: 8, marginBottom: 12 },
});
