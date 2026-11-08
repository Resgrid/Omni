import { FeatureFlagKeys } from '@resgrid/auth';
import type { NavBadgeKey } from '@resgrid/data';
import type { LucideIcon } from 'lucide-react-native';
import { Briefcase, ClipboardCheck, FileText, MessagesSquare, Package, Settings } from 'lucide-react-native';

/** What decides whether a quick action shows (resolved by the console from flags, the active unit and the variant). */
export interface QuickActionGates {
  chat: boolean;
  checklists: boolean;
  deployments: boolean;
  records: boolean;
  /** An active unit is selected and the variant ships the inventory module. */
  inventory: boolean;
}

export type QuickActionId = 'chat' | 'checklists' | 'operations' | 'inventory' | 'records' | 'settings';

export interface QuickAction {
  id: QuickActionId;
  /** Static route inside the variant's `(app)` group. */
  href: string;
  labelKey: string;
  /** Department terminology key that renames the action (`TermKeys.*`). */
  termKey?: string;
  icon: LucideIcon;
  /** Gate it depends on; omitted = always shown. */
  gate?: keyof QuickActionGates;
  /** Count shown on the button, like the same entry's in the other apps' menus (unread chats, due checks, deployments). */
  badge?: NavBadgeKey;
}

/**
 * The status console's shortcuts (Unit sidebar): chat (Chat.System; the assistant is the pinned first entry of the chat
 * list, so it has no shortcut of its own), checklists (Checklists.System), deployments (Operations.Deployments), the
 * unit's inventory (active unit) and Field Records (Records.System + the app's child flag). Settings is always offered
 * so a crew without an active unit can pick one.
 */
export const QUICK_ACTIONS: readonly QuickAction[] = [
  { id: 'chat', href: '/chat', labelKey: 'tabs.chat', icon: MessagesSquare, gate: 'chat', badge: 'chats' },
  { id: 'checklists', href: '/checklists', labelKey: 'checklists.labels.Checklists', termKey: 'module.checklists', icon: ClipboardCheck, gate: 'checklists', badge: 'checklists' },
  { id: 'operations', href: '/operations', labelKey: 'operations.title', icon: Briefcase, gate: 'deployments', badge: 'deployments' },
  { id: 'inventory', href: '/inventory', labelKey: 'inventory.title', termKey: 'module.inventory', icon: Package, gate: 'inventory' },
  { id: 'records', href: '/records', labelKey: 'tabs.records', termKey: 'module.records', icon: FileText, gate: 'records' },
  { id: 'settings', href: '/settings', labelKey: 'settings.title', icon: Settings },
];

/** The shortcuts the sidebar puts side by side on one row (each of the others gets a row of its own). */
export const SIDEBAR_ROW_ACTIONS: readonly QuickActionId[] = ['chat', 'checklists', 'operations'];

/** The quick actions to show, in order. `exclude` drops actions the variant's route tree does not have. */
export const visibleQuickActions = (gates: QuickActionGates, exclude: readonly QuickActionId[] = []): QuickAction[] =>
  QUICK_ACTIONS.filter((action) => !exclude.includes(action.id) && (action.gate === undefined || gates[action.gate]));

/** The department feature flags the gates read (unknown flags are disabled). */
export const QUICK_ACTION_FLAGS = {
  chat: FeatureFlagKeys.ChatSystem,
  checklists: FeatureFlagKeys.ChecklistsSystem,
  deployments: FeatureFlagKeys.Deployments,
} as const;
