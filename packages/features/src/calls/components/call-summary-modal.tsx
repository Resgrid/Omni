import { useCapability } from '@resgrid/config';
import { selectCallById, useCallDetailStore, useCallsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CallPriorityResultData, CallResultData } from '@resgrid/models';
import { useRealtimeRefetch } from '@resgrid/realtime';
import { Button, ButtonText, HtmlRenderer, Loading, SharedTabs, type TabItem, Text, TypeIcon } from '@resgrid/ui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { VideoFeedsTab } from '../../video-feeds';
import { callHasSiteInfo } from '../detail-tabs/built-in-tabs';
import { readableColors } from '../lib/call-colors';
import { callDisplayName, callDisplayText, revealedCallText } from '../lib/call-display';
import { resolvePriority } from '../lib/call-priority';
import { CallAudioPanel } from './call-audio-modal';
import { CallFilesPanel, CallImagesPanel } from './call-media-modals';
import { CallModalFrame } from './call-modal-frame';
import { CallNotesPanel } from './call-notes-panel';
import { CallProtocolsPanel } from './detail/call-protocols-panel';
import { LocationHistoryPanel } from './detail/location-history-panel';
import { ProtectedRevealBar } from './detail/protected-reveal-bar';
import { SiteInfoPanel } from './detail/site-info-panel';

export interface CallSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  callId: string;
  /** Opens the full call detail. The modal closes first. */
  onOpenDetails: (callId: string) => void;
  testID?: string;
}

/** Realtime pings that can change the call on screen. */
const SUMMARY_REFRESH_EVENTS = ['callsUpdated', 'callClosed'] as const;

/**
 * The call at a glance (Unit's sidebar call card): its title, priority, type, address and nature, then tabs for its
 * notes, images, files, video feeds, protocols, site info, location history and audio — the same panels the detail
 * screen uses, read through the same stores, so it works offline from what was last loaded. Only the open tab is
 * mounted, so leaving the Audio tab stops playback. "View call details" opens the full detail for everything else.
 */
export const CallSummaryModal: React.FC<CallSummaryModalProps> = ({ isOpen, onClose, callId, onOpenDetails, testID = 'call-summary-modal' }) => {
  const { t } = useTranslation();
  const videoFeeds = useCapability('videoFeeds');
  const detail = useCallDetailStore((state) => state.details[callId]);
  const listed = useCallsStore((state) => selectCallById(state, callId));
  const priorities = useCallsStore((state) => state.callPriorities);
  const fetchCallDetail = useCallDetailStore((state) => state.fetchCallDetail);
  const [tabIndex, setTabIndex] = useState(0);

  // The detail (protocols, protected values) once it loads; the open-calls row until then.
  const call: CallResultData | null = detail?.call ?? listed ?? null;
  const protocols = detail?.extraData?.Protocols;

  const refresh = useCallback(() => fetchCallDetail(callId, { bypassCache: true }), [callId, fetchCallDetail]);

  useEffect(() => {
    if (!isOpen) return;
    setTabIndex(0);
    void fetchCallDetail(callId);
  }, [callId, fetchCallDetail, isOpen]);

  useRealtimeRefetch(SUMMARY_REFRESH_EVENTS, refresh, isOpen);

  const tabs = useMemo<TabItem[]>(() => {
    if (!call) return [];

    const list: (TabItem | null)[] = [
      { key: 'notes', title: 'call_detail.notes', badge: call.NotesCount || undefined, content: <CallNotesPanel callId={callId} showSearch={call.NotesCount > 5} /> },
      { key: 'images', title: 'call_detail.images', badge: call.ImgagesCount || undefined, content: <CallImagesPanel callId={callId} /> },
      { key: 'files', title: 'call_detail.files.button', badge: call.FileCount || undefined, content: <CallFilesPanel callId={callId} /> },
      videoFeeds === 'none' ? null : { key: 'video', title: 'call_detail.tabs.video', content: <VideoFeedsTab callId={callId} canManage={videoFeeds === 'manage'} /> },
      { key: 'protocols', title: 'call_detail.tabs.protocols', badge: protocols?.length || undefined, content: <CallProtocolsPanel protocols={protocols ?? []} /> },
      callHasSiteInfo(call) ? { key: 'site-info', title: 'call_detail.tabs.site', content: <SiteInfoPanel callId={callId} /> } : null,
      { key: 'history', title: 'call_detail.tabs.history', content: <LocationHistoryPanel callId={callId} /> },
      { key: 'audio', title: 'call_detail.audio', badge: call.AudioCount || undefined, content: <CallAudioPanel callId={callId} /> },
    ];

    return list.filter((tab): tab is TabItem => tab !== null);
  }, [call, callId, protocols, videoFeeds]);

  const protectedLabel = t('data_protection.protected_value');
  const title = call ? `${callDisplayName(call, protectedLabel)}${call.Number ? ` (#${call.Number})` : ''}` : t('call_detail.title');

  const openDetails = () => {
    onClose();
    onOpenDetails(callId);
  };

  const footer = (
    <View style={styles.footer} className="border-outline-100">
      <Button onPress={openDetails} accessibilityLabel={t('map.view_call_details')} testID={`${testID}-details`}>
        <ButtonText>{t('map.view_call_details')}</ButtonText>
      </Button>
    </View>
  );

  return (
    <CallModalFrame isOpen={isOpen} onClose={onClose} title={title} footer={footer} testID={testID}>
      {call ? (
        <SummaryBody call={call} priorities={priorities} tabs={tabs} tabIndex={Math.min(tabIndex, Math.max(0, tabs.length - 1))} onTabChange={setTabIndex} onRefresh={refresh} testID={testID} />
      ) : (
        <Loading text={t('call_detail.loading')} />
      )}
    </CallModalFrame>
  );
};

interface SummaryBodyProps {
  call: CallResultData;
  priorities: readonly CallPriorityResultData[];
  tabs: TabItem[];
  tabIndex: number;
  onTabChange: (index: number) => void;
  onRefresh: () => Promise<void>;
  testID: string;
}

const SummaryBody: React.FC<SummaryBodyProps> = ({ call, priorities, tabs, tabIndex, onTabChange, onRefresh, testID }) => {
  const { t } = useTranslation();
  const protectedLabel = t('data_protection.protected_value');
  const priority = resolvePriority(priorities, call.Priority);
  const colors = readableColors(priority?.color);
  const priorityLabel = priority ? (priority.isLabelKey ? t(priority.label) : priority.label) : null;
  const nature = revealedCallText(call, 'Nature');
  const address = callDisplayText(call, 'Address', protectedLabel);

  return (
    <View>
      <ProtectedRevealBar onRefresh={onRefresh} />
      <View style={styles.summary} testID={`${testID}-summary`}>
        <View style={styles.row}>
          <TypeIcon iconUrl={call.TypeIconUrl} mapIcon={call.TypeMapIcon} size={24} />
          {priorityLabel ? (
            <View style={StyleSheet.flatten([styles.priority, { backgroundColor: colors.backgroundColor }])} accessible accessibilityLabel={`${t('call_detail.priority')}: ${priorityLabel}`} testID={`${testID}-priority`}>
              <Text size="xs" style={{ color: colors.textColor }}>
                {priorityLabel}
              </Text>
            </View>
          ) : null}
          {call.Type ? <Text className="ml-2 flex-1 text-sm text-typography-600">{call.Type}</Text> : null}
        </View>
        {address ? (
          <Text className="mt-2 text-typography-700" testID={`${testID}-address`}>
            {address}
          </Text>
        ) : null}
        <Text className="mt-3 text-xs font-semibold uppercase text-typography-500">{t('call_detail.nature')}</Text>
        {nature === null ? (
          <Text className="mt-1 italic text-typography-500">{protectedLabel}</Text>
        ) : nature ? (
          <HtmlRenderer html={nature} scrollEnabled showsVerticalScrollIndicator style={styles.nature} rendererKey={`${call.CallId}-summary-nature`} testID={`${testID}-nature`} />
        ) : (
          <Text className="mt-1 text-typography-500">{t('call_detail.no_additional_info')}</Text>
        )}
      </View>
      <SharedTabs tabs={tabs} activeIndex={tabIndex} onChange={onTabChange} variant="underlined" scrollable keepMounted={false} tabStyle={styles.tab} />
    </View>
  );
};

const styles = StyleSheet.create({
  summary: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  priority: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, marginLeft: 8 },
  nature: { height: 160, marginTop: 4 },
  footer: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  // A 44 dp touch target for each tab.
  tab: { minHeight: 44 },
});
