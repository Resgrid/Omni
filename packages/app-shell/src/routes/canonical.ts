import { recordsFieldFlagKey } from '@resgrid/auth';
import type { FeatureModuleId, VariantManifest } from '@resgrid/config';

/**
 * The canonical route table (omni-plan §5.3.4): one path per screen for every variant. A variant declares which of
 * these it has (`defineRoutes`); links to the others are hidden, never broken. Add a screen here once, with its
 * canonical path, before any variant adds the route file.
 *
 * `requires` / `module` say which variants may have the route at all (the same capability or module the screen and its
 * links check). The per-variant route contract test fails when a variant declares a route it is not entitled to, and
 * when a feature screen the variant ships links to a route the variant is entitled to but has not declared.
 *
 * Do not reintroduce `/weather-alert/[id]`, `/weather-alert-detail` or `[...messing]`.
 */
export interface RouteSpec<P extends string = string, A extends readonly string[] = readonly string[]> {
  /** expo-router path pattern (groups stripped): `/call/[id]`. */
  readonly pattern: P;
  /** Dynamic segment names in order; the href builder takes them positionally. */
  readonly params: A;
  /** Only variants for which this returns true may declare the route (a capability check, never the variant id). */
  readonly requires?: (manifest: VariantManifest) => boolean;
  /** Only variants that ship this feature module (`variant.modules`) may declare the route. */
  readonly module?: FeatureModuleId;
}

interface RouteGate {
  requires?: (manifest: VariantManifest) => boolean;
  module?: FeatureModuleId;
}

const route = <const P extends string, const A extends readonly string[] = readonly []>(pattern: P, params?: A, gate: RouteGate = {}): RouteSpec<P, A> => ({
  pattern,
  params: (params ?? []) as A,
  ...gate,
});

const canCreateCalls = (m: VariantManifest): boolean => m.capabilities.calls.create !== 'none';
const hasChatHub = (m: VariantManifest): boolean => m.capabilities.realtime.chatHub;
/** Field Records exist where the variant has its own `Records.Field.<App>` flag (BigBoard has none). */
const hasFieldRecords = (m: VariantManifest): boolean => recordsFieldFlagKey(m.id) !== null;
const commandTier = { requires: (m: VariantManifest) => m.capabilities.incidentCommand === 'command', module: 'incident-command' } as const;

export const CANONICAL_ROUTES = {
  home: route('/'),
  /** The variant's `shell.homeRoute` when it is not `/` (Responder's member home; later Dispatch's console, BigBoard's dashboard). */
  homeTab: route('/home'),
  memberHomePersonnel: route('/home/personnel', [], { module: 'member-home' }),
  memberHomeUnits: route('/home/units', [], { module: 'member-home' }),
  memberHomeCalls: route('/home/calls', [], { module: 'member-home' }),
  missing: route('/[...missing]', ['missing']),
  calls: route('/calls'),
  callDetail: route('/call/[id]', ['id']),
  callEdit: route('/call/[id]/edit', ['id'], { requires: canCreateCalls }),
  callNew: route('/call/new', [], { requires: canCreateCalls }),
  /** Dispatch's full-screen board for a call (assist tier; IC commands from /command, R/U see the call tab only). */
  callCommand: route('/call/[id]/command', ['id'], { requires: (m) => m.capabilities.incidentCommand === 'assist' }),
  commandBoard: route('/command', [], commandTier),
  incidents: route('/incidents', [], commandTier),
  commandLog: route('/command-log/[callId]', ['callId'], commandTier),
  commandMap: route('/command-map/[callId]', ['callId'], commandTier),
  resourceMap: route('/resource-map', [], commandTier),
  protocols: route('/protocols'),
  notes: route('/notes'),
  units: route('/units'),
  unitDetail: route('/units/[id]', ['id']),
  personnel: route('/personnel'),
  personnelDetail: route('/personnel/[id]', ['id']),
  contacts: route('/contacts'),
  contactDetail: route('/contacts/[id]', ['id']),
  pois: route('/pois'),
  poiDetail: route('/poi/[id]', ['id']),
  weatherAlerts: route('/weather-alerts'),
  weatherAlertDetail: route('/weather-alerts/[id]', ['id']),
  weatherAlertSettings: route('/weather-alerts/settings', [], { requires: (m) => m.capabilities.weatherAlerts.admin }),
  chat: route('/chat', [], { requires: hasChatHub }),
  chatChannel: route('/chat/[channelId]', ['channelId'], { requires: hasChatHub }),
  chatbot: route('/chatbot', [], { requires: hasChatHub }),
  notifications: route('/notifications', [], { requires: (m) => m.capabilities.push.subject !== 'none' }),
  messages: route('/messages', [], { module: 'messages' }),
  messageDetail: route('/messages/[id]', ['id'], { module: 'messages' }),
  records: route('/records', [], { requires: hasFieldRecords }),
  recordDetail: route('/records/[id]', ['id'], { requires: hasFieldRecords }),
  recordNew: route('/records/new', [], { requires: hasFieldRecords }),
  recordDeployments: route('/records/deployments', [], { requires: hasFieldRecords }),
  recordDeployment: route('/records/deployments/[id]', ['id'], { requires: hasFieldRecords }),
  recordConnectors: route('/records/connectors', [], { requires: hasFieldRecords }),
  recordConnector: route('/records/connectors/[id]', ['id'], { requires: hasFieldRecords }),
  operations: route('/operations'),
  operationDetail: route('/operations/[id]', ['id']),
  /** Readiness checks are for field devices that check in themselves (the member or the apparatus). */
  checklists: route('/checklists', [], { requires: (m) => m.capabilities.checkIn.self }),
  calendar: route('/calendar', [], { module: 'calendar' }),
  certifications: route('/certifications', [], { module: 'certifications' }),
  certificationDetail: route('/certifications/[id]', ['id'], { module: 'certifications' }),
  certificationEdit: route('/certifications/edit', [], { module: 'certifications' }),
  shifts: route('/shifts', [], { module: 'shifts' }),
  shiftDay: route('/shifts/day/[id]', ['id'], { module: 'shifts' }),
  shiftTrade: route('/shifts/trade/[id]', ['id'], { module: 'shifts' }),
  workOrders: route('/work-orders', [], { module: 'work-orders' }),
  workOrderNew: route('/work-orders/new', [], { module: 'work-orders' }),
  settings: route('/settings'),
  accountSecurity: route('/settings/account-security', [], { requires: (m) => m.capabilities.auth.mfa || m.capabilities.auth.passkeys }),
  /** Settings → Advanced → Storage & sync (plan §8.2a); replaces IC's `/settings/offline-queue`. */
  settingsStorage: route('/settings/storage-sync'),
  /** Settings → Offline maps (MapLibre plan §19.8): variants that download packs; iOS/Android only at run time. */
  settingsOfflineMaps: route('/settings/offline-maps', [], { requires: (m) => m.offline.mapPacks !== 'display' }),
  /** The department map (features/map; `?callId=`, `?unitId=`, `?userId=`, `?poiId=` focus a pin). `/maps` is the custom/indoor maps browser. */
  map: route('/map'),
  maps: route('/maps'),
  mapsSearch: route('/maps/search'),
  customMap: route('/maps/custom/[id]', ['id']),
  indoorMap: route('/maps/indoor/[id]', ['id']),
  workOrderDetail: route('/work-orders/[id]', ['id'], { module: 'work-orders' }),
  approveSignIn: route('/approve-sign-in', [], { requires: (m) => m.capabilities.push.approveSignIns, module: 'approve-sign-in' }),
  // Unit: the status console (Electron MDT / desktop), the routes stack and the unit's inventory counts.
  unitConsole: route('/console', [], { module: 'unit-status' }),
  unitRoutes: route('/routes', [], { module: 'unit-routes' }),
  unitRouteStart: route('/routes/start', [], { module: 'unit-routes' }),
  unitRouteActive: route('/routes/active', [], { module: 'unit-routes' }),
  unitRouteDirections: route('/routes/directions', [], { module: 'unit-routes' }),
  unitRoutePoi: route('/routes/poi/[id]', ['id'], { module: 'unit-routes' }),
  unitRouteStop: route('/routes/stop/[id]', ['id'], { module: 'unit-routes' }),
  unitRouteStopContact: route('/routes/stop/contact', [], { module: 'unit-routes' }),
  unitRouteHistory: route('/routes/history/[planId]', ['planId'], { module: 'unit-routes' }),
  unitRouteInstance: route('/routes/history/instance/[id]', ['id'], { module: 'unit-routes' }),
  inventory: route('/inventory', [], { module: 'inventory' }),
  inventoryCount: route('/inventory/count/[id]', ['id'], { module: 'inventory' }),
  // BigBoard: the dashboard lives at /home (homeTab); its configure screen takes ?widget=.
  dashboardConfigure: route('/configure', [], { module: 'dashboard' }),
  // Dispatch: call queues and awaiting resources (conditional run cards).
  pendingCalls: route('/pending-calls', [], { requires: (m) => m.capabilities.calls.queues, module: 'call-queues' }),
  scheduledCalls: route('/scheduled-calls', [], { requires: (m) => m.capabilities.calls.queues, module: 'call-queues' }),
  archivedCalls: route('/archived-calls', [], { requires: (m) => m.capabilities.calls.queues, module: 'call-queues' }),
  awaitingResources: route('/awaiting-resources', [], { requires: (m) => m.capabilities.calls.runCards, module: 'awaiting-resources' }),
  // Public routes (outside the gated `(app)` group): the sign-in pages for deep links and the web, and the SSO return.
  login: route('/login'),
  loginSso: route('/login/sso'),
  loginRecovery: route('/login/recovery'),
  loginSharedDevice: route('/login/shared-device', [], { requires: (m) => m.capabilities.auth.sharedDevice }),
  onboarding: route('/onboarding', [], { requires: (m) => m.capabilities.platform.onboarding }),
  maintenance: route('/maintenance', [], { requires: (m) => m.capabilities.platform.maintenanceMode }),
  lockscreen: route('/lockscreen', [], { requires: (m) => m.capabilities.auth.personalLock }),
  ssoReturn: route('/sso-return', [], { requires: (m) => m.capabilities.auth.brokeredSso }),
} as const;

export type CanonicalRoutes = typeof CANONICAL_ROUTES;
export type RouteKey = keyof CanonicalRoutes;
export type RouteParamNames<K extends RouteKey> = CanonicalRoutes[K]['params'];

export const ROUTE_KEYS = Object.keys(CANONICAL_ROUTES) as RouteKey[];

export const isRouteKey = (value: string): value is RouteKey => Object.prototype.hasOwnProperty.call(CANONICAL_ROUTES, value);

/** Whether a variant is entitled to a canonical route (its capability and module gates pass). */
export function isRouteAvailableFor(key: RouteKey, manifest: VariantManifest): boolean {
  const spec: RouteSpec = CANONICAL_ROUTES[key];
  if (spec.module && !manifest.modules.includes(spec.module)) {
    return false;
  }
  return spec.requires ? spec.requires(manifest) : true;
}
