import type { Capabilities, FeatureModuleId } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { House } from 'lucide-react-native';

import { memberHomeRoutes } from './routes';

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

/** The member home (`/home`, the variant's `shell.homeRoute`); its nested personnel/units/calls tabs are not menu items. */
export const memberHomeNav: readonly FeatureNavEntry[] = [{ id: 'home', href: memberHomeRoutes.home(), labelKey: 'tabs.home', defaultLabel: 'Home', icon: House, requiresModule: 'member-home' }];
