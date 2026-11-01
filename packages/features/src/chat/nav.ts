import type { Capabilities } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { MessagesSquare } from 'lucide-react-native';

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

/** Hidden unless the variant has the chat hub and the department has `Chat.System` (every chat endpoint 404s without it). */
export const chatNav: readonly FeatureNavEntry[] = [
  { id: 'chat', href: '/chat', labelKey: 'chat.title', defaultLabel: 'Chat', icon: MessagesSquare, requiresFlag: 'Chat.System', requiresCapability: (capabilities) => capabilities.realtime.chatHub },
];
