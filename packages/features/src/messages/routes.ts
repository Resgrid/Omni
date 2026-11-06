import { routePathWithId } from '@resgrid/core/navigation/route-paths';

/**
 * Message routes (Responder). Ids pass `isSafeRouteId` before they build a path (inbox push payloads carry them); a
 * refused id builds none (null, reported).
 */
export const MESSAGE_ROUTE_PATTERNS = {
  list: '/messages',
  compose: '/messages/new',
  detail: '/messages/[id]',
} as const;

export const messageRoutes = {
  list: (): string => '/messages',
  /** The compose page (a new message). */
  compose: (): string => '/messages/new',
  detail: (messageId: string): string | null => routePathWithId('messages.detail', messageId, (id) => `/messages/${id}`),
} as const;
