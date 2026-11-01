import type { Capabilities } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { CloudLightning, Settings2 } from 'lucide-react-native';

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

export const weatherAlertsNav: readonly FeatureNavEntry[] = [
  { id: 'weather-alerts', href: '/weather-alerts', labelKey: 'weather_alerts.title', defaultLabel: 'Weather Alerts', icon: CloudLightning },
  {
    id: 'weather-alerts-settings',
    href: '/weather-alerts/settings',
    labelKey: 'weather_alerts.settings_title',
    defaultLabel: 'Weather Alert Settings',
    icon: Settings2,
    requiresCapability: (capabilities) => capabilities.weatherAlerts.admin,
  },
];
