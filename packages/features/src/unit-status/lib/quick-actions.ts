import { FeatureFlagKeys } from '@resgrid/auth';
import type { LucideIcon } from 'lucide-react-native';
import { Briefcase, ClipboardCheck, FileText, MessagesSquare, Package, Settings, Sparkles } from 'lucide-react-native';

/** What decides whether a quick action shows (resolved by the console from flags, the active unit and the variant). */
export interface QuickActionGates {
  chat: boolean;
  checklists: boolean;
  deployments: boolean;
  records: boolean;
  /** An active unit is selected and the variant ships the inventory module. */
  inventory: boolean;
}

export type QuickActionId = 'chat' | 'assistant' | 'checklists' | 'operations' | 'inventory' | 'records' | 'settings';

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
}

/**
 * The status console's shortcuts (Unit sidebar): chat and the assistant (Chat.System), checklists (Checklists.System),
 * deployments (Operations.Deployments), the unit's inventory (active unit) and Field Records (Records.System + the
 * app's child flag). Settings is always offered so a crew without an active unit can pick one.
 */
export const QUICK_ACTIONS: readonly QuickAction[] = [
  { id: 'chat', href: '/chat', labelKey: 'tabs.chat', icon: MessagesSquare, gate: 'chat' },
  { id: 'assistant', href: '/chatbot', labelKey: 'tabs.assistant', icon: Sparkles, gate: 'chat' },
  { id: 'checklists', href: '/checklists', labelKey: 'checklists.labels.Checklists', termKey: 'module.checklists', icon: ClipboardCheck, gate: 'checklists' },
  { id: 'operations', href: '/operations', labelKey: 'operations.title', icon: Briefcase, gate: 'deployments' },
  { id: 'inventory', href: '/inventory', labelKey: 'inventory.title', termKey: 'module.inventory', icon: Package, gate: 'inventory' },
  { id: 'records', href: '/records', labelKey: 'tabs.records', termKey: 'module.records', icon: FileText, gate: 'records' },
  { id: 'settings', href: '/settings', labelKey: 'settings.title', icon: Settings },
];

/** The quick actions to show, in order. `exclude` drops actions the variant's route tree does not have. */
export const visibleQuickActions = (gates: QuickActionGates, exclude: readonly QuickActionId[] = []): QuickAction[] =>
  QUICK_ACTIONS.filter((action) => !exclude.includes(action.id) && (action.gate === undefined || gates[action.gate]));

/** The department feature flags the gates read (unknown flags are disabled). */
export const QUICK_ACTION_FLAGS = {
  chat: FeatureFlagKeys.ChatSystem,
  checklists: FeatureFlagKeys.ChecklistsSystem,
  deployments: FeatureFlagKeys.Deployments,
} as const;
