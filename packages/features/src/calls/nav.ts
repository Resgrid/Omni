import type { Capabilities } from '@resgrid/config';
import type { NavBadge } from '@resgrid/data';
import { ClipboardList, PhoneCall } from 'lucide-react-native';
import type { ComponentType } from 'react';

/**
 * Nav registry entries this feature contributes (omni-plan §5.4: the app shell's registry decides placement per
 * variant — tab, sidebar or hidden — and generates the navigator). `termKey` lets a department rename "Calls".
 */
export interface FeatureNavEntry {
  id: string;
  /** Route segment under the variant's (app) group. */
  route: string;
  titleKey: string;
  /** Terminology key (`useTerm`) that overrides the title when the department renamed the module. */
  termKey?: string;
  icon: ComponentType<{ size?: number; color?: string }>;
  /** Shown only when this returns true for the variant's capabilities. */
  isAvailable?: (capabilities: Capabilities) => boolean;
  /** Count badge beside the entry (the shell's `NavEntry.badge`). */
  badge?: NavBadge;
}

export const callsNav: readonly FeatureNavEntry[] = [
  { id: 'calls', route: 'calls', titleKey: 'calls.title', termKey: 'module.calls', icon: ClipboardList, badge: 'calls' },
  { id: 'call-new', route: 'call/new', titleKey: 'calls.new_call', icon: PhoneCall, isAvailable: (capabilities) => capabilities.calls.create !== 'none' },
];
