import type { CallProtocolsResult } from '@resgrid/models';

import { type ApiContext, cachedRequest, type CachedRequestOptions, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for protocols (Protocols). The contract test checks every entry against Swagger. */
export const protocolsEndpoints = defineEndpoints('protocols', {
  getAllProtocols: { method: 'GET', path: '/Protocols/GetAllProtocols', cacheTtlMs: 6 * 60 * 60 * 1000 },
  getProtocol: { method: 'GET', path: '/Protocols/GetProtocol', query: ['protocolId'] },
});

const E = protocolsEndpoints;

/** Gets all protocols for a department. `GET /Protocols/GetAllProtocols` (cached) — legacy: BDIRU. */
export const getAllProtocols = (ctx: ApiContext, options?: CachedRequestOptions): Promise<CallProtocolsResult> => cachedRequest<CallProtocolsResult>(ctx, E.getAllProtocols, {}, options);

/** Gets a single protocol by id. `GET /Protocols/GetProtocol` — legacy: BDIRU. */
export const getProtocol = (ctx: ApiContext, params: { protocolId: number | string }, options?: RequestOptions): Promise<CallProtocolsResult> => request<CallProtocolsResult>(ctx, E.getProtocol, { params }, options);
