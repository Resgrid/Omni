import type { VariantManifest } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { ShieldCheck, UserCheck } from 'lucide-react-native';

import { authRoutes } from './routes';

/** Where a feature's screen appears in the shell (omni-plan §5.4 nav registry). */
export type NavPlacement = 'tab' | 'sidebar' | 'hidden';

/**
 * A feature's entry for the app-shell nav registry: the shell maps it onto `Tabs.Screen` / sidebar items. `placement` is
 * decided from the variant manifest (capabilities, shell kind), never from the variant id; `null` means the variant does
 * not get the screen at all.
 */
export interface FeatureNavEntry {
  id: string;
  href: string;
  /** Translation key of the label. */
  titleKey: string;
  icon: LucideIcon;
  order: number;
  placement: (manifest: VariantManifest) => NavPlacement | null;
}

export const authNavEntries: readonly FeatureNavEntry[] = [
  {
    id: 'account-security',
    href: authRoutes.accountSecurity(),
    titleKey: 'mfa.account.title',
    icon: ShieldCheck,
    order: 910,
    // Reached from Settings → Account; every variant with MFA or passkeys has it.
    placement: (manifest) => (manifest.capabilities.auth.mfa || manifest.capabilities.auth.passkeys ? 'hidden' : null),
  },
  {
    id: 'approve-sign-in',
    href: authRoutes.approveSignIn(),
    titleKey: 'mfa.approve.title',
    icon: UserCheck,
    order: 920,
    // Opened from the approval push; Responder only.
    placement: (manifest) => (manifest.capabilities.push.approveSignIns ? 'hidden' : null),
  },
];
