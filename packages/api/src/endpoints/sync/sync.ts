import type { SyncBundleResult, SyncChangesResult, SyncReferenceResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for sync (Sync). The contract test checks every entry against Swagger. */
export const syncEndpoints = defineEndpoints('sync', {
  getSyncBundle: { method: 'GET', path: '/Sync/Bundle', query: ['includeAccountability'] },
  getSyncChanges: { method: 'GET', path: '/Sync/Changes', query: ['since'] },
  getSyncReference: { method: 'GET', path: '/Sync/Reference', query: ['bypassCache'] },
});

const E = syncEndpoints;

/** Shift-start aggregate pull: a render-ready board (incl. computed accountability / PAR) for every ACTIVE incident in the caller's department, plus the active ad-hoc resources and a next-sync cursor — in a single round-trip. Persist `Data.ServerTimestampMs` and pass it as the next M:Resgrid.Web.Services.Controllers.v4.SyncController.Changes(System.Int64) `since`. Unlike M:Resgrid.Web.Services.Controllers.v4.SyncController.Changes(System.Int64) (a row-based delta), this returns the computed PAR/accountability state. `GET /Sync/Bundle` — legacy: DI. */
export const getSyncBundle = (ctx: ApiContext, params: { includeAccountability?: boolean } = {}, options?: RequestOptions): Promise<SyncBundleResult> =>
  request<SyncBundleResult>(ctx, E.getSyncBundle, { params }, options);

/** Returns incident-command rows changed since since (Unix epoch milliseconds; 0 or omitted = full pull), scoped to the caller's department. Soft-deleted / closed / released rows are included so the client can remove them locally. Persist the returned `Data.ServerTimestampMs` and pass it as the next since. `GET /Sync/Changes` — legacy: I. */
export const getSyncChanges = (ctx: ApiContext, params: { since?: number | string } = {}, options?: RequestOptions): Promise<SyncChangesResult> => request<SyncChangesResult>(ctx, E.getSyncChanges, { params }, options);

/** Shift-start REFERENCE pull: the slowly-changing department configuration + a safe personnel roster needed to start and run an incident offline (call types, command templates, units, personnel, groups, POIs, protocols, accountability config, statuses, feature flags). Pull once per shift / on manual refresh; the live incident state comes from M:Resgrid.Web.Services.Controllers.v4.SyncController.Bundle(System.Boolean) and M:Resgrid.Web.Services.Controllers.v4.SyncController.Changes(System.Int64). `GET /Sync/Reference` — legacy: I. */
export const getSyncReference = (ctx: ApiContext, params: { bypassCache?: boolean } = {}, options?: RequestOptions): Promise<SyncReferenceResult> =>
  request<SyncReferenceResult>(ctx, E.getSyncReference, { params }, options);
