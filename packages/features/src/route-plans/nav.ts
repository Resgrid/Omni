import type { Capabilities } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { Route } from 'lucide-react-native';

/**
 * This feature's nav entries, shaped like the app shell's `NavEntry` minus `placement` (the variant's nav.ts decides
 * tab / sidebar / hidden and spreads these in), so features never import the shell (omni-plan §5.4).
 */
export interface FeatureNavEntry {
  id: string;
  /** Route path inside the variant's `(app)` group. */
  href: string;
  labelKey: string;
  defaultLabel?: string;
  icon?: LucideIcon;
  requiresCapability?: (capabilities: Capabilities) => boolean;
}

/** The plan preview, a detail screen: variants register it hidden (it opens from a call, a routes list or the routes area). */
export const routePlansNav: readonly FeatureNavEntry[] = [
  { id: 'route-plan-preview', href: '/route-plans/[id]', labelKey: 'route_plans.preview_title', defaultLabel: 'Route Preview', icon: Route, requiresCapability: (capabilities) => capabilities.routes.preview },
];
