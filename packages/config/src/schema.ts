import { z } from 'zod';

/**
 * Variant manifest schema (omni-plan §5.3). Each app's build-time and runtime facts live in
 * `apps/omni/variants/<id>/variant.json`; this schema is the single definition of their shape.
 * Identity and storage values are frozen once released — changing them breaks store continuity
 * or signs users out (see AGENTS.md "Never change without a migration and an upgrade test").
 */

export const VARIANT_IDS = ['responder', 'unit', 'ic', 'dispatch', 'bigboard'] as const;
export const variantIdSchema = z.enum(VARIANT_IDS);
export type VariantId = z.infer<typeof variantIdSchema>;

export const APP_ENVS = ['development', 'staging', 'internal', 'production'] as const;
export const appEnvSchema = z.enum(APP_ENVS);
export type AppEnv = z.infer<typeof appEnvSchema>;

export const NATIVE_MODULES = [
  'background-location',
  'task-manager',
  'livekit',
  'callkeep',
  'ble-manager',
  'live-activity',
  'calendar',
  'permissions',
  'secure-store',
  'video',
  'passkey',
  'media-button',
  'in-call-audio',
  'maplibre',
  'sqlite',
  'notifee',
] as const;
export const nativeModuleSchema = z.enum(NATIVE_MODULES);
export type NativeModuleId = z.infer<typeof nativeModuleSchema>;

export const FEATURE_MODULES = [
  'member-home',
  'calendar',
  'shifts',
  'messages',
  'staffing',
  'work-orders',
  'certifications',
  'approve-sign-in',
  'unit-status',
  'unit-routes',
  'inventory',
  'incident-command',
  'dispatch-console',
  'runcards',
  'call-queues',
  'awaiting-resources',
  'dashboard',
] as const;
export const featureModuleSchema = z.enum(FEATURE_MODULES);
export type FeatureModuleId = z.infer<typeof featureModuleSchema>;

const identitySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  owner: z.string().min(1),
  easProjectId: z.string().uuid(),
  clientId: z.string().min(1),
  ios: z.object({
    bundleIdentifier: z.string().min(1),
    associatedDomains: z.array(z.string()),
    appGroup: z.string().nullable(),
  }),
  android: z.object({ package: z.string().min(1) }),
  schemes: z.array(z.string().min(1)).min(1),
  ssoReturnScheme: z.string().nullable(),
  electron: z.object({ appId: z.string().min(1), productName: z.string().min(1), protocol: z.string().nullable() }),
  web: z.object({ dockerImage: z.string().min(1), legacyEnvPrefix: z.string().regex(/^[A-Z]+_$/) }),
  sentryProject: z.string().min(1),
  notificationColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  adaptiveIconBackground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  splashBackground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  splashBackgroundDark: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

/**
 * How an MMKV instance the legacy app wrote is carried into Omni on upgrade (plan D8). Every native instance is
 * encrypted with a key generated on the device and kept in SecureStore; an instance without a carry-over entry is
 * deleted and starts empty the first time Omni opens it (the user signs in again).
 */
export const storageCarryOverSchema = z.discriminatedUnion('from', [
  // Opened once with the legacy app's fixed key, then re-encrypted in place with a device key.
  z.object({ from: z.literal('fixed-key'), key: z.string().min(1) }),
  // Already encrypted with a device key the legacy app kept in SecureStore under `name`: that key is adopted.
  z.object({ from: z.literal('secure-store'), name: z.string().min(1) }),
  // Written without encryption: encrypted in place with a device key.
  z.object({ from: z.literal('unencrypted') }),
]);
export type StorageCarryOver = z.infer<typeof storageCarryOverSchema>;

const storageSchema = z
  .object({
    mmkvId: z.string().min(1),
    extraInstances: z.array(z.string()),
    carryOver: z.record(z.string(), storageCarryOverSchema).optional(),
  })
  .refine((storage) => Object.keys(storage.carryOver ?? {}).every((id) => id === storage.mmkvId || storage.extraInstances.includes(id)), {
    message: 'storage.carryOver may only name declared instances (mmkvId or extraInstances)',
  });

const versioningSchema = z.object({
  tagPrefix: z.string().regex(/^[a-z]+-v$/),
  major: z.number().int().positive(),
  buildNumberBase: z.number().int().nonnegative(),
});

export const capabilitiesSchema = z.object({
  calls: z.object({
    create: z.enum(['none', 'quick', 'full']),
    dispatch: z.boolean(),
    close: z.boolean(),
    queues: z.boolean(),
    runCards: z.boolean(),
    /**
     * The nearest-unit board (`/Dispatch/GetNearestUnits`) in the dispatch picker and on the call location map: rows
     * ranked closest first by response time, Nearest badges, distance and ETA, resources and boundaries on the map. The
     * dispatch desk's tool (legacy Dispatch only); other apps keep the plain picker.
     */
    nearestBoard: z.boolean(),
    /**
     * Setting a destination's availability (a hospital on diversion, closed, or with a service down) from the POI screen
     * (`/Mapping/SetPoiAvailability`, Core checks the caller may create calls). The desks that track hospitals: Dispatch
     * and IC. Every app shows availability and capabilities; only these change them.
     */
    destinationAvailability: z.boolean(),
    /**
     * Releasing (standing down) any unit or person from an open call without closing it (`/Calls/ReleaseUnit`,
     * `/Calls/ReleasePersonnel`): an ambulance on scene stands the physician car down and it is free for the next call.
     * Offered to members who may edit the call (Core's `CanUserEditCallAsync`) on the desks that run calls: Dispatch and IC.
     */
    releaseResources: z.boolean(),
    /**
     * Releasing the crew's own active unit from its open call ("we were stood down"), where the device sets a unit's
     * status (Unit). Core accepts it from anyone allowed to set that unit's status.
     */
    releaseOwnUnit: z.boolean(),
    /**
     * Recurring calls (`/RecurringCalls/*`, Core M0319/M0320): schedules that dispatch a call on a pattern (interfacility
     * transfers every Tuesday and Thursday at 08:00 and 13:00), the scheduled calls calendar with per-occurrence actions,
     * and the dispatcher alerts (missed, held for no resources, resources unavailable, dispatcher-mode occurrence due) with
     * their badge and banner. The dispatch desk's module, beside the pending and scheduled call queues: Dispatch.
     */
    recurringCalls: z.boolean(),
    /**
     * The dispatcher desk ("Dispatchers on duty", `/DispatcherDesk/*`, Core M0324): dispatchers sign in to the desk, which
     * routes pending and scheduled calls, texts, emails, chats and held phone calls to a free dispatcher (offer, accept,
     * queue), plan and take breaks against the department's coverage minimum, and see the team's timeline. Brings the desk
     * status bar, the offer alert, the desk pushes (`DQ:`/`DB:`, a Dispatch-only Novu subscriber the app registers on),
     * the realtime desk events and quiet alerts while on break. Dispatch only.
     */
    dispatcherDesk: z.boolean(),
  }),
  /**
   * `holdToConfirm`: the app honours the department's "Hold to set status" (config `StatusHoldToConfirm`) — on its iOS
   * and Android builds only (phone and tablet). Off where status is set from a desk (Dispatch, IC, BigBoard), and on
   * web and Electron, so status changes there are never delayed (owner decision, plan §15 #24).
   */
  status: z.object({ subject: z.enum(['personnel', 'unit']), onBehalf: z.boolean(), staffing: z.boolean(), holdToConfirm: z.boolean() }),
  incidentCommand: z.enum(['none', 'view', 'assist', 'command']),
  checkIn: z.object({ self: z.boolean(), others: z.boolean(), actions: z.boolean() }),
  videoFeeds: z.enum(['none', 'view', 'manage']),
  weatherAlerts: z.object({ admin: z.boolean() }),
  voice: z.object({ ptt: z.boolean(), callKeep: z.boolean(), bluetoothPtt: z.boolean(), headsetButtonPtt: z.boolean(), desktopPtt: z.boolean() }),
  location: z.object({ background: z.boolean(), transmission: z.enum(['person', 'unit', 'none']), geoHubDefault: z.boolean() }),
  /**
   * `soundSet`: the notification sounds the app ships (Android channel sounds, iOS push sounds, the in-app player on every
   * platform). `shared`: the modern set in `apps/omni/assets/audio`. `dispatch`: the Dispatch set in
   * `apps/omni/variants/dispatch/assets/audio` — every modern sound re-voiced in the Dispatch console timbre under the
   * same names, so a dispatcher tells its alerts from a Responder or Unit app on the same desk, plus the dispatcher desk
   * sounds (Core sound types 28–32), whose channels only an app with this set creates. Custom call tones stay shared.
   *
   * `source`: the push `Source` a `user`-subject app sends with every device registration and removal, so Core can keep
   * the app's tokens on its own Novu push integrations (APNs topic, Firebase project) instead of Responder's. Permanent
   * once shipped (AGENTS.md identity list; identifier registry): Dispatch sends `Dispatch`; Responder and BigBoard send
   * none; IC's `IC` comes with its `icUser` subject. Core treats a `Source` it does not know as none.
   */
  push: z
    .object({
      subject: z.enum(['user', 'unit', 'icUser', 'none']),
      desktopPush: z.boolean(),
      liveActivity: z.boolean(),
      approveSignIns: z.boolean(),
      soundSet: z.enum(['shared', 'dispatch']),
      source: z
        .string()
        .regex(/^[A-Za-z][A-Za-z0-9]*$/)
        .optional(),
    })
    .refine((push) => push.source === undefined || push.subject === 'user', { message: 'push.source is only for the user subject (IC sends its own Source)', path: ['source'] }),
  auth: z.object({
    mfa: z.boolean(),
    passkeys: z.boolean(),
    brokeredSso: z.boolean(),
    sharedDevice: z.boolean(),
    personalLock: z.boolean(),
    neverLogoutOnTransientError: z.boolean(),
    appAccessRight: z.enum(['CanLoginToCommandApp', 'CanLoginToDispatchApp']).nullable(),
  }),
  realtime: z.object({ chatHub: z.boolean(), hubWatchdog: z.boolean() }),
  maps: z.object({ layers: z.boolean(), customIndoor: z.boolean(), navigationInApp: z.boolean() }),
  /**
   * `preview`: route plans can be looked at before they run (Core M0322; `features/route-plans`): the plan preview
   * (`/route-plans/[id]` — map with the route line, numbered stops, start and end, the stops, distance, time and profile),
   * opened from the call form and call detail (a call's pre-defined route), the Unit routes list and the desk's routes
   * area; and the department's routes with its running routes and their progress (`/route-plans`, `/route-instances/[id]`,
   * read only). The apps that pick, run or watch routes: Dispatch, Unit and IC. Core lets a member without Route_View read
   * Active plans (Call_View), so drafts and archived plans show only to those with Route_View.
   */
  routes: z.object({ preview: z.boolean() }),
  platform: z.object({ webEdition: z.boolean(), electron: z.boolean(), onboarding: z.boolean(), maintenanceMode: z.boolean() }),
});
export type Capabilities = z.infer<typeof capabilitiesSchema>;

const nativeSchema = z.object({
  modules: z.array(nativeModuleSchema),
  iosBackgroundModes: z.array(z.string()),
  androidPermissions: z.array(z.string()),
  androidBlockedPermissions: z.array(z.string()),
  iosUseStaticFrameworks: z.boolean(),
});

const offlineSchema = z.object({
  cacheTtl: z.enum(['short', 'long']),
  storageBudgetMb: z.number().int().positive(),
  mapPacks: z.enum(['full', 'light', 'display']),
});

const shellSchema = z.object({
  kind: z.enum(['drawer-slot', 'tabs']),
  sidebar: z.object({
    phone: z.enum(['drawer', 'permanent-landscape', 'toggle-panel']),
    tablet: z.enum(['drawer', 'permanent-landscape', 'toggle-panel']),
    desktop: z.enum(['drawer', 'permanent-landscape', 'toggle-panel']),
  }),
  sidebarContent: z.enum(['menu', 'member-menu', 'unit-status']),
  homeRoute: z.string().startsWith('/'),
});

export const variantManifestSchema = z.object({
  id: variantIdSchema,
  displayName: z.string().min(1),
  identity: identitySchema,
  storage: storageSchema,
  versioning: versioningSchema,
  capabilities: capabilitiesSchema,
  modules: z.array(featureModuleSchema),
  native: nativeSchema,
  offline: offlineSchema,
  shell: shellSchema,
});
export type VariantManifest = z.infer<typeof variantManifestSchema>;

export function parseVariantManifest(input: unknown): VariantManifest {
  return variantManifestSchema.parse(input);
}
