import { routePathWithId, routePathWithQuery } from '@resgrid/core/navigation/route-paths';

/**
 * The dispatcher desk (Dispatch, `capabilities.calls.dispatcherDesk`): the queue (`?itemId=` picks an item, as a desk
 * push does; `?breakId=` opens the breaks), one item, the new-call form for a conversation, and the breaks with the team
 * timeline. Item ids are server GUIDs.
 */
export const DISPATCHER_DESK_ROUTE_PATTERNS = {
  desk: '/desk',
  item: '/desk/item/[id]',
  itemCall: '/desk/item/[id]/call',
  breaks: '/desk/breaks',
} as const;

export const dispatcherDeskRoutes = {
  desk: (): string => '/desk',
  /** The desk with an item picked: the tablet split view shows it, a phone opens it. */
  deskWithItem: (itemId: string): string | null => routePathWithQuery('dispatcherDesk.desk', '/desk', { itemId }),
  item: (id: string): string | null => routePathWithId('dispatcherDesk.item', id, (itemId) => `/desk/item/${itemId}`),
  /** The new-call form started from an item's conversation; the saved call is linked to the item. */
  itemCall: (id: string): string | null => routePathWithId('dispatcherDesk.itemCall', id, (itemId) => `/desk/item/${itemId}/call`),
  breaks: (): string => '/desk/breaks',
} as const;
