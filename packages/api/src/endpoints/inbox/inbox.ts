import type { UnitSubscriberHashResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions, type UnknownV4Result } from '../../core';

/** Core v4 endpoints for inbox (Inbox). The contract test checks every entry against Swagger. */
export const inboxEndpoints = defineEndpoints('inbox', {
  deleteInboxMessage: { method: 'DELETE', path: '/Inbox/DeleteMessage', query: ['messageId', 'unitId'] },
  getUnitSubscriberHash: { method: 'GET', path: '/Inbox/GetUnitSubscriberHash', query: ['unitId'] },
});

const E = inboxEndpoints;

/** Deletes a message from the caller's own inbox by its ID. Without a unit the message must be in the caller's own inbox (Responder/Dispatch, or the IC app's); with one, in that unit's inbox (Unit app), and the unit must be in the caller's department. A message anywhere else is reported as not found. `DELETE /Inbox/DeleteMessage` — legacy: BDIRU. */
export const deleteInboxMessage = (ctx: ApiContext, params: { messageId: string; unitId?: number | string }, options?: RequestOptions): Promise<UnknownV4Result> =>
  request<UnknownV4Result>(ctx, E.deleteInboxMessage, { params }, options);

/** Gets the Novu subscriberHash for a unit's inbox, for the Unit app to open that inbox with. The unit must be in the caller's department. The user's own inbox hashes come with the rights (Security/GetCurrentUsersRights). `GET /Inbox/GetUnitSubscriberHash` — legacy: U. */
export const getUnitSubscriberHash = (ctx: ApiContext, params: { unitId: number | string }, options?: RequestOptions): Promise<UnitSubscriberHashResult> =>
  request<UnitSubscriberHashResult>(ctx, E.getUnitSubscriberHash, { params }, options);
