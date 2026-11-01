import { authRoutes } from '@resgrid/features/auth-ui';

/** Href builders for the Settings screens (omni-plan §5.3.4 canonical paths). */
export const settingsRoutes = {
  settings: (): string => '/settings',
  /** Settings → Advanced → Storage & sync (plan §8.2a); replaces IC's `/settings/offline-queue`. */
  storageSync: (): string => '/settings/storage-sync',
  accountSecurity: authRoutes.accountSecurity,
  sharedDevice: authRoutes.sharedDevice,
  approveSignIn: authRoutes.approveSignIn,
} as const;

export type SettingsRouteName = keyof typeof settingsRoutes;
