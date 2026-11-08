import type { Capabilities } from '@resgrid/config';
import type { NavBadge } from '@resgrid/data';
import type { LucideIcon } from 'lucide-react-native';
import { MessagesSquare, Sparkles } from 'lucide-react-native';

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
  /** Count badge beside the entry (the shell's `NavEntry.badge`). */
  badge?: NavBadge;
}

const hasChatHub = (capabilities: Capabilities): boolean => capabilities.realtime.chatHub;

/**
 * Hidden unless the variant has the chat hub and the department has `Chat.System` (every chat endpoint 404s without it).
 * The chat entry's badge counts unread messages across every channel.
 * `chatbot` is the assistant. Legacy apps (R, U, I, D) had it in the side menu; every Omni chat app reaches it from the
 * entry pinned at the top of the chat list instead, so each places it hidden:
 * `featureNav(chatNav, { chat: 'sidebar', chatbot: 'hidden' })` (the route stays, for that entry and for push taps).
 */
export const chatNav: readonly FeatureNavEntry[] = [
  { id: 'chat', href: '/chat', labelKey: 'chat.title', defaultLabel: 'Chat', icon: MessagesSquare, requiresFlag: 'Chat.System', requiresCapability: hasChatHub, badge: 'chats' },
  { id: 'chatbot', href: '/chatbot', labelKey: 'chatbot.title', defaultLabel: 'Assistant', icon: Sparkles, requiresFlag: 'Chat.System', requiresCapability: hasChatHub },
];
