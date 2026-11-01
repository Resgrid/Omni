/**
 * The canonical route table (omni-plan §5.3.4): one path per screen for every variant. A variant declares which of
 * these it has (`defineRoutes`); links to the others are hidden, never broken. Add a screen here once, with its
 * canonical path, before any variant adds the route file.
 *
 * Do not reintroduce `/weather-alert/[id]`, `/weather-alert-detail` or `[...messing]`.
 */
export interface RouteSpec<P extends string = string, A extends readonly string[] = readonly string[]> {
  /** expo-router path pattern (groups stripped): `/call/[id]`. */
  readonly pattern: P;
  /** Dynamic segment names in order; the href builder takes them positionally. */
  readonly params: A;
}

const route = <const P extends string, const A extends readonly string[] = readonly []>(pattern: P, params?: A): RouteSpec<P, A> => ({ pattern, params: (params ?? []) as A });

export const CANONICAL_ROUTES = {
  home: route('/'),
  missing: route('/[...missing]', ['missing']),
  calls: route('/calls'),
  callDetail: route('/call/[id]', ['id']),
  callEdit: route('/call/[id]/edit', ['id']),
  callNew: route('/call/new'),
  weatherAlerts: route('/weather-alerts'),
  weatherAlertDetail: route('/weather-alerts/[id]', ['id']),
  poiDetail: route('/poi/[id]', ['id']),
  chat: route('/chat'),
  chatChannel: route('/chat/[channelId]', ['channelId']),
  chatbot: route('/chatbot'),
  messages: route('/messages'),
  messageDetail: route('/messages/[id]', ['id']),
  records: route('/records'),
  recordDetail: route('/records/[id]', ['id']),
  recordNew: route('/records/new'),
  settings: route('/settings'),
  accountSecurity: route('/settings/account-security'),
  settingsStorage: route('/settings/storage'),
  maps: route('/maps'),
  mapsSearch: route('/maps/search'),
  customMap: route('/maps/custom/[id]', ['id']),
  indoorMap: route('/maps/indoor/[id]', ['id']),
  workOrderDetail: route('/work-orders/[id]', ['id']),
  approveSignIn: route('/approve-sign-in'),
  ssoReturn: route('/sso-return'),
} as const;

export type CanonicalRoutes = typeof CANONICAL_ROUTES;
export type RouteKey = keyof CanonicalRoutes;
export type RouteParamNames<K extends RouteKey> = CanonicalRoutes[K]['params'];

export const ROUTE_KEYS = Object.keys(CANONICAL_ROUTES) as RouteKey[];

export const isRouteKey = (value: string): value is RouteKey => Object.prototype.hasOwnProperty.call(CANONICAL_ROUTES, value);
