import type { CallFilesResult, SaveCallFileInput, SaveCallFileResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for call-files (CallFiles). The contract test checks every entry against Swagger. */
export const callFilesEndpoints = defineEndpoints('call-files', {
  getCallFiles: { method: 'GET', path: '/CallFiles/GetFilesForCall', query: ['callId', 'includeData', 'type'] },
  saveCallFile: { method: 'POST', path: '/CallFiles/SaveCallFile', body: 'json' },
});

const E = callFilesEndpoints;

/** Get the files for a call in the Resgrid System. `GET /CallFiles/GetFilesForCall` — legacy: BDIRU. */
export const getCallFiles = (ctx: ApiContext, params: { callId: number | string; includeData?: boolean; type?: number | string }, options?: RequestOptions): Promise<CallFilesResult> =>
  request<CallFilesResult>(ctx, E.getCallFiles, { params }, options);

/** Attaches a file to a call. `POST /CallFiles/SaveCallFile` — legacy: BDIRU. */
export const saveCallFile = (ctx: ApiContext, body: SaveCallFileInput, options?: RequestOptions): Promise<SaveCallFileResult> => request<SaveCallFileResult>(ctx, E.saveCallFile, { body }, options);
