import { routePathWithId } from '@resgrid/core/navigation/route-paths';

/** Chat routes: `/chat/[channelId]` is canonical for every variant (omni-plan §5.3.4); the assistant has its own `/chatbot`. */
export const CHAT_ROUTE_PATTERNS = {
  list: '/chat',
  conversation: '/chat/[channelId]',
  chatbot: '/chatbot',
} as const;

export const chatRoutes = {
  list: (): string => '/chat',
  /** Null (reported) for a channel id `isSafeRouteId` refuses; navigate with `pushRoutePath`. */
  conversation: (channelId: string): string | null => routePathWithId('chat.conversation', channelId, (id) => `/chat/${id}`),
  /** The assistant (chatbot channel); also where a chat push for the assistant channel lands. */
  chatbot: (): string => '/chatbot',
} as const;
