import type { Capabilities } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { Map as MapIcon } from 'lucide-react-native';

import { offlineMapsRoutes } from './routes';

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

/**
 * Settings → Offline maps. Variants place it `hidden` (reached from the Settings row, which shows only on iOS/Android
 * when the department offers offline maps — `registerOfflineMapsSettings`).
 */
export const offlineMapsNav: readonly FeatureNavEntry[] = [{ id: 'offline-maps', href: offlineMapsRoutes.offlineMaps(), labelKey: 'offline_maps.title', defaultLabel: 'Offline maps', icon: MapIcon }];
