import type { Capabilities, FeatureModuleId } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { UserCheck } from 'lucide-react-native';

import { approveSignInRoutes } from './routes';

/**
 * This feature's nav entries, shaped like the app shell's `NavEntry` minus `placement` (the variant's nav.ts decides
 * tab / sidebar / hidden and spreads these in), so features never import the shell (omni-plan §5.4).
 */
export interface FeatureNavEntry {
  id: string;
  /** Static route path inside the variant's `(app)` group. */
  href: string;
  labelKey: string;
  defaultLabel?: string;
  /** Department terminology key (`TermKeys.*`). */
  termKey?: string;
  icon?: LucideIcon;
  /** Department feature flag(s); unknown flags are disabled. */
  requiresFlag?: string | readonly string[];
  requiresCapability?: (capabilities: Capabilities) => boolean;
  /** Feature module the variant must ship (`variant.modules`). */
  requiresModule?: FeatureModuleId;
}

/**
 * Opened from the approval push, Settings → Account and `PendingApprovalWatcher`, never from the menu: register it
 * `hidden`. Same route as auth-ui's `approve-sign-in` entry; a variant registers one of the two.
 */
export const approveSignInNav: readonly FeatureNavEntry[] = [
  {
    id: 'approve-sign-in',
    href: approveSignInRoutes.approveSignIn(),
    labelKey: 'mfa.approve.title',
    defaultLabel: 'Approve sign-in?',
    icon: UserCheck,
    requiresCapability: (capabilities) => capabilities.push.approveSignIns,
    requiresModule: 'approve-sign-in',
  },
];
