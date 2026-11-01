import { type EndpointDefinition } from './core';
import { authDiscoveryEndpoints } from './endpoints/auth-discovery/auth-discovery';
import { awaitingResourcesEndpoints } from './endpoints/awaiting-resources/awaiting-resources';
import { calendarEndpoints } from './endpoints/calendar/calendar';
import { callFilesEndpoints } from './endpoints/call-files/call-files';
import { callVideoFeedsEndpoints } from './endpoints/call-video-feeds/call-video-feeds';
import { callsEndpoints } from './endpoints/calls/calls';
import { certificationsEndpoints } from './endpoints/certifications/certifications';
import { chatEndpoints } from './endpoints/chat/chat';
import { checkInTimersEndpoints } from './endpoints/check-in-timers/check-in-timers';
import { checklistsEndpoints } from './endpoints/checklists/checklists';
import { communicationTestsEndpoints } from './endpoints/communication-tests/communication-tests';
import { configEndpoints } from './endpoints/config/config';
import { contactsEndpoints } from './endpoints/contacts/contacts';
import { dataProtectionEndpoints } from './endpoints/data-protection/data-protection';
import { devicesEndpoints } from './endpoints/devices/devices';
import { dispatchEndpoints } from './endpoints/dispatch/dispatch';
import { featureFlagsEndpoints } from './endpoints/feature-flags/feature-flags';
import { formsEndpoints } from './endpoints/forms/forms';
import { geocodingEndpoints } from './endpoints/geocoding/geocoding';
import { groupsEndpoints } from './endpoints/groups/groups';
import { healthEndpoints } from './endpoints/health/health';
import { inboxEndpoints } from './endpoints/inbox/inbox';
import { incidentCommandEndpoints } from './endpoints/incident-command/incident-command';
import { inventoryEndpoints } from './endpoints/inventory/inventory';
import { mappingEndpoints } from './endpoints/mapping/mapping';
import { messagesEndpoints } from './endpoints/messages/messages';
import { notesEndpoints } from './endpoints/notes/notes';
import { operationsEndpoints } from './endpoints/operations/operations';
import { personnelEndpoints } from './endpoints/personnel/personnel';
import { protocolsEndpoints } from './endpoints/protocols/protocols';
import { recordsEndpoints } from './endpoints/records/records';
import { routesEndpoints } from './endpoints/routes/routes';
import { runCardsEndpoints } from './endpoints/run-cards/run-cards';
import { securityEndpoints } from './endpoints/security/security';
import { shiftsEndpoints } from './endpoints/shifts/shifts';
import { statusesEndpoints } from './endpoints/statuses/statuses';
import { syncEndpoints } from './endpoints/sync/sync';
import { unitsEndpoints } from './endpoints/units/units';
import { userDefinedFieldsEndpoints } from './endpoints/user-defined-fields/user-defined-fields';
import { voiceEndpoints } from './endpoints/voice/voice';
import { weatherAlertsEndpoints } from './endpoints/weather-alerts/weather-alerts';
import { workOrdersEndpoints } from './endpoints/work-orders/work-orders';

/** Every endpoint definition in the package, grouped by domain. The contract test checks each one against Swagger. */
export const endpointDomains = {
  'auth-discovery': authDiscoveryEndpoints,
  'awaiting-resources': awaitingResourcesEndpoints,
  calendar: calendarEndpoints,
  'call-files': callFilesEndpoints,
  'call-video-feeds': callVideoFeedsEndpoints,
  calls: callsEndpoints,
  certifications: certificationsEndpoints,
  chat: chatEndpoints,
  'check-in-timers': checkInTimersEndpoints,
  checklists: checklistsEndpoints,
  'communication-tests': communicationTestsEndpoints,
  config: configEndpoints,
  contacts: contactsEndpoints,
  'data-protection': dataProtectionEndpoints,
  devices: devicesEndpoints,
  dispatch: dispatchEndpoints,
  'feature-flags': featureFlagsEndpoints,
  forms: formsEndpoints,
  geocoding: geocodingEndpoints,
  groups: groupsEndpoints,
  health: healthEndpoints,
  inbox: inboxEndpoints,
  'incident-command': incidentCommandEndpoints,
  inventory: inventoryEndpoints,
  mapping: mappingEndpoints,
  messages: messagesEndpoints,
  notes: notesEndpoints,
  operations: operationsEndpoints,
  personnel: personnelEndpoints,
  protocols: protocolsEndpoints,
  records: recordsEndpoints,
  routes: routesEndpoints,
  'run-cards': runCardsEndpoints,
  security: securityEndpoints,
  shifts: shiftsEndpoints,
  statuses: statusesEndpoints,
  sync: syncEndpoints,
  units: unitsEndpoints,
  'user-defined-fields': userDefinedFieldsEndpoints,
  voice: voiceEndpoints,
  'weather-alerts': weatherAlertsEndpoints,
  'work-orders': workOrdersEndpoints,
} as const;

/** Flat list of all endpoint definitions. */
export const endpointRegistry: readonly EndpointDefinition[] = Object.values(endpointDomains).flatMap((domain) => Object.values(domain));
