import type { Capabilities, FeatureModuleId } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { LayoutDashboard, Network } from 'lucide-react-native';

/**
 * This feature's nav entries, shaped like the app shell's `NavEntry` minus `placement` (the variant's nav.ts decides
 * tab / sidebar / hidden), so features never import the shell (omni-plan §5.4). The board and incident list are IC's
 * tabs (command tier); Dispatch reaches boards from the call (`/call/[id]/command`), R/U from the call's tab.
 */
export interface FeatureNavEntry {
  id: string;
  href: string;
  labelKey: string;
  defaultLabel?: string;
  termKey?: string;
  icon?: LucideIcon;
  requiresFlag?: string | readonly string[];
  requiresCapability?: (capabilities: Capabilities) => boolean;
  requiresModule?: FeatureModuleId;
}

const isCommandTier = (capabilities: Capabilities): boolean => capabilities.incidentCommand === 'command';

export const incidentCommandNav: readonly FeatureNavEntry[] = [
  { id: 'command', href: '/command', labelKey: 'incident_command.nav_board', defaultLabel: 'Command', icon: Network, requiresCapability: isCommandTier, requiresModule: 'incident-command' },
  { id: 'incidents', href: '/incidents', labelKey: 'incident_command.nav_incidents', defaultLabel: 'Incidents', icon: LayoutDashboard, requiresCapability: isCommandTier, requiresModule: 'incident-command' },
];
