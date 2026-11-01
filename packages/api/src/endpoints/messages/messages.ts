import type { DeleteMessageResult, GetRecipientsResult, MessageResult, MessagesResult, NewMessageInput, RespondToMessageInput, RespondToMessageResult, SendMessageResult } from '@resgrid/models';

import { type ApiContext, cachedRequest, type CachedRequestOptions, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for messages (Messages). The contract test checks every entry against Swagger. */
export const messagesEndpoints = defineEndpoints('messages', {
  deleteMessage: { method: 'DELETE', path: '/Messages/DeleteMessage', query: ['messageId'] },
  getInboxMessages: { method: 'GET', path: '/Messages/GetInboxMessages' },
  getMessage: { method: 'GET', path: '/Messages/GetMessage', query: ['messageId'] },
  getOutboxMessages: { method: 'GET', path: '/Messages/GetOutboxMessages' },
  getRecipients: { method: 'GET', path: '/Messages/GetRecipients', query: ['disallowNoone', 'includeUnits'], cacheTtlMs: 15 * 60 * 1000 },
  respondToMessage: { method: 'PUT', path: '/Messages/RespondToMessage', body: 'json' },
  sendMessage: { method: 'POST', path: '/Messages/SendMessage', body: 'json' },
});

const E = messagesEndpoints;

/** Deletes a messsage from the system. `DELETE /Messages/DeleteMessage` — legacy: R. */
export const deleteMessage = (ctx: ApiContext, params: { messageId: number | string }, options?: RequestOptions): Promise<DeleteMessageResult> => request<DeleteMessageResult>(ctx, E.deleteMessage, { params }, options);

/** Returns all inbox messages for a user. `GET /Messages/GetInboxMessages` — legacy: R. */
export const getInboxMessages = (ctx: ApiContext, options?: RequestOptions): Promise<MessagesResult> => request<MessagesResult>(ctx, E.getInboxMessages, {}, options);

/** Gets a specific message by it's Id. `GET /Messages/GetMessage` — legacy: R. */
export const getMessage = (ctx: ApiContext, params: { messageId: number | string }, options?: RequestOptions): Promise<MessageResult> => request<MessageResult>(ctx, E.getMessage, { params }, options);

/** Returns all the outbox messages for a user. `GET /Messages/GetOutboxMessages` — legacy: R. */
export const getOutboxMessages = (ctx: ApiContext, options?: RequestOptions): Promise<MessagesResult> => request<MessagesResult>(ctx, E.getOutboxMessages, {}, options);

/** Gets all the recipients in the department plus default values the system accepts. `GET /Messages/GetRecipients` (cached) — legacy: BDIRU. */
export const getRecipients = (ctx: ApiContext, params: { disallowNoone?: boolean; includeUnits?: boolean } = {}, options?: CachedRequestOptions): Promise<GetRecipientsResult> =>
  cachedRequest<GetRecipientsResult>(ctx, E.getRecipients, { params }, options);

/** Records a user's response to a message. Calendar RSVP responses also update event attendance. `PUT /Messages/RespondToMessage` — legacy: R. */
export const respondToMessage = (ctx: ApiContext, body: RespondToMessageInput, options?: RequestOptions): Promise<RespondToMessageResult> => request<RespondToMessageResult>(ctx, E.respondToMessage, { body }, options);

/** Sends a new message to users in the system. `POST /Messages/SendMessage` — legacy: R. */
export const sendMessage = (ctx: ApiContext, body: NewMessageInput, options?: RequestOptions): Promise<SendMessageResult> => request<SendMessageResult>(ctx, E.sendMessage, { body }, options);
