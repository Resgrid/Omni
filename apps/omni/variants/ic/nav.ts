import { defineNav, defineRoutes, featureNav } from '@resgrid/app-shell';
import { FeatureFlagKeys } from '@resgrid/auth';
import { authNavEntries } from '@resgrid/features/auth-ui/nav';
import { callsNav } from '@resgrid/features/calls/nav';
import { chatNav } from '@resgrid/features/chat/nav';
import { contactsNav } from '@resgrid/features/contacts/nav';
import { incidentCommandNav } from '@resgrid/features/incident-command/nav';
import { mapNav } from '@resgrid/features/map/nav';
import { notificationsNav } from '@resgrid/features/notifications/nav';
import { offlineMapsNav } from '@resgrid/features/offline-maps/nav';
import { operationsNav } from '@resgrid/features/operations/nav';
import { recordsNav } from '@resgrid/features/records/nav';
import { settingsNavEntries } from '@resgrid/features/settings/nav';
import { weatherAlertsNav } from '@resgrid/features/weather-alerts/nav';

import { detailNav } from '../../detail-nav';
import variant from './variant';

// ic navigation and route contract (omni-plan §5.3.4, §5.4). Only routes with a file in ./app belong here; the
// per-variant route contract test (packages/app-shell) fails otherwise. Feature entries come from each feature's nav.ts
// (imported directly so this file stays light); placement follows the legacy IC shell: map, calls and the command board
// in the tab bar, everything else (incidents, contacts, records, operations, chat, weather, settings) in the side drawer.

export const routes = defineRoutes([
  'home',
  'map',
  'calls',
  'callDetail',
  'callEdit',
  'callNew',
  'commandBoard',
  'incidents',
  'commandLog',
  'commandMap',
  'resourceMap',
  'contacts',
  'contactDetail',
  'poiDetail',
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
]);

export const nav = defineNav([
  // `/` forwards to the home route: the department map tab (variant.json shell.homeRoute: '/map').
  { id: 'root', href: '/', placement: 'hidden', labelKey: 'tabs.home', defaultLabel: 'Home' },
  ...featureNav(mapNav, 'tab', { order: 0 }),
  ...featureNav(callsNav, { calls: 'tab', 'call-new': 'hidden' }, { order: 10 }),
  ...featureNav(incidentCommandNav, { command: 'tab', incidents: 'sidebar' }, { order: 20 }),
  ...featureNav(contactsNav, 'sidebar', { order: 30 }),
  ...featureNav(recordsNav, 'sidebar', { order: 31, overrides: { records: { requiresFlag: [FeatureFlagKeys.RecordsSystem, FeatureFlagKeys.RecordsFieldIncidentCommand] } } }),
  ...featureNav(operationsNav, 'sidebar', { order: 32 }),
  ...featureNav(chatNav, 'sidebar', { order: 40 }),
  ...featureNav(weatherAlertsNav, { 'weather-alerts': 'sidebar' }, { order: 50 }),
  ...featureNav(notificationsNav, 'sidebar', { order: 60 }),
  ...featureNav(settingsNavEntries, variant),
  ...featureNav(offlineMapsNav, 'hidden', { order: 906 }),
  ...featureNav(authNavEntries, variant),
  detailNav.callDetail,
  detailNav.callEdit,
  detailNav.commandLog,
  detailNav.commandMap,
  detailNav.resourceMap,
  detailNav.contactDetail,
  detailNav.poiDetail,
  detailNav.weatherAlertDetail,
  detailNav.chatChannel,
]);
