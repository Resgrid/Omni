import type { Capabilities, FeatureModuleId } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { Gauge } from 'lucide-react-native';

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

/**
 * The full-screen console. The sidebar console itself is not a nav entry: it is the shell's `unit-status` sidebar
 * content (register `UnitStatusSidebar`). Typical placement: hidden on tablets (the sidebar is permanent), sidebar on
 * phones, tab on the Electron MDT.
 */
export const unitStatusNav: readonly FeatureNavEntry[] = [{ id: 'unit-console', href: '/console', labelKey: 'unit_status.console_title', defaultLabel: 'Status console', icon: Gauge, requiresModule: 'unit-status' }];
