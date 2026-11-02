import type { Capabilities, FeatureModuleId } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { Layers } from 'lucide-react-native';

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
  requiresFlag?: string | readonly string[];
  requiresCapability?: (capabilities: Capabilities) => boolean;
  requiresModule?: FeatureModuleId;
}

const customIndoor = (capabilities: Capabilities): boolean => capabilities.maps.customIndoor;

/** The custom/indoor maps browser (also reached from the map's Layers sheet). */
export const customMapsNav: readonly FeatureNavEntry[] = [
  { id: 'maps', href: '/maps', labelKey: 'maps.custom_maps', defaultLabel: 'Custom Maps', icon: Layers, requiresCapability: customIndoor },
  { id: 'maps-search', href: '/maps/search', labelKey: 'maps.search_maps', defaultLabel: 'Search Maps', requiresCapability: customIndoor },
];
