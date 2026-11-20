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

const hasRoutesPreview = (capabilities: Capabilities): boolean => capabilities.routes.preview;

/** The department's routes (Dispatch's routes area) and one running route, read only (a detail screen: register it hidden). */
export const routesOverviewNav: readonly FeatureNavEntry[] = [
  { id: 'route-plans', href: '/route-plans', labelKey: 'routes.title', defaultLabel: 'Routes', icon: Route, requiresCapability: hasRoutesPreview },
  { id: 'route-instance-view', href: '/route-instances/[id]', labelKey: 'routes.instance_detail', defaultLabel: 'Route Instance', icon: Route, requiresCapability: hasRoutesPreview },
];
