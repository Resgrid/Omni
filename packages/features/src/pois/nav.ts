import type { Capabilities } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { Hospital, MapPinned } from 'lucide-react-native';

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

export const poisNav: readonly FeatureNavEntry[] = [{ id: 'pois', href: '/pois', labelKey: 'pois.title', defaultLabel: 'POIs', icon: MapPinned }];

/** The dispatcher's Destinations screen: availability, capabilities and destination rules (apps that may set availability). */
export const destinationsNav: readonly FeatureNavEntry[] = [
  {
    id: 'destinations',
    href: '/destinations',
    labelKey: 'pois.destinations.title',
    defaultLabel: 'Destinations',
    icon: Hospital,
    requiresCapability: (capabilities) => capabilities.calls.destinationAvailability,
  },
];
