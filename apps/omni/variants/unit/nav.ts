import { defineNav, defineRoutes, featureNav } from '@resgrid/app-shell';
import { FeatureFlagKeys } from '@resgrid/auth';
import { authNavEntries } from '@resgrid/features/auth-ui/nav';
import { callsNav } from '@resgrid/features/calls/nav';
import { chatNav } from '@resgrid/features/chat/nav';
import { checklistsNav } from '@resgrid/features/checklists/nav';
import { contactsNav } from '@resgrid/features/contacts/nav';
import { inventoryNav } from '@resgrid/features/inventory/nav';
import { mapNav } from '@resgrid/features/map/nav';
import { notesNav } from '@resgrid/features/notes/nav';
import { notificationsNav } from '@resgrid/features/notifications/nav';
import { offlineMapsNav } from '@resgrid/features/offline-maps/nav';
import { operationsNav } from '@resgrid/features/operations/nav';
import { protocolsNav } from '@resgrid/features/protocols/nav';
import { recordsNav } from '@resgrid/features/records/nav';
import { settingsNavEntries } from '@resgrid/features/settings/nav';
import { unitRoutesNav } from '@resgrid/features/unit-routes/nav';
import { unitStatusNav } from '@resgrid/features/unit-status/nav';
import { weatherAlertsNav } from '@resgrid/features/weather-alerts/nav';

import { detailNav } from '../../detail-nav';
import variant from './variant';

// unit navigation and route contract (omni-plan §5.3.4, §5.4). Only routes with a file in ./app belong here; the
// per-variant route contract test (packages/app-shell) fails otherwise. Feature entries come from each feature's nav.ts
// (imported directly so this file stays light); placement follows the legacy Unit tab bar: map, calls, routes, contacts,
// notes, weather, protocols, settings — the status console, checklists, inventory, records, operations, chat and the
// inbox from the menu (the landscape sidebar is the status console itself).

export const routes = defineRoutes([
  'home',
  'map',
  'calls',
  'callDetail',
  'callEdit',
  'callNew',
  'unitRoutes',
  'unitRouteStart',
  'unitRouteActive',
  'unitRouteDirections',
  'unitRoutePoi',
  'unitRouteStop',
  'unitRouteStopContact',
  'unitRouteHistory',
  'unitRouteInstance',
  'unitConsole',
  'inventory',
  'inventoryCount',
  'contacts',
  'contactDetail',
  'notes',
  'protocols',
  'weatherAlerts',
  'weatherAlertDetail',
  'checklists',
  'records',
  'recordNew',
  'recordDetail',
  'recordDeployments',
  'recordDeployment',
  'recordConnectors',
  'recordConnector',
  'operations',
  'operationDetail',
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
  // Unit's home is the map, the first tab: `/` hands over to it (shell.homeRoute '/map'). Tab screens stay mounted, so
  // the native map stays alive across tab switches.
  { id: 'root', href: '/', placement: 'hidden', labelKey: 'tabs.home', defaultLabel: 'Home' },
  ...featureNav(mapNav, 'tab', { order: 0 }),
  ...featureNav(callsNav, { calls: 'tab', 'call-new': 'hidden' }, { order: 10 }),
  ...featureNav(unitRoutesNav, 'tab', { order: 20 }),
  ...featureNav(contactsNav, 'tab', { order: 30 }),
  ...featureNav(notesNav, 'tab', { order: 31 }),
  ...featureNav(weatherAlertsNav, { 'weather-alerts': 'tab' }, { order: 32 }),
  ...featureNav(protocolsNav, 'tab', { order: 33 }),
  ...featureNav(unitStatusNav, 'sidebar', { order: 39 }),
  ...featureNav(checklistsNav, 'sidebar', { order: 40 }),
  ...featureNav(inventoryNav, 'sidebar', { order: 40 }),
  ...featureNav(recordsNav, 'sidebar', { order: 41, overrides: { records: { requiresFlag: [FeatureFlagKeys.RecordsSystem, FeatureFlagKeys.RecordsFieldUnit] } } }),
  ...featureNav(operationsNav, 'sidebar', { order: 42 }),
  ...featureNav(chatNav, 'sidebar', { order: 50 }),
  ...featureNav(notificationsNav, 'sidebar', { order: 60 }),
  ...featureNav(settingsNavEntries, variant),
  ...featureNav(offlineMapsNav, 'hidden', { order: 906 }),
  ...featureNav(authNavEntries, variant),
  detailNav.callDetail,
  detailNav.callEdit,
  detailNav.contactDetail,
  detailNav.weatherAlertDetail,
  detailNav.chatChannel,
]);
