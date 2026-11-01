import { ScrollView } from '@resgrid/ui';
import React from 'react';

import type { QuickActionId } from '../lib/quick-actions';
import { UnitStatusPanel } from './unit-status-panel';

/**
 * Props of the shell's sidebar slot (`@resgrid/app-shell` `SidebarContentProps`, mirrored structurally — features never
 * import the shell) plus the Unit-only extras the variant's root layout binds.
 */
export interface UnitStatusSidebarProps {
  /** Close the drawer after navigating (no-op for a permanent sidebar). */
  onNavigate: () => void;
  onClearActiveCall?: () => void;
  excludeQuickActions?: readonly QuickActionId[];
}

/**
 * Unit's sidebar content (manifest `shell.sidebarContent: "unit-status"`). Register it from the Unit root layout:
 *   registerSidebarContent('unit-status', (props) => <UnitStatusSidebar {...props} onClearActiveCall={clearActiveCall} />);
 */
export const UnitStatusSidebar: React.FC<UnitStatusSidebarProps> = ({ onNavigate, onClearActiveCall, excludeQuickActions }) => (
  <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 8, paddingTop: 16 }} testID="unit-status-sidebar">
    <UnitStatusPanel layout="sidebar" onNavigate={onNavigate} onClearActiveCall={onClearActiveCall} excludeQuickActions={excludeQuickActions} />
  </ScrollView>
);
