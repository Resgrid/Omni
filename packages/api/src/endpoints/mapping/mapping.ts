import type {
  GetAllActiveLayersResult,
  GetCustomMapLayerResult,
  GetCustomMapResult,
  GetCustomMapsResult,
  GetIndoorMapFloorResult,
  GetIndoorMapResult,
  GetIndoorMapsResult,
  GetMapDataAndMarkersResult,
  GetMapIconLegendResult,
  GetMapLayersResult,
  NearestDestinationsResult,
  PoiCapabilitiesResult,
  PoiResult,
  PoisResult,
  PoiTypesResult,
  SearchAllMapFeaturesResult,
  SearchCustomMapRegionsResult,
  SearchIndoorLocationsResult,
  SetPoiAvailabilityInput,
  SetPoiAvailabilityResult,
  SignMapResourceUrlsInput,
  SignMapResourceUrlsResult,
} from '@resgrid/models';

import { type ApiContext, cachedRequest, type CachedRequestOptions, defineEndpoints, request, type RequestOptions, type UnknownV4Result } from '../../core';

/** Core v4 endpoints for mapping (Mapping). The contract test checks every entry against Swagger. */
export const mappingEndpoints = defineEndpoints('mapping', {
  getAllActiveLayers: { method: 'GET', path: '/Mapping/GetAllActiveLayers', cacheTtlMs: 5 * 60 * 1000 },
  getCustomMap: { method: 'GET', path: '/Mapping/GetCustomMap/{id}' },
  getCustomMapLayer: { method: 'GET', path: '/Mapping/GetCustomMapLayer/{layerId}' },
  getCustomMapRegionsGeoJSON: { method: 'GET', path: '/Mapping/GetCustomMapRegionsGeoJSON/{layerId}' },
  getCustomMaps: { method: 'GET', path: '/Mapping/GetCustomMaps', query: ['type'], cacheTtlMs: 5 * 60 * 1000 },
  getIndoorMap: { method: 'GET', path: '/Mapping/GetIndoorMap/{id}' },
  getIndoorMapFloor: { method: 'GET', path: '/Mapping/GetIndoorMapFloor/{floorId}' },
  getIndoorMaps: { method: 'GET', path: '/Mapping/GetIndoorMaps', cacheTtlMs: 5 * 60 * 1000 },
  getIndoorMapZonesGeoJSON: { method: 'GET', path: '/Mapping/GetIndoorMapZonesGeoJSON/{floorId}' },
  getMapDataAndMarkers: { method: 'GET', path: '/Mapping/GetMapDataAndMarkers', query: ['fullSizeIcons'] },
  getMapIconLegend: { method: 'GET', path: '/Mapping/GetMapIconLegend' },
  getMapLayerGeoJSON: { method: 'GET', path: '/Mapping/GetMapLayerGeoJSON/{layerId}' },
  getMapLayers: { method: 'GET', path: '/Mapping/GetMayLayers', query: ['type'] },
  getNearbyIndoorMaps: { method: 'GET', path: '/Mapping/GetNearbyIndoorMaps', query: ['lat', 'lon', 'radiusMeters'] },
  getNearestDestinations: { method: 'GET', path: '/Mapping/GetNearestDestinations', query: ['latitude', 'longitude', 'capabilityId', 'unitId', 'take'] },
  getPoi: { method: 'GET', path: '/Mapping/GetPoi/{poiId}', cacheTtlMs: 5 * 60 * 1000 },
  getPoiCapabilities: { method: 'GET', path: '/Mapping/GetPoiCapabilities', cacheTtlMs: 5 * 60 * 1000 },
  getPois: { method: 'GET', path: '/Mapping/GetPois', query: ['poiTypeId', 'destinationOnly'], cacheTtlMs: 5 * 60 * 1000 },
  getPoiTypes: { method: 'GET', path: '/Mapping/GetPoiTypes', cacheTtlMs: 5 * 60 * 1000 },
  searchAllMapFeatures: { method: 'GET', path: '/Mapping/SearchAllMapFeatures', query: ['term', 'type'] },
  searchCustomMapRegions: { method: 'GET', path: '/Mapping/SearchCustomMapRegions', query: ['term', 'layerId'] },
  searchIndoorLocations: { method: 'GET', path: '/Mapping/SearchIndoorLocations', query: ['term', 'mapId'] },
  setPoiAvailability: { method: 'POST', path: '/Mapping/SetPoiAvailability', body: 'json' },
  signMapResourceUrls: { method: 'POST', path: '/Mapping/SignMapResourceUrls', body: 'json' },
});

const E = mappingEndpoints;

/** Returns a summary of all map layers that are on by default for the department. `GET /Mapping/GetAllActiveLayers` (cached) — legacy: DIU. */
export const getAllActiveLayers = (ctx: ApiContext, options?: CachedRequestOptions): Promise<GetAllActiveLayersResult> => cachedRequest<GetAllActiveLayersResult>(ctx, E.getAllActiveLayers, {}, options);

/** Gets a specific custom map with its layers. `GET /Mapping/GetCustomMap/{id}` — legacy: IU. */
export const getCustomMap = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<GetCustomMapResult> => request<GetCustomMapResult>(ctx, E.getCustomMap, { params }, options);

/** Gets a specific custom map layer with its regions. `GET /Mapping/GetCustomMapLayer/{layerId}` — legacy: IU. */
export const getCustomMapLayer = (ctx: ApiContext, params: { layerId: string }, options?: RequestOptions): Promise<GetCustomMapLayerResult> =>
  request<GetCustomMapLayerResult>(ctx, E.getCustomMapLayer, { params }, options);

/** Returns all regions for a custom map layer as a GeoJSON FeatureCollection for direct rnmapbox consumption. `GET /Mapping/GetCustomMapRegionsGeoJSON/{layerId}` — legacy: DIU. */
export const getCustomMapRegionsGeoJSON = (ctx: ApiContext, params: { layerId: string }, options?: RequestOptions): Promise<UnknownV4Result> =>
  request<UnknownV4Result>(ctx, E.getCustomMapRegionsGeoJSON, { params }, options);

/** Gets all custom maps for the department, with optional type filter. `GET /Mapping/GetCustomMaps` (cached) — legacy: IU. */
export const getCustomMaps = (ctx: ApiContext, params: { type?: number | string } = {}, options?: CachedRequestOptions): Promise<GetCustomMapsResult> =>
  cachedRequest<GetCustomMapsResult>(ctx, E.getCustomMaps, { params }, options);

/** Gets a specific indoor map with its floors. `GET /Mapping/GetIndoorMap/{id}` — legacy: IU. */
export const getIndoorMap = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<GetIndoorMapResult> => request<GetIndoorMapResult>(ctx, E.getIndoorMap, { params }, options);

/** Gets a specific indoor map floor with its zones. `GET /Mapping/GetIndoorMapFloor/{floorId}` — legacy: IU. */
export const getIndoorMapFloor = (ctx: ApiContext, params: { floorId: string }, options?: RequestOptions): Promise<GetIndoorMapFloorResult> =>
  request<GetIndoorMapFloorResult>(ctx, E.getIndoorMapFloor, { params }, options);

/** Gets all indoor maps for the department. `GET /Mapping/GetIndoorMaps` (cached) — legacy: IU. */
export const getIndoorMaps = (ctx: ApiContext, options?: CachedRequestOptions): Promise<GetIndoorMapsResult> => cachedRequest<GetIndoorMapsResult>(ctx, E.getIndoorMaps, {}, options);

/** Returns all zones for an indoor map floor as a GeoJSON FeatureCollection for direct rnmapbox consumption. `GET /Mapping/GetIndoorMapZonesGeoJSON/{floorId}` — legacy: DIU. */
export const getIndoorMapZonesGeoJSON = (ctx: ApiContext, params: { floorId: string }, options?: RequestOptions): Promise<UnknownV4Result> =>
  request<UnknownV4Result>(ctx, E.getIndoorMapZonesGeoJSON, { params }, options);

/**
 * Data to center the map and it's default location plus marker information for displaying makers on the map. `GET /Mapping/GetMapDataAndMarkers` — legacy: BDIRU.
 * Always sends `fullSizeIcons=true`: `@resgrid/maps` scales the 128 px uploaded `IconUrl` to the 32 px pin size itself. Without it Core
 * hands Omni store builds a 32 px rendition (a temporary fix for builds that drew the 128 px image at full size).
 */
export const getMapDataAndMarkers = (ctx: ApiContext, options?: RequestOptions): Promise<GetMapDataAndMarkersResult> =>
  request<GetMapDataAndMarkersResult>(ctx, E.getMapDataAndMarkers, { params: { fullSizeIcons: true } }, options);

/** Every icon the department's map can show, for an in-app map legend: calls by type and priority, units by type and status, members by role and status, the status and priority colours and the POI types. Built from the same icons as GetMapDataAndMarkers, so the department's uploads, the built-in pin each type picked and its own names for types, priorities, status sets, statuses and roles all show as they do on the map. `GET /Mapping/GetMapIconLegend` — legacy: IRU. */
export const getMapIconLegend = (ctx: ApiContext, options?: RequestOptions): Promise<GetMapIconLegendResult> => request<GetMapIconLegendResult>(ctx, E.getMapIconLegend, {}, options);

/** Returns raw GeoJSON FeatureCollection for a MapLayer (legacy vector layers). `GET /Mapping/GetMapLayerGeoJSON/{layerId}` — legacy: DIU. */
export const getMapLayerGeoJSON = (ctx: ApiContext, params: { layerId: string }, options?: RequestOptions): Promise<UnknownV4Result> => request<UnknownV4Result>(ctx, E.getMapLayerGeoJSON, { params }, options);

/** Gets the user created map layers in the system. `GET /Mapping/GetMayLayers` — legacy: BDIRU. */
export const getMapLayers = (ctx: ApiContext, params: { type?: number | string } = {}, options?: RequestOptions): Promise<GetMapLayersResult> => request<GetMapLayersResult>(ctx, E.getMapLayers, { params }, options);

/** Returns indoor maps whose bounding box is within radiusMeters of the given lat/lon. `GET /Mapping/GetNearbyIndoorMaps` — legacy: IU. */
export const getNearbyIndoorMaps = (ctx: ApiContext, params: { lat?: number | string; lon?: number | string; radiusMeters?: number | string } = {}, options?: RequestOptions): Promise<GetIndoorMapsResult> =>
  request<GetIndoorMapsResult>(ctx, E.getNearbyIndoorMaps, { params }, options);

/** `GET /Mapping/GetPoi/{poiId}` (cached) — legacy: DIRU. */
export const getPoi = (ctx: ApiContext, params: { poiId: number | string }, options?: CachedRequestOptions): Promise<PoiResult> => cachedRequest<PoiResult>(ctx, E.getPoi, { params }, options);

/**
 * The department's destinations nearest a point, best first (those that can take the patient, then diversion, then the
 * rest; the closest routed). `GET /Mapping/GetNearestDestinations` — new in Omni (destination capabilities, M0315).
 */
export const getNearestDestinations = (
  ctx: ApiContext,
  params: { latitude: number; longitude: number; capabilityId?: string; unitId?: number | string; take?: number },
  options?: RequestOptions
): Promise<NearestDestinationsResult> => request<NearestDestinationsResult>(ctx, E.getNearestDestinations, { params }, options);

/** The capabilities the department's POIs can offer. `GET /Mapping/GetPoiCapabilities` (cached) — new in Omni (M0315). */
export const getPoiCapabilities = (ctx: ApiContext, options?: CachedRequestOptions): Promise<PoiCapabilitiesResult> => cachedRequest<PoiCapabilitiesResult>(ctx, E.getPoiCapabilities, {}, options);

/** `GET /Mapping/GetPois` (cached) — legacy: DIRU. */
export const getPois = (ctx: ApiContext, params: { poiTypeId?: number | string; destinationOnly?: boolean } = {}, options?: CachedRequestOptions): Promise<PoisResult> =>
  cachedRequest<PoisResult>(ctx, E.getPois, { params }, options);

/** `GET /Mapping/GetPoiTypes` (cached) — legacy: DIRU. */
export const getPoiTypes = (ctx: ApiContext, options?: CachedRequestOptions): Promise<PoiTypesResult> => cachedRequest<PoiTypesResult>(ctx, E.getPoiTypes, {}, options);

/** Unified search across indoor zones and custom map regions. `GET /Mapping/SearchAllMapFeatures` — legacy: IU. */
export const searchAllMapFeatures = (ctx: ApiContext, params: { term?: string; type?: string } = {}, options?: RequestOptions): Promise<SearchAllMapFeaturesResult> =>
  request<SearchAllMapFeaturesResult>(ctx, E.searchAllMapFeatures, { params }, options);

/** Searches for custom map regions matching the specified term. `GET /Mapping/SearchCustomMapRegions` — legacy: IU. */
export const searchCustomMapRegions = (ctx: ApiContext, params: { term?: string; layerId?: string } = {}, options?: RequestOptions): Promise<SearchCustomMapRegionsResult> =>
  request<SearchCustomMapRegionsResult>(ctx, E.searchCustomMapRegions, { params }, options);

/** Searches for indoor map zones matching the specified term. `GET /Mapping/SearchIndoorLocations` — legacy: IU. */
export const searchIndoorLocations = (ctx: ApiContext, params: { term?: string; mapId?: string } = {}, options?: RequestOptions): Promise<SearchIndoorLocationsResult> =>
  request<SearchIndoorLocationsResult>(ctx, E.searchIndoorLocations, { params }, options);

/** Sets a destination's availability (status 0 clears it). Dispatchers only. `POST /Mapping/SetPoiAvailability` — new in Omni (M0315). */
export const setPoiAvailability = (ctx: ApiContext, body: SetPoiAvailabilityInput, options?: RequestOptions): Promise<SetPoiAvailabilityResult> =>
  request<SetPoiAvailabilityResult>(ctx, E.setPoiAvailability, { body }, options);

/**
 * Expiring signatures for custom map tile/image and indoor floor image URLs of the caller's department (MapLibre plan D12):
 * native map sources cannot send a bearer header. `POST /Mapping/SignMapResourceUrls` — new in Omni.
 */
export const signMapResourceUrls = (ctx: ApiContext, body: SignMapResourceUrlsInput, options?: RequestOptions): Promise<SignMapResourceUrlsResult> =>
  request<SignMapResourceUrlsResult>(ctx, E.signMapResourceUrls, { body }, options);
