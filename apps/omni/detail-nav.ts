import type { NavEntry } from '@resgrid/app-shell';

// Hidden nav entries for the feature detail screens every variant registers the same way (variants/<v>/nav.ts spreads
// the ones whose route files it has). A hidden entry registers the route with the shell (tabs shells need one per child
// route) and titles the header; it never shows in a menu or tab bar. Labels reuse the features' existing keys.

const hidden = (id: string, href: string, labelKey: string, defaultLabel: string): NavEntry => ({ id, href, placement: 'hidden', labelKey, defaultLabel });

export const detailNav = {
  callDetail: hidden('call-detail', '/call/[id]', 'call_detail.title', 'Call Details'),
  callEdit: hidden('call-edit', '/call/[id]/edit', 'calls.edit_call', 'Edit Call'),
  unitDetail: hidden('unit-detail', '/units/[id]', 'units.details', 'Unit Details'),
  personnelDetail: hidden('personnel-detail', '/personnel/[id]', 'personnel.details', 'Member Details'),
  contactDetail: hidden('contact-detail', '/contacts/[id]', 'contacts.details', 'Contact Details'),
  poiDetail: hidden('poi-detail', '/poi/[id]', 'pois.title', 'POIs'),
  weatherAlertDetail: hidden('weather-alert-detail', '/weather-alerts/[id]', 'weather_alerts.title', 'Weather Alerts'),
  chatChannel: hidden('chat-channel', '/chat/[channelId]', 'chat.title', 'Chat'),
  callCommand: hidden('call-command', '/call/[id]/command', 'incident_command.tab_title', 'Command'),
  commandLog: hidden('command-log', '/command-log/[callId]', 'incident_command.tab_title', 'Command'),
  commandMap: hidden('command-map', '/command-map/[callId]', 'incident_command.tab_title', 'Command'),
  resourceMap: hidden('resource-map', '/resource-map', 'incident_command.resource_map', 'Resource location'),
} as const satisfies Record<string, NavEntry>;
