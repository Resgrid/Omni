import type { InventoryApiResult, InventoryCountDetail, InventoryCountResult, InventoryEquipment, InventoryFieldAccess } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions, type UnknownV4Result } from '../../core';

/** Core v4 endpoints for inventory (Inventory). The contract test checks every entry against Swagger. */
export const inventoryEndpoints = defineEndpoints('inventory', {
  cancelInventoryCount: { method: 'POST', path: '/Inventory/CancelCount', body: 'json' },
  completeInventoryCount: { method: 'POST', path: '/Inventory/CompleteCount', body: 'json' },
  getInventoryAccess: { method: 'GET', path: '/Inventory/GetAccess', query: ['unitId'] },
  getInventoryCount: { method: 'GET', path: '/Inventory/GetCount', query: ['id'] },
  getInventoryCounts: { method: 'GET', path: '/Inventory/GetCounts', query: ['page', 'locationId'] },
  getUnitEquipment: { method: 'GET', path: '/Inventory/GetUnitEquipment', query: ['unitId'] },
  saveInventoryCount: { method: 'POST', path: '/Inventory/SaveCount', body: 'json' },
  startInventoryCount: { method: 'POST', path: '/Inventory/StartCount', body: 'json' },
});

const E = inventoryEndpoints;

/** `POST /Inventory/CancelCount` — legacy: U. */
export const cancelInventoryCount = (ctx: ApiContext, body: Record<string, unknown>, options?: RequestOptions): Promise<InventoryApiResult<unknown>> =>
  request<InventoryApiResult<unknown>>(ctx, E.cancelInventoryCount, { body }, options);

/** `POST /Inventory/CompleteCount` — legacy: U. */
export const completeInventoryCount = (ctx: ApiContext, body: Record<string, unknown>, options?: RequestOptions): Promise<InventoryApiResult<InventoryCountResult>> =>
  request<InventoryApiResult<InventoryCountResult>>(ctx, E.completeInventoryCount, { body }, options);

/** Field apps: whether inventory is usable, whether the caller may count (AdjustInventory at the unit's holder location) and the unit's countable locations. `GET /Inventory/GetAccess` — legacy: U. */
export const getInventoryAccess = (ctx: ApiContext, params: { unitId: number | string }, options?: RequestOptions): Promise<InventoryApiResult<InventoryFieldAccess>> =>
  request<InventoryApiResult<InventoryFieldAccess>>(ctx, E.getInventoryAccess, { params }, options);

/** `GET /Inventory/GetCount` — legacy: U. */
export const getInventoryCount = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<InventoryApiResult<InventoryCountDetail>> =>
  request<InventoryApiResult<InventoryCountDetail>>(ctx, E.getInventoryCount, { params }, options);

/** `GET /Inventory/GetCounts` — legacy: U. */
export const getInventoryCounts = (ctx: ApiContext, params: { page?: number | string; locationId?: string } = {}, options?: RequestOptions): Promise<UnknownV4Result> =>
  request<UnknownV4Result>(ctx, E.getInventoryCounts, { params }, options);

/** `GET /Inventory/GetUnitEquipment` — legacy: U. */
export const getUnitEquipment = (ctx: ApiContext, params: { unitId: number | string }, options?: RequestOptions): Promise<InventoryApiResult<InventoryEquipment[]>> =>
  request<InventoryApiResult<InventoryEquipment[]>>(ctx, E.getUnitEquipment, { params }, options);

/** `POST /Inventory/SaveCount` — legacy: U. */
export const saveInventoryCount = (ctx: ApiContext, body: Record<string, unknown>, options?: RequestOptions): Promise<InventoryApiResult<InventoryCountDetail>> =>
  request<InventoryApiResult<InventoryCountDetail>>(ctx, E.saveInventoryCount, { body }, options);

/** `POST /Inventory/StartCount` — legacy: U. */
export const startInventoryCount = (ctx: ApiContext, body: Record<string, unknown>, options?: RequestOptions): Promise<InventoryApiResult<InventoryCountDetail>> =>
  request<InventoryApiResult<InventoryCountDetail>>(ctx, E.startInventoryCount, { body }, options);
