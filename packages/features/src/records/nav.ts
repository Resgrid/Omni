import { FeatureFlagKeys, TermKeys } from '@resgrid/auth';
import type { Capabilities } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { FileText } from 'lucide-react-native';

/**
 * This feature's nav entries, shaped like the app shell's `NavEntry` minus `placement` (the variant's nav.ts decides
 * tab / sidebar / hidden and spreads these in), so features never import the shell (omni-plan §5.4).
 */
export interface RecordsNavEntry {
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
 * Field Records home. Responder, Unit, IC and Dispatch each add their own child flag (`Records.Field.<App>`, see
 * `recordsFieldFlagKey()`) to `requiresFlag` in their nav.ts; BigBoard has no field-records flag and no entry.
 */
export const recordsNav: readonly RecordsNavEntry[] = [
  { id: 'records', href: '/records', labelKey: 'tabs.records', defaultLabel: 'Records', termKey: TermKeys.Records, icon: FileText, requiresFlag: [FeatureFlagKeys.RecordsSystem] },
];
