import { FeatureFlagKeys } from '@resgrid/auth';
import type { Capabilities } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { Hourglass } from 'lucide-react-native';

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
}

export const awaitingResourcesNav: readonly FeatureNavEntry[] = [
  {
    id: 'awaiting-resources',
    href: '/awaiting-resources',
    labelKey: 'awaiting_resources.title',
    defaultLabel: 'Awaiting Resources',
    icon: Hourglass,
    requiresFlag: [FeatureFlagKeys.DispatchRunCards, FeatureFlagKeys.DispatchRunCardConditions],
    requiresCapability: (capabilities) => capabilities.calls.runCards,
  },
];
