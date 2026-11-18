import type { Capabilities } from '@resgrid/config';
import type { NavBadge } from '@resgrid/data';
import type { LucideIcon } from 'lucide-react-native';
import { BellRing, Repeat } from 'lucide-react-native';

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

const hasRecurringCalls = (capabilities: Capabilities): boolean => capabilities.calls.recurringCalls;

/**
 * Recurring calls (Dispatch): the schedules (their calendar, form and detail open from there), and the dispatcher alerts
 * with the count of open ones. Both need `capabilities.calls.recurringCalls`; Core has no department flag for them.
 */
export const recurringCallsNav: readonly FeatureNavEntry[] = [
  { id: 'recurring-calls', href: '/recurring-calls', labelKey: 'recurring_calls.title', defaultLabel: 'Recurring Calls', icon: Repeat, requiresCapability: hasRecurringCalls },
  {
    id: 'recurring-call-alerts',
    href: '/recurring-call-alerts',
    labelKey: 'recurring_calls.alerts.title',
    defaultLabel: 'Recurring Call Alerts',
    icon: BellRing,
    badge: 'recurringCallAlerts',
    requiresCapability: hasRecurringCalls,
  },
];
