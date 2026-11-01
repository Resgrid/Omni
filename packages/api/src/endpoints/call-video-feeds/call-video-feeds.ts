import type { CallVideoFeedsResult, DeleteCallVideoFeedResult, EditCallVideoFeedInput, SaveCallVideoFeedInput, SaveCallVideoFeedResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for call-video-feeds (CallVideoFeeds). The contract test checks every entry against Swagger. */
export const callVideoFeedsEndpoints = defineEndpoints('call-video-feeds', {
  deleteCallVideoFeed: { method: 'DELETE', path: '/CallVideoFeeds/DeleteCallVideoFeed', query: ['callVideoFeedId'] },
  editCallVideoFeed: { method: 'PUT', path: '/CallVideoFeeds/EditCallVideoFeed', body: 'json' },
  getCallVideoFeeds: { method: 'GET', path: '/CallVideoFeeds/GetCallVideoFeeds', query: ['callId'] },
  saveCallVideoFeed: { method: 'POST', path: '/CallVideoFeeds/SaveCallVideoFeed', body: 'json' },
});

const E = callVideoFeedsEndpoints;

/** Soft deletes a video feed. `DELETE /CallVideoFeeds/DeleteCallVideoFeed` — legacy: DIRU. */
export const deleteCallVideoFeed = (ctx: ApiContext, params: { callVideoFeedId: string }, options?: RequestOptions): Promise<DeleteCallVideoFeedResult> =>
  request<DeleteCallVideoFeedResult>(ctx, E.deleteCallVideoFeed, { params }, options);

/** Updates an existing video feed. `PUT /CallVideoFeeds/EditCallVideoFeed` — legacy: DIRU. */
export const editCallVideoFeed = (ctx: ApiContext, body: EditCallVideoFeedInput, options?: RequestOptions): Promise<SaveCallVideoFeedResult> =>
  request<SaveCallVideoFeedResult>(ctx, E.editCallVideoFeed, { body }, options);

/** Get video feeds for a call. `GET /CallVideoFeeds/GetCallVideoFeeds` — legacy: DIRU. */
export const getCallVideoFeeds = (ctx: ApiContext, params: { callId: string }, options?: RequestOptions): Promise<CallVideoFeedsResult> => request<CallVideoFeedsResult>(ctx, E.getCallVideoFeeds, { params }, options);

/** Saves a video feed to a call. `POST /CallVideoFeeds/SaveCallVideoFeed` — legacy: DIRU. */
export const saveCallVideoFeed = (ctx: ApiContext, body: SaveCallVideoFeedInput, options?: RequestOptions): Promise<SaveCallVideoFeedResult> =>
  request<SaveCallVideoFeedResult>(ctx, E.saveCallVideoFeed, { body }, options);
