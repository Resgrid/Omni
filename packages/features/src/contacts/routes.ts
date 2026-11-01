import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/** Contact routes (lists in Responder/Unit/IC/Dispatch/BigBoard; the detail opens as a page or from a call). */
export const CONTACTS_ROUTE_PATTERNS = {
  list: '/contacts',
  detail: '/contacts/[id]',
} as const;

const encodeId = (id: string): string => {
  if (!isSafeRouteId(id)) throw new Error('Unsafe contact route id');
  return encodeURIComponent(id);
};

export const contactsRoutes = {
  list: (): string => '/contacts',
  detail: (contactId: string): string => `/contacts/${encodeId(contactId)}`,
} as const;
