import type { Capabilities, FeatureModuleId } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { Wrench } from 'lucide-react-native';

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

/** Work orders: hidden unless the department has `Maintenance.WorkOrders` (reading needs no Readiness Pro). */
export const workOrdersNav: readonly FeatureNavEntry[] = [
  {
    id: 'work-orders',
    href: '/work-orders',
    labelKey: 'workOrders.title',
    defaultLabel: 'Work orders',
    termKey: 'module.work-orders',
    icon: Wrench,
    requiresFlag: 'Maintenance.WorkOrders',
    requiresModule: 'work-orders',
  },
];
