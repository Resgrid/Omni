import { FeatureFlagKeys } from '@resgrid/auth';
import type { Capabilities } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { BriefcaseBusiness } from 'lucide-react-native';

/**
 * This feature's nav entries, shaped like the app shell's `NavEntry` minus `placement` (the variant's nav.ts decides
 * tab / sidebar / hidden and spreads these in), so features never import the shell (omni-plan §5.4).
 */
export interface OperationsNavEntry {
  id: string;
  /** Static route path inside the variant's `(app)` group. */
  href: string;
  labelKey: string;
  defaultLabel?: string;
  /** Department terminology key (`TermKeys.*`). */
  termKey?: string;
  icon?: LucideIcon;
  /** Department feature flag(s); every one must be enabled. Unknown flags are disabled. */
  requiresFlag?: string | readonly string[];
  requiresCapability?: (capabilities: Capabilities) => boolean;
}

/**
 * Deployments (Workforce & Business Operations). All four legacy field apps (Responder, Unit, IC, Dispatch) ship it;
 * Dispatch is read-only (see `resolveOperationsCapabilities`). BigBoard has no entry. Gated by `Operations.Deployments`.
 */
export const operationsNav: readonly OperationsNavEntry[] = [
  {
    id: 'operations',
    href: '/operations',
    labelKey: 'operations.title',
    defaultLabel: 'Deployments',
    icon: BriefcaseBusiness,
    requiresFlag: FeatureFlagKeys.Deployments,
  },
];
