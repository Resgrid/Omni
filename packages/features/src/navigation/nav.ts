import type { Capabilities, FeatureModuleId } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { Navigation } from 'lucide-react-native';

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
  termKey?: string;
  icon?: LucideIcon;
  /** Department feature flag(s); unknown flags are disabled. */
  requiresFlag?: string | readonly string[];
  requiresCapability?: (capabilities: Capabilities) => boolean;
  requiresModule?: FeatureModuleId;
}

/**
 * The navigation screen (`/navigate`): placed hidden — it opens from Directions on a call, a route, a POI, a map pin or a
 * contact, never from the menu. Behind `maps.navigationInApp` and the department's `Navigation.InApp` flag.
 */
export const navigationNav: readonly FeatureNavEntry[] = [
  {
    id: 'navigate',
    href: '/navigate',
    labelKey: 'navigation.title',
    defaultLabel: 'Navigation',
    icon: Navigation,
    requiresFlag: 'Navigation.InApp',
    requiresCapability: (capabilities) => capabilities.maps.navigationInApp,
  },
];
