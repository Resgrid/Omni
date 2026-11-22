import type { Capabilities } from '@resgrid/config';
import type { NavBadge } from '@resgrid/data';
import type { LucideIcon } from 'lucide-react-native';
import { Headset } from 'lucide-react-native';

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
  /** Count shown on the entry. */
  badge?: NavBadge;
}

const hasDispatcherDesk = (capabilities: Capabilities): boolean => capabilities.calls.dispatcherDesk;

/**
 * The dispatcher desk (Dispatch): the queue with the count of work offered to the member plus work waiting in the shared
 * queue (`deskQueue`, counted on the device). The item, call and breaks screens open from the desk.
 */
export const dispatcherDeskNav: readonly FeatureNavEntry[] = [
  { id: 'dispatcher-desk', href: '/desk', labelKey: 'dispatcher_desk.title', defaultLabel: 'Dispatcher Desk', icon: Headset, badge: 'deskQueue', requiresCapability: hasDispatcherDesk },
];
