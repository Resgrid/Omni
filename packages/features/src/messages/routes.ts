import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/** Message routes (Responder). Ids pass `isSafeRouteId` before they build a path (inbox push payloads carry them). */
export const MESSAGE_ROUTE_PATTERNS = {
  list: '/messages',
  compose: '/messages/new',
  detail: '/messages/[id]',
} as const;

const encodeId = (id: string): string => {
  if (!isSafeRouteId(id)) throw new Error('Unsafe message route id');
  return encodeURIComponent(id);
};

export const messageRoutes = {
  list: (): string => '/messages',
  /** The compose page (a new message). */
  compose: (): string => '/messages/new',
  detail: (messageId: string): string => `/messages/${encodeId(messageId)}`,
} as const;
