import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/** Message routes (Responder). Ids pass `isSafeRouteId` before they build a path (inbox push payloads carry them). */
export const MESSAGE_ROUTE_PATTERNS = {
  list: '/messages',
  detail: '/messages/[id]',
} as const;

const encodeId = (id: string): string => {
  if (!isSafeRouteId(id)) throw new Error('Unsafe message route id');
  return encodeURIComponent(id);
};

export const messageRoutes = {
  list: (): string => '/messages',
  /** The list with compose open (a "new message" shortcut). */
  compose: (): string => '/messages?compose=1',
  detail: (messageId: string): string => `/messages/${encodeId(messageId)}`,
} as const;
