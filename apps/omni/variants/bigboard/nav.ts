import { defineNav, defineRoutes, featureNav } from '@resgrid/app-shell';
import { authNavEntries } from '@resgrid/features/auth-ui/nav';
import { callsNav } from '@resgrid/features/calls/nav';
import { contactsNav } from '@resgrid/features/contacts/nav';
import { dashboardNav } from '@resgrid/features/dashboard/nav';
import { mapNav } from '@resgrid/features/map/nav';
import { notesNav } from '@resgrid/features/notes/nav';
import { personnelNav } from '@resgrid/features/personnel/nav';
import { protocolsNav } from '@resgrid/features/protocols/nav';
import { settingsNavEntries } from '@resgrid/features/settings/nav';
import { unitsNav } from '@resgrid/features/units/nav';
import { weatherAlertsNav } from '@resgrid/features/weather-alerts/nav';

import { detailNav } from '../../detail-nav';
import variant from './variant';

// bigboard navigation and route contract (omni-plan §5.3.4, §5.4). Only routes with a file in ./app belong here; the
// per-variant route contract test (packages/app-shell) fails otherwise. Feature entries come from each feature's nav.ts
// (imported directly so this file stays light). As in the legacy BigBoard, the menu is the dashboard (/home, the
// shell.homeRoute; / hands over to it), the full department map and settings; configure and the full-page lists (calls,
// personnel, units, contacts, notes, protocols, weather alerts) open from the dashboard and its widgets.

export const routes = defineRoutes([
  'home',
  'homeTab',
  'dashboardConfigure',
  'map',
  'calls',
  'callDetail',
  'personnel',
  'personnelDetail',
  'units',
  'unitDetail',
  'contacts',
  'contactDetail',
  'notes',
  'protocols',
  'weatherAlerts',
  'weatherAlertDetail',
  'settings',
  'settingsStorage',
  'accountSecurity',
  'login',
  'loginSso',
  'loginRecovery',
  'ssoReturn',
  'maintenance',
]);

export const nav = defineNav([
  { id: 'root', href: '/', placement: 'hidden', labelKey: 'tabs.home', defaultLabel: 'Home' },
  ...featureNav(dashboardNav, { dashboard: 'sidebar', 'dashboard-configure': 'hidden' }, { order: 0 }),
  ...featureNav(mapNav, 'sidebar', { order: 5 }),
  ...featureNav(callsNav, { calls: 'hidden' }, { order: 10 }),
  ...featureNav(personnelNav, 'hidden', { order: 20 }),
  ...featureNav(unitsNav, 'hidden', { order: 21 }),
  ...featureNav(contactsNav, 'hidden', { order: 30 }),
  ...featureNav(notesNav, 'hidden', { order: 31 }),
  ...featureNav(protocolsNav, 'hidden', { order: 32 }),
  ...featureNav(weatherAlertsNav, { 'weather-alerts': 'hidden' }, { order: 40 }),
  ...featureNav(settingsNavEntries, variant),
  ...featureNav(authNavEntries, variant),
  detailNav.callDetail,
  detailNav.personnelDetail,
  detailNav.unitDetail,
  detailNav.contactDetail,
  detailNav.weatherAlertDetail,
]);
