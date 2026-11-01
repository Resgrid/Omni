import { defineNav, defineRoutes, featureNav } from '@resgrid/app-shell';
import { FeatureFlagKeys } from '@resgrid/auth';
import { approveSignInNav } from '@resgrid/features/approve-sign-in/nav';
import { authNavEntries } from '@resgrid/features/auth-ui/nav';
import { calendarNav } from '@resgrid/features/calendar/nav';
import { callsNav } from '@resgrid/features/calls/nav';
import { certificationsNav } from '@resgrid/features/certifications/nav';
import { chatNav } from '@resgrid/features/chat/nav';
import { checklistsNav } from '@resgrid/features/checklists/nav';
import { contactsNav } from '@resgrid/features/contacts/nav';
import { mapNav } from '@resgrid/features/map/nav';
import { memberHomeNav } from '@resgrid/features/member-home/nav';
import { messagesNav } from '@resgrid/features/messages/nav';
import { notesNav } from '@resgrid/features/notes/nav';
import { notificationsNav } from '@resgrid/features/notifications/nav';
import { offlineMapsNav } from '@resgrid/features/offline-maps/nav';
import { operationsNav } from '@resgrid/features/operations/nav';
import { protocolsNav } from '@resgrid/features/protocols/nav';
import { recordsNav } from '@resgrid/features/records/nav';
import { settingsNavEntries } from '@resgrid/features/settings/nav';
import { shiftsNav } from '@resgrid/features/shifts/nav';
import { weatherAlertsNav } from '@resgrid/features/weather-alerts/nav';
import { workOrdersNav } from '@resgrid/features/work-orders/nav';

import { detailNav } from '../../detail-nav';
import variant from './variant';

// responder navigation and route contract (omni-plan §5.3.4, §5.4). Only routes with a file in ./app belong here; the
// per-variant route contract test (packages/app-shell) fails otherwise. Feature entries come from each feature's nav.ts
// (imported directly so this file stays light); the menu follows the legacy Responder side menu (home, messages,
// contacts, map, notes, protocols, calendar, shifts, weather alerts, checklists, records, operations, work orders,
// certifications, chat, settings). Personnel, units and calls are the member home's nested tabs (/home/*).

export const routes = defineRoutes([
  'home',
  'homeTab',
  'memberHomePersonnel',
  'memberHomeUnits',
  'memberHomeCalls',
  'callDetail',
  'callEdit',
  'callNew',
  'personnelDetail',
  'unitDetail',
  'messages',
  'messageDetail',
  'contacts',
  'contactDetail',
  'map',
  'notes',
  'protocols',
  'calendar',
  'shifts',
  'shiftDay',
  'shiftTrade',
  'poiDetail',
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
  'workOrders',
  'workOrderNew',
  'workOrderDetail',
  'certifications',
  'certificationDetail',
  'certificationEdit',
  'chat',
  'chatChannel',
  'chatbot',
  'notifications',
  'settings',
  'settingsStorage',
  'settingsOfflineMaps',
  'accountSecurity',
  'approveSignIn',
  'login',
  'loginSso',
  'loginRecovery',
  'ssoReturn',
  'onboarding',
  'maintenance',
]);

export const nav = defineNav([
  // `/` hands over to the member home (shell.homeRoute); the home's Personnel / Units / Calls tabs are top-level screens.
  { id: 'root', href: '/', placement: 'hidden', labelKey: 'tabs.home', defaultLabel: 'Home' },
  ...featureNav(memberHomeNav, 'sidebar', { order: 0, overrides: { home: { nestedTabs: true } } }),
  ...featureNav(messagesNav, 'sidebar', { order: 10 }),
  ...featureNav(contactsNav, 'sidebar', { order: 20 }),
  ...featureNav(mapNav, 'sidebar', { order: 25 }),
  ...featureNav(notesNav, 'sidebar', { order: 30 }),
  ...featureNav(protocolsNav, 'sidebar', { order: 31 }),
  ...featureNav(calendarNav, 'sidebar', { order: 40 }),
  ...featureNav(shiftsNav, 'sidebar', { order: 41 }),
  ...featureNav(weatherAlertsNav, { 'weather-alerts': 'sidebar' }, { order: 50 }),
  ...featureNav(checklistsNav, 'sidebar', { order: 60 }),
  ...featureNav(recordsNav, 'sidebar', { order: 61, overrides: { records: { requiresFlag: [FeatureFlagKeys.RecordsSystem, FeatureFlagKeys.RecordsFieldResponder] } } }),
  ...featureNav(operationsNav, 'sidebar', { order: 62 }),
  ...featureNav(workOrdersNav, 'sidebar', { order: 63 }),
  ...featureNav(certificationsNav, 'sidebar', { order: 64 }),
  ...featureNav(chatNav, 'sidebar', { order: 70 }),
  ...featureNav(notificationsNav, 'sidebar', { order: 80 }),
  ...featureNav(callsNav, { 'call-new': 'hidden' }),
  ...featureNav(settingsNavEntries, variant),
  ...featureNav(offlineMapsNav, 'hidden', { order: 906 }),
  // auth-ui and approve-sign-in both describe the approve screen; the approve-sign-in module's entry is the one.
  ...featureNav(authNavEntries, { 'account-security': 'hidden' }),
  ...featureNav(approveSignInNav, 'hidden', { order: 920 }),
  detailNav.callDetail,
  detailNav.callEdit,
  detailNav.personnelDetail,
  detailNav.unitDetail,
  detailNav.contactDetail,
  detailNav.poiDetail,
  detailNav.weatherAlertDetail,
  detailNav.chatChannel,
]);
