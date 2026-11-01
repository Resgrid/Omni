import type { Capabilities } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { LayoutDashboard, Settings2 } from 'lucide-react-native';

import { DASHBOARD_ROUTE_PATTERNS } from './routes';

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

/** BigBoard's signature module (variant `modules: ["dashboard"]`); only BigBoard's nav registers these. */
export const dashboardNav: readonly FeatureNavEntry[] = [
  { id: 'dashboard', href: DASHBOARD_ROUTE_PATTERNS.home, labelKey: 'dashboard.title', defaultLabel: 'Dashboard', icon: LayoutDashboard },
  { id: 'dashboard-configure', href: DASHBOARD_ROUTE_PATTERNS.configure, labelKey: 'dashboard.configure_title', defaultLabel: 'Configure Dashboard', icon: Settings2 },
];
