import React from 'react';

import { CheckInTab } from '../../check-in';
import { VideoFeedsTab } from '../../video-feeds';
import { CallActivityPanel } from '../components/detail/call-activity-panel';
import { CallDispatchedPanel } from '../components/detail/call-dispatched-panel';
import { CallInfoPanel } from '../components/detail/call-info-panel';
import { CallMediaPanel } from '../components/detail/call-media-panel';
import { CallProtocolsPanel } from '../components/detail/call-protocols-panel';
import { LocationHistoryPanel } from '../components/detail/location-history-panel';
import { SiteInfoPanel } from '../components/detail/site-info-panel';
import { type CallDetailTabDefinition, getCallDetailTabs, registerCallDetailTab } from './registry';

/** Ids of the shared tabs. Other modules slot in by `order` (e.g. incident command 65, records 85, Dispatch alarm level 25). */
export const CALL_DETAIL_TAB_IDS = {
  info: 'info',
  protocols: 'protocols',
  dispatched: 'dispatched',
  activity: 'activity',
  notes: 'notes',
  checkIn: 'check-in',
  videoFeeds: 'video-feeds',
  siteInfo: 'site-info',
  locationHistory: 'location-history',
} as const;

export const BUILT_IN_CALL_DETAIL_TABS: readonly CallDetailTabDefinition[] = [
  { id: CALL_DETAIL_TAB_IDS.info, order: 10, title: 'call_detail.tabs.info', render: (context) => <CallInfoPanel call={context.call} /> },
  { id: CALL_DETAIL_TAB_IDS.protocols, order: 20, title: 'call_detail.tabs.protocols', render: (context) => <CallProtocolsPanel protocols={context.extraData?.Protocols ?? []} /> },
  { id: CALL_DETAIL_TAB_IDS.dispatched, order: 30, title: 'call_detail.tabs.dispatched', render: (context) => <CallDispatchedPanel dispatches={context.extraData?.Dispatches ?? []} /> },
  {
    id: CALL_DETAIL_TAB_IDS.activity,
    order: 40,
    title: 'call_detail.tabs.timeline',
    render: (context) => <CallActivityPanel activity={context.extraData?.Activity ?? []} />,
    badge: (context) => context.extraData?.Activity?.length || undefined,
  },
  {
    id: CALL_DETAIL_TAB_IDS.notes,
    order: 50,
    title: 'call_detail.tabs.notes',
    render: (context) => <CallMediaPanel call={context.call} onOpenImages={context.openImages} onOpenFiles={context.openFiles} />,
    badge: (context) => context.call.NotesCount || undefined,
  },
  {
    id: CALL_DETAIL_TAB_IDS.checkIn,
    order: 60,
    title: 'check_in.tab_title',
    // Shown when timers run on the call, or to IC/Dispatch who can turn them on.
    visible: (context) => context.call.CheckInTimersEnabled || context.capabilities.checkIn.others,
    render: (context) => <CheckInTab callId={context.callId} timersEnabled={context.call.CheckInTimersEnabled} />,
    badge: (context) => (context.overdueCheckIns > 0 ? context.overdueCheckIns : undefined),
  },
  {
    id: CALL_DETAIL_TAB_IDS.videoFeeds,
    order: 70,
    title: 'call_detail.tabs.video',
    visible: (context) => context.capabilities.videoFeeds !== 'none',
    render: (context) => <VideoFeedsTab callId={context.callId} canManage={context.capabilities.videoFeeds === 'manage'} />,
  },
  {
    id: CALL_DETAIL_TAB_IDS.siteInfo,
    order: 80,
    title: 'call_detail.tabs.site',
    // Older servers send no Contacts list: keep the tab; an empty list means nothing is linked.
    visible: (context) => context.call.Contacts === undefined || context.call.Contacts.length > 0,
    render: (context) => <SiteInfoPanel callId={context.callId} />,
  },
  { id: CALL_DETAIL_TAB_IDS.locationHistory, order: 90, title: 'call_detail.tabs.history', render: (context) => <LocationHistoryPanel callId={context.callId} /> },
];

/**
 * Registers the shared tabs (idempotent: definitions already registered are left alone, so a module that replaced a
 * shared tab by id keeps its replacement). The call detail screen calls it on load. Returns the unregister function.
 */
export function registerBuiltInCallDetailTabs(): () => void {
  const current = getCallDetailTabs();
  const unregisters = BUILT_IN_CALL_DETAIL_TABS.filter((definition) => !current.some((existing) => existing.id === definition.id)).map((definition) => registerCallDetailTab(definition));
  return () => unregisters.forEach((unregister) => unregister());
}
