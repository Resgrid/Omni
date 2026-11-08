import { featureFlagsStore, useSecurity } from '@resgrid/auth';
import { getActiveVariant } from '@resgrid/config';
import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { type QueuedCall, useCallDetailStore, useCallsStore, useCheckInTimersStore } from '@resgrid/data';
import { useNavigationHandoff } from '@resgrid/features/contacts';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { useRealtimeRefetch } from '@resgrid/realtime';
import {
  Button,
  ButtonText,
  HtmlRenderer,
  KeyboardAwareScrollView,
  Loading,
  Pressable,
  ScreenHeader,
  SharedTabs,
  type TabItem,
  Text,
  TypeIcon,
  useFormFactor,
  useRouteTab,
  useThemeColors,
  useToast,
  ZeroState,
} from '@resgrid/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { EllipsisVertical } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AddResourcesSheet } from '../components/add-resources-sheet';
import { CallAudioModal } from '../components/call-audio-modal';
import { CallConfirmDialog } from '../components/call-confirm-dialog';
import { CallFilesModal, CallImagesModal, CallNotesModal } from '../components/call-media-modals';
import { CallMenu, type CallMenuAction, type CallMenuItem } from '../components/call-menu';
import { CloseCallSheet } from '../components/close-call-sheet';
import { CallMapSection } from '../components/detail/call-map-section';
import { CallQueueBanner } from '../components/detail/call-queue-banner';
import { ProtectedRevealBar } from '../components/detail/protected-reveal-bar';
import { QueuedCallBadge } from '../components/queued-call-badge';
import { RescheduleCallSheet } from '../components/reschedule-call-sheet';
import { registerBuiltInCallDetailTabs } from '../detail-tabs/built-in-tabs';
import { type CallDetailTabContext, resolveCallDetailTabs, useRegisteredCallDetailTabs } from '../detail-tabs/registry';
import { useCallFormHookPoints } from '../hook-points';
import { useCallDispatchNow } from '../hooks/use-call-dispatch-now';
import { useCallPermissions } from '../hooks/use-call-permissions';
import { CALL_SHORTCUTS_AVAILABLE, useCallShortcuts } from '../hooks/use-call-shortcuts';
import { readableColors } from '../lib/call-colors';
import { callDisplayName, revealedCallText } from '../lib/call-display';
import { callLocationTarget } from '../lib/call-location';
import { resolvePriority } from '../lib/call-priority';
import { isPendingCall, isScheduledCall, scheduledDispatchUtc } from '../lib/call-time';
import { callCorrect, callEdit } from '../routes';

registerBuiltInCallDetailTabs();

export interface CallDetailScreenProps {
  /** Defaults to the `id` route param. */
  callId?: string;
  /** Replaces the built-in map of the call and its destination (e.g. an interactive map on a wall board). */
  mapSlot?: (call: CallResultData) => React.ReactNode;
  /** Extra menu entries from other modules (e.g. Unit set-active-call). */
  menuItems?: readonly CallMenuItem[];
  onMenuAction?: (action: CallMenuAction, call: CallResultData) => void;
  /** After the call is closed or deleted (default: navigate back). */
  onClosed?: () => void;
  showHeader?: boolean;
}

/** Realtime pings that can change an open call. */
const DETAIL_REFRESH_EVENTS = ['callsUpdated', 'callClosed', 'eventingHubJoined'] as const;

/** Check-in timer states that need attention (the check-in tab's own summary: Red = overdue, Yellow = due soon). */
const ATTENTION_TIMER_STATES = new Set(['Overdue', 'Red', 'Warning', 'Yellow', 'Critical']);

/** Content-width action buttons that grow to share the row (not `flex-1`, which forces fifths and wraps "Images" mid-word on a phone). */
const ACTION_BUTTON_CLASS = 'm-1 grow px-2';

/** The menu entries that open a sheet or dialog on this screen. */
const MENU_SHEETS = ['close', 'notes', 'images', 'files', 'reschedule', 'dispatch-more', 'delete'] as const;

type DetailModal = null | 'audio' | 'menu' | (typeof MENU_SHEETS)[number];

/**
 * Call detail for every variant (omni-plan §7.10, Dispatch baseline). One responsive screen replaces Dispatch's
 * duplicated `.web` copy: every form factor stacks the summary above the tabs, so on desktop and landscape boards the
 * tabs get the full width. Tabs come from the registry, so incident command, records and app-specific tabs are added
 * by their modules without forking this screen. Users who may create calls edit, dispatch more, reschedule, close and
 * delete from the menu; a Pending or scheduled call can be dispatched from its banner. Web adds Dispatch's shortcuts.
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
  const toast = useToast();
  const themeColors = useThemeColors();
  const handoff = useNavigationHandoff();
  const security = useSecurity();
  const { formFactor, isDesktop, isLandscapeBoard } = useFormFactor();
  // Subscribed so tab visibility follows department flags as they load (unknown flags = disabled).
  const flags = featureFlagsStore((state) => state.flags);
  const detail = useCallDetailStore((state) => state.details[callId]);
  const isLoading = useCallDetailStore((state) => state.loading.detail === true);
  const error = useCallDetailStore((state) => state.errors.detail);
  const fetchCallDetail = useCallDetailStore((state) => state.fetchCallDetail);
  const priorities = useCallsStore((state) => state.callPriorities);
  const attentionCheckIns = useCheckInTimersStore((state) => (state.statusesByCall[callId] ?? []).filter((status) => ATTENTION_TIMER_STATES.has(status.Status)).length);
  const registered = useRegisteredCallDetailTabs();
  // A module-supplied action beside the title (Unit "Set Active"); it renders nothing where it does not apply.
  const { CallDetailAction } = useCallFormHookPoints();
  const [modal, setModal] = useState<DetailModal>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const refresh = useCallback(() => fetchCallDetail(callId, { bypassCache: true }), [callId, fetchCallDetail]);
  const dispatchNow = useCallDispatchNow({ onDispatched: () => void refresh() });

  useEffect(() => {
    void fetchCallDetail(callId);
  }, [callId, fetchCallDetail]);

  useRealtimeRefetch(DETAIL_REFRESH_EVENTS, refresh);

  const call = detail?.call ?? null;
  const extraData = detail?.extraData ?? null;
  const isPending = !!call && isPendingCall(call);
  const isScheduled = !!call && isScheduledCall(call, Date.now());
  // The member's rights and the call (its state, who logged it) decide every action; the server checks the same rules.
  const { canEdit, canDispatch, canDispatchMore, canReschedule, canClose, canDelete } = useCallPermissions(call);

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
      overdueCheckIns: attentionCheckIns,
      refresh,
      openNotes: () => setModal('notes'),
      openImages: () => setModal('images'),
      openFiles: () => setModal('files'),
      openDispatchMore: canDispatchMore ? () => setModal('dispatch-more') : undefined,
    };
  }, [attentionCheckIns, call, callId, canDispatchMore, extraData, flags, formFactor, refresh, security]);

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

  // In the route's params, so Back from a chat channel opened on the Command tab lands on Command again.
  const routeTab = useRouteTab(tabs);

  const back = () => router.back();
  const edit = () => pushRoutePath(router, callEdit(callId));

  useCallShortcuts({
    // Embedded without its header, the detail is part of another screen, which owns the keyboard.
    disabled: !showHeader,
    // Escape closes an open sheet first (its own handler); only a bare screen goes back.
    onBack: () => {
      if (modal === null) back();
    },
    onEdit: canEdit && modal === null ? edit : undefined,
    onTab: (index) => {
      if (modal === null && index < tabs.length) routeTab.selectIndex(index);
    },
  });

  const header = showHeader ? (
    <ScreenHeader
      title={t('call_detail.title')}
      onBack={back}
      right={
        call ? (
          <Pressable onPress={() => setModal('menu')} accessibilityRole="button" accessibilityLabel={t('calls.menu.open')} className="p-2" testID="call-detail-menu-button">
            <EllipsisVertical size={22} color={themeColors.icon} />
          </Pressable>
        ) : undefined
      }
    />
  ) : null;

  if (!call) {
    return (
      <View style={styles.screen} testID="call-detail-screen">
        {header}
        {isLoading || (!error && !detail) ? <Loading text={t('call_detail.loading')} /> : <ZeroState isError heading={t('call_detail.not_found')} onRetry={refresh} testID="call-detail-not-found" />}
      </View>
    );
  }

  const priority = resolvePriority(priorities, call.Priority);
  const colors = readableColors(priority?.color);
  const protectedLabel = t('data_protection.protected_value');
  const nature = revealedCallText(call, 'Nature');
  const isWide = isDesktop || isLandscapeBoard;
  const closedOrDeleted = onClosed ?? back;

  const route = async () => {
    const target = callLocationTarget(call);

    if (!target) {
      toast.error(t('call_detail.no_location_for_routing'));

      return;
    }

    if (!(await handoff.navigateTo(target))) toast.error(t('call_detail.failed_to_open_maps'));
  };

  const confirmDelete = async () => {
    setIsDeleting(true);

    try {
      await useCallDetailStore.getState().deleteCall(callId);
      setModal(null);
      toast.success(t('call_detail.delete_call_success'));
      void useCallsStore.getState().fetchCalls({ bypassCache: true });
      void useCallsStore.getState().refreshQueuedCallLists();
      closedOrDeleted();
    } catch {
      toast.error(t('call_detail.delete_call_error'));
    } finally {
      setIsDeleting(false);
    }
  };

  const onSelect = (action: CallMenuAction) => {
    const sheet = MENU_SHEETS.find((candidate) => candidate === action);

    if (action === 'edit') edit();
    else if (sheet) setModal(sheet);
    else onMenuAction?.(action, call);
  };

  const summary = (
    <View>
      <ProtectedRevealBar onRefresh={refresh} />
      <View style={styles.card} className="bg-background-0" testID="call-detail-summary">
        <View style={styles.titleRow}>
          <TypeIcon iconUrl={call.TypeIconUrl} mapIcon={call.TypeMapIcon} size={28} />
          <Text className="ml-2 flex-1 text-lg font-bold text-typography-900" accessibilityRole="header" testID="call-detail-title">
            {`${callDisplayName(call, protectedLabel)} (#${call.Number})`}
          </Text>
          {CallDetailAction ? <CallDetailAction call={call} /> : null}
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
        {nature === null ? (
          <Text className="mt-2 italic text-typography-500">{protectedLabel}</Text>
        ) : nature ? (
          <HtmlRenderer html={nature} scrollEnabled showsVerticalScrollIndicator style={styles.nature} rendererKey={`${call.CallId}-nature`} testID="call-detail-nature" />
        ) : null}
      </View>
      {isPending || isScheduled ? (
        <CallQueueBanner
          kind={isPending ? 'pending' : 'scheduled'}
          dispatchAtUtc={scheduledDispatchUtc(call)}
          isBusy={dispatchNow.busyCallId === callId}
          onDispatch={canDispatch ? () => (isPending ? void dispatchNow.openDispatchPicker(callId, extraData?.Dispatches) : dispatchNow.confirmDispatchNow(callId)) : undefined}
        />
      ) : null}
      {mapSlot ? (
        <View style={styles.map} testID="call-detail-map-slot">
          {mapSlot(call)}
        </View>
      ) : (
        <CallMapSection call={call} />
      )}
      {/* Each button is as wide as its label and grows to fill the row; when the labels (counts, longer languages) don't fit, the row wraps instead of squeezing a word onto two lines. */}
      <View style={styles.actions} className="bg-background-0">
        {(
          [
            ['notes', t('call_detail.notes'), call.NotesCount],
            ['images', t('call_detail.images'), call.ImgagesCount],
            ['files', t('call_detail.files.button'), call.FileCount],
            ['audio', t('call_detail.audio'), call.AudioCount],
          ] as const
        ).map(([key, label, count]) => (
          <Button key={key} variant="outline" size="sm" className={ACTION_BUTTON_CLASS} onPress={() => setModal(key)} accessibilityLabel={count ? `${label} (${count})` : label} testID={`call-detail-${key}`}>
            <ButtonText numberOfLines={1}>{count ? `${label} (${count})` : label}</ButtonText>
          </Button>
        ))}
        <Button variant="outline" size="sm" className={ACTION_BUTTON_CLASS} onPress={() => void route()} accessibilityLabel={t('common.route')} testID="call-detail-route">
          <ButtonText numberOfLines={1}>{t('common.route')}</ButtonText>
        </Button>
      </View>
    </View>
  );

  const tabsView = (
    <View style={styles.card} className="bg-background-0" testID="call-detail-tabs">
      <SharedTabs tabs={tabs} activeIndex={routeTab.activeIndex} onChange={routeTab.selectIndex} variant="underlined" scrollable size={isWide ? 'lg' : 'md'} tabStyle={styles.tab} />
    </View>
  );

  return (
    <View style={styles.screen} className="bg-background-50" testID="call-detail-screen">
      {header}
      <KeyboardAwareScrollView contentContainerStyle={styles.content} testID="call-detail-scroll">
        {summary}
        {tabsView}
        {CALL_SHORTCUTS_AVAILABLE && isWide ? (
          <Text size="xs" className="text-center text-typography-500" testID="call-detail-shortcuts-hint">
            {t('call_detail.keyboard_shortcuts')}
          </Text>
        ) : null}
      </KeyboardAwareScrollView>
      <CallNotesModal isOpen={modal === 'notes'} onClose={() => setModal(null)} callId={callId} />
      <CallImagesModal isOpen={modal === 'images'} onClose={() => setModal(null)} callId={callId} />
      <CallFilesModal isOpen={modal === 'files'} onClose={() => setModal(null)} callId={callId} />
      <CallAudioModal isOpen={modal === 'audio'} onClose={() => setModal(null)} callId={callId} />
      {canClose ? <CloseCallSheet isOpen={modal === 'close'} onClose={() => setModal(null)} callId={callId} onClosed={closedOrDeleted} /> : null}
      {canReschedule ? <RescheduleCallSheet isOpen={modal === 'reschedule'} onClose={() => setModal(null)} callId={callId} /> : null}
      {canDispatchMore ? <AddResourcesSheet call={modal === 'dispatch-more' ? call : null} onClose={() => setModal(null)} onDispatched={() => void refresh()} /> : null}
      {canDelete ? (
        <CallConfirmDialog
          isOpen={modal === 'delete'}
          title={t('call_detail.delete_call')}
          message={t('call_detail.delete_call_confirm')}
          confirmLabel={t('call_detail.delete_call')}
          cancelLabel={t('common.cancel')}
          destructive
          isBusy={isDeleting}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setModal(null)}
          testID="call-delete-confirm"
        />
      ) : null}
      {dispatchNow.dialogs}
      <CallMenu
        isOpen={modal === 'menu'}
        onClose={() => setModal(null)}
        canEdit={canEdit}
        canClose={canClose}
        canDispatchMore={canDispatchMore}
        canReschedule={canReschedule}
        canDelete={canDelete}
        onSelect={onSelect}
        extraItems={menuItems}
      />
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
            <Button className="mt-4" onPress={() => pushRoutePath(router, callCorrect(queued.localId))} accessibilityLabel={t('calls.queued.correct')} testID="queued-call-correct">
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
  card: { borderRadius: 12, padding: 12, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  priority: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, marginTop: 6 },
  nature: { height: 132, marginTop: 8 },
  map: { height: 200, borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 12, padding: 8, marginBottom: 12 },
  // A 44 dp touch target for each tab.
  tab: { minHeight: 44 },
});
