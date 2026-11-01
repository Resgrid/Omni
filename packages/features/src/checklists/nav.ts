import { FeatureFlagKeys, TermKeys } from '@resgrid/auth';
import type { Capabilities } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { ClipboardCheck } from 'lucide-react-native';

/**
 * This feature's nav entries, shaped like the app shell's `NavEntry` minus `placement` (the variant's nav.ts decides
 * tab / sidebar / hidden and spreads these in), so features never import the shell (omni-plan §5.4).
 */
export interface ChecklistsNavEntry {
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
 * Readiness checklists: field members check themselves (Responder) or their apparatus (Unit). Gated by
 * `Checklists.System` and to field devices (`checkIn.self`: Responder, Unit and IC; Dispatch and BigBoard have no
 * checks to perform). Responder and Unit ship it today.
 */
export const checklistsNav: readonly ChecklistsNavEntry[] = [
  {
    id: 'checklists',
    href: '/checklists',
    labelKey: 'checklists.labels.Checklists',
    defaultLabel: 'Checklists',
    termKey: TermKeys.Checklists,
    icon: ClipboardCheck,
    requiresFlag: FeatureFlagKeys.ChecklistsSystem,
    requiresCapability: (capabilities) => capabilities.checkIn.self,
  },
];
