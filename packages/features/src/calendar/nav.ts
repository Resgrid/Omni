import type { Capabilities, FeatureModuleId } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { CalendarDays } from 'lucide-react-native';

import { calendarRoutes } from './routes';

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
  /** Feature module the variant must ship (`variant.modules`). */
  requiresModule?: FeatureModuleId;
}

/** The department calendar; `module.calendar` lets a department rename it. */
export const calendarNav: readonly FeatureNavEntry[] = [
  { id: 'calendar', href: calendarRoutes.calendar(), labelKey: 'calendar.title', defaultLabel: 'Calendar', termKey: 'module.calendar', icon: CalendarDays, requiresModule: 'calendar' },
];
