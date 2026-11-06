import { routePathWithId } from '@resgrid/core/navigation/route-paths';

/** Contact routes (lists in Responder/Unit/IC/Dispatch/BigBoard; the detail opens as a page or from a call). */
export const CONTACTS_ROUTE_PATTERNS = {
  list: '/contacts',
  detail: '/contacts/[id]',
} as const;

export const contactsRoutes = {
  list: (): string => '/contacts',
  /** Null (reported) for a contact id `isSafeRouteId` refuses. */
  detail: (contactId: string): string | null => routePathWithId('contacts.detail', contactId, (id) => `/contacts/${id}`),
} as const;
