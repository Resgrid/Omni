import { defineNav, defineRoutes, featureNav } from '@resgrid/app-shell';
import { FeatureFlagKeys } from '@resgrid/auth';
import { authNavEntries } from '@resgrid/features/auth-ui/nav';
import { awaitingResourcesNav } from '@resgrid/features/awaiting-resources/nav';
import { callQueuesNav } from '@resgrid/features/call-queues/nav';
import { callsNav } from '@resgrid/features/calls/nav';
import { chatNav } from '@resgrid/features/chat/nav';
import { contactsNav } from '@resgrid/features/contacts/nav';
import { dispatchConsoleNav } from '@resgrid/features/dispatch-console/nav';
import { mapNav } from '@resgrid/features/map/nav';
import { notesNav } from '@resgrid/features/notes/nav';
import { notificationsNav } from '@resgrid/features/notifications/nav';
import { offlineMapsNav } from '@resgrid/features/offline-maps/nav';
import { operationsNav } from '@resgrid/features/operations/nav';
import { personnelNav } from '@resgrid/features/personnel/nav';
import { poisNav } from '@resgrid/features/pois/nav';
import { protocolsNav } from '@resgrid/features/protocols/nav';
import { recordsNav } from '@resgrid/features/records/nav';
import { settingsNavEntries } from '@resgrid/features/settings/nav';
import { unitsNav } from '@resgrid/features/units/nav';
import { weatherAlertsNav } from '@resgrid/features/weather-alerts/nav';

import { detailNav } from '../../detail-nav';
import variant from './variant';

// dispatch navigation and route contract (omni-plan §5.3.4, §5.4). Only routes with a file in ./app belong here; the
// per-variant route contract test (packages/app-shell) fails otherwise. Feature entries come from each feature's nav.ts
// (imported directly so this file stays light); the menu follows the legacy Dispatch side menu (calls, new call, POIs,
// map, personnel, units, weather alerts, protocols, contacts, records, operations, chat, settings). Notes open from the
// console; a call's full-screen command board (assist tier) opens from the call.

export const routes = defineRoutes([
  'home',
  'calls',
  'callDetail',
  'callEdit',
  'callNew',
  'callCommand',
  'pendingCalls',
  'scheduledCalls',
  'archivedCalls',
  'awaitingResources',
  'pois',
  'poiDetail',
  'map',
  'personnel',
  'personnelDetail',
  'units',
  'unitDetail',
  'contacts',
  'contactDetail',
  'notes',
  'protocols',
  'records',
  'recordNew',
  'recordDetail',
  'recordDeployments',
  'recordDeployment',
  'recordConnectors',
  'recordConnector',
  'operations',
  'operationDetail',
  'weatherAlerts',
  'weatherAlertDetail',
  'weatherAlertSettings',
  'chat',
  'chatChannel',
  'chatbot',
  'notifications',
  'settings',
  'settingsStorage',
  'settingsOfflineMaps',
  'accountSecurity',
  'login',
  'loginSso',
  'loginRecovery',
  'loginSharedDevice',
  'ssoReturn',
  'onboarding',
  'maintenance',
  'lockscreen',
]);

export const nav = defineNav([
  // The console is the home (shell.homeRoute '/').
  ...featureNav(dispatchConsoleNav, 'sidebar', { order: 0 }),
  // Legacy order: calls, pending, awaiting resources, scheduled, archived, new call.
  ...featureNav(callsNav, 'sidebar', { order: 10, overrides: { 'call-new': { order: 15 } } }),
  ...featureNav(callQueuesNav, 'sidebar', { overrides: { 'pending-calls': { order: 11 }, 'scheduled-calls': { order: 13 }, 'archived-calls': { order: 14 } } }),
  ...featureNav(awaitingResourcesNav, 'sidebar', { order: 12 }),
  ...featureNav(poisNav, 'sidebar', { order: 20 }),
  ...featureNav(mapNav, 'sidebar', { order: 25 }),
  ...featureNav(personnelNav, 'sidebar', { order: 30 }),
  ...featureNav(unitsNav, 'sidebar', { order: 31 }),
  ...featureNav(weatherAlertsNav, { 'weather-alerts': 'sidebar', 'weather-alerts-settings': 'hidden' }, { order: 40 }),
  ...featureNav(protocolsNav, 'sidebar', { order: 41 }),
  ...featureNav(contactsNav, 'sidebar', { order: 42 }),
  ...featureNav(notesNav, 'hidden', { order: 43 }),
  ...featureNav(recordsNav, 'sidebar', { order: 44, overrides: { records: { requiresFlag: [FeatureFlagKeys.RecordsSystem, FeatureFlagKeys.RecordsFieldDispatch] } } }),
  ...featureNav(operationsNav, 'sidebar', { order: 45 }),
  ...featureNav(chatNav, 'sidebar', { order: 60 }),
  ...featureNav(notificationsNav, 'sidebar', { order: 70 }),
  ...featureNav(settingsNavEntries, variant),
  ...featureNav(offlineMapsNav, 'hidden', { order: 906 }),
  ...featureNav(authNavEntries, variant),
  detailNav.callDetail,
  detailNav.callEdit,
  detailNav.callCommand,
  detailNav.poiDetail,
  detailNav.personnelDetail,
  detailNav.unitDetail,
  detailNav.contactDetail,
  detailNav.weatherAlertDetail,
  detailNav.chatChannel,
]);
