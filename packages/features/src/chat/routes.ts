import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/** Chat routes: `/chat/[channelId]` is canonical for every variant (omni-plan §5.3.4); the assistant has its own `/chatbot`. */
export const CHAT_ROUTE_PATTERNS = {
  list: '/chat',
  conversation: '/chat/[channelId]',
} as const;

const encodeId = (id: string): string => {
  if (!isSafeRouteId(id)) throw new Error('Unsafe chat route id');
  return encodeURIComponent(id);
};

export const chatRoutes = {
  list: (): string => '/chat',
  conversation: (channelId: string): string => `/chat/${encodeId(channelId)}`,
} as const;
