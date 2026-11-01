import type { Capabilities } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { Archive, CalendarClock, Hourglass } from 'lucide-react-native';

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

const hasQueues = (capabilities: Capabilities): boolean => capabilities.calls.queues;

export const callQueuesNav: readonly FeatureNavEntry[] = [
  { id: 'pending-calls', href: '/pending-calls', labelKey: 'pending_calls.title', defaultLabel: 'Pending Calls', icon: Hourglass, requiresCapability: hasQueues },
  { id: 'scheduled-calls', href: '/scheduled-calls', labelKey: 'scheduled_calls.title', defaultLabel: 'Scheduled Calls', icon: CalendarClock, requiresCapability: hasQueues },
  { id: 'archived-calls', href: '/archived-calls', labelKey: 'archived_calls.title', defaultLabel: 'Archived Calls', icon: Archive, requiresCapability: hasQueues },
];
