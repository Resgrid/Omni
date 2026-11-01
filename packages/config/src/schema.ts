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
});

const storageSchema = z.object({
  mmkvId: z.string().min(1),
  keySecret: z.string().regex(/^[A-Z0-9_]+$/),
  extraInstances: z.array(z.string()),
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
  }),
  status: z.object({ subject: z.enum(['personnel', 'unit']), onBehalf: z.boolean(), staffing: z.boolean() }),
  incidentCommand: z.enum(['none', 'view', 'assist', 'command']),
  checkIn: z.object({ self: z.boolean(), others: z.boolean(), actions: z.boolean() }),
  videoFeeds: z.enum(['none', 'view', 'manage']),
  weatherAlerts: z.object({ admin: z.boolean() }),
  voice: z.object({ ptt: z.boolean(), callKeep: z.boolean(), bluetoothPtt: z.boolean(), headsetButtonPtt: z.boolean(), desktopPtt: z.boolean() }),
  location: z.object({ background: z.boolean(), transmission: z.enum(['person', 'unit', 'none']), geoHubDefault: z.boolean() }),
  push: z.object({ subject: z.enum(['user', 'unit', 'icUser', 'none']), desktopPush: z.boolean(), liveActivity: z.boolean(), approveSignIns: z.boolean() }),
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
  sidebarContent: z.enum(['menu', 'unit-status']),
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
