// Offline maps (MapLibre plan §19.5). Platform adapters (expo-file-system, NetInfo, MapLibre ambient cache) live in
// `@resgrid/maps/offline/native` so this barrel never loads a native module.
export { type AssetDownloadRequest, type AssetDownloadResult, DEFAULT_CHUNK_BYTES, downloadAsset, type DownloaderDeps } from './downloader';
export { actionFailed, actionOk, type OfflineMapsActionResult, type OfflineMapsErrorCode } from './errors';
export { createMemoryPackFileStore, normalizePackPath, type OfflinePackFileStore } from './file-store';
export {
  AMBIENT_CACHE_MAX_BYTES_CEILING,
  createMemoryOfflineMapsKv,
  createOfflinePackManager,
  DEFAULT_OFFLINE_PACKS_BUDGET_BYTES,
  normalizeAmbientCacheBytes,
  OFFLINE_MAPS_WIFI_ONLY_KEY,
  type OfflineInstalledSet,
  type OfflineMapsController,
  type OfflineMapsKv,
  type OfflineMapsProgress,
  type OfflineMapsState,
  type OfflineMapsStatus,
  OfflinePackManager,
  type OfflinePackManagerOptions,
  type OfflinePackState,
  type OfflinePackSummary,
} from './manager';
export {
  DEFAULT_OFFLINE_POLICY,
  isAllowedPackUrl,
  type ManifestParseResult,
  type OfflineManifest,
  type OfflineManifestAsset,
  offlineManifestFileSchema,
  offlineManifestFloorSchema,
  offlineManifestPackSchema,
  type OfflineManifestPendingPack,
  type OfflineManifestPolicy,
  offlineManifestPolicySchema,
  type OfflineManifestRejection,
  offlineManifestSchema,
  type OfflineManifestSnapshot,
  offlineManifestSpriteSchema,
  type OfflineManifestWire,
  parseOfflineManifest,
  toManifestSnapshot,
} from './manifest';
export { fetchOfflineManifest, type FetchOfflineManifestOptions, type ManifestFetchResult, type OfflineMapsAvailability, type OfflineMapsConfigInput, resolveOfflineMapsAvailability } from './manifest-client';
export { noopOfflinePackRegistry, noopOfflineStyleComposer, onlineOnlyOfflineOptions } from './noop';
export { createOfflineMapOptions, type CreateOfflineMapOptionsInput, resolveOfflineMapMode } from './offline-options';
export { isOfflineMapPacksSupported } from './platform';
export { OFFLINE_MAP_PACKS_AREA_ID, type OfflineMapPacksRegistries, registerOfflineMapPacks } from './registration';
export { createDbOfflinePackRegistry, type DbOfflinePackRegistry, OFFLINE_MAP_PACKS_TABLE, offlineMapPacksSchemaModule, offlinePackScopeKey } from './registry';
export { createSha256, isSha256Hex, type Sha256Hasher, sha256Hex } from './sha256';
export {
  DEFAULT_RESPONSE_AREA_MAX_BYTES,
  type DiskSpace,
  evaluateManifestSizes,
  LOW_STORAGE_FREE_RATIO,
  type ManifestSizeEvaluation,
  OFFLINE_PACK_BYTES_CEILING,
  resolveMaxPackBytes,
  resolveResponseAreaMaxBytes,
  wouldExhaustStorage,
} from './size-guard';
export {
  BASEMAP_PLACEHOLDER,
  buildFallbackOfflineStyle,
  composeOfflineStyle,
  GLYPHS_PLACEHOLDER,
  OFFLINE_CUSTOM_MAP_PREFIX,
  OFFLINE_DEPARTMENT_SOURCE_PREFIX,
  OFFLINE_FLOOR_PREFIX,
  offlineStyleComposer,
  pmtilesUrlFor,
  SPRITE_PLACEHOLDER,
} from './style-composer';
export { defaultOfflineFetch, fetchRange, type OfflineFetch, type OfflineFetchResponse, parseContentRange, type RangeResponse } from './transport';
export {
  type FloorCorners,
  type MapOfflineOptions,
  OFFLINE_MAP_ATTRIBUTION,
  type OfflineAssetKind,
  type OfflineDepartmentData,
  type OfflineIndoorFloor,
  type OfflineMapMode,
  OfflineMapPackKind,
  type OfflineMapPackRecord,
  OfflineMapPackStatus,
  type OfflinePackRegistry,
  type OfflinePackScope,
  type OfflineStyleComposer,
  type OfflineStyleInput,
  type PackBounds,
} from './types';
export { useOfflineMapOptions, type UseOfflineMapOptionsConfig } from './use-offline-map-options';
