// Offline maps (MapLibre plan §19.5). Platform adapters (expo-file-system, NetInfo, MapLibre ambient cache) live in
// `@resgrid/maps/offline/native` so this barrel never loads a native module; the web/Electron OPFS store is plain DOM.
export { type BackgroundTransfer, type BackgroundTransferRequest, type BackgroundTransferResult, isExpiredUrlStatus } from './background-transfer';
export { decodeOfflineDepartmentData, MAX_DEPARTMENT_DATA_BYTES, OFFLINE_DEPARTMENT_SECTIONS, type OfflineDepartmentSection, toOfflineDepartmentData } from './department-data';
export { type AssetDownloadRequest, type AssetDownloadResult, DEFAULT_CHUNK_BYTES, downloadAsset, type DownloaderDeps } from './downloader';
export { actionFailed, actionOk, type OfflineMapsActionResult, type OfflineMapsErrorCode } from './errors';
export { createMemoryPackFileStore, normalizePackPath, type OfflinePackFileStore } from './file-store';
export {
  extractGlyphArchive,
  GLYPH_ARCHIVE_MAX_BYTES,
  GLYPH_ARCHIVE_MAX_FILES,
  GlyphArchiveError,
  type GlyphExtractOptions,
  type GlyphExtractResult,
  glyphTargetOf,
  readZipEntries,
  readZipEntry,
  type ZipEntry,
} from './glyphs';
export { createOfflineMapsHydrationStep, OFFLINE_MAPS_HYDRATION_STEP_ID, OfflineMapsHydrationError } from './hydration';
export {
  AMBIENT_CACHE_MAX_BYTES_CEILING,
  createMemoryOfflineMapsKv,
  createOfflinePackManager,
  DEFAULT_OFFLINE_PACKS_BUDGET_BYTES,
  isDeferredOfflineMapsResult,
  normalizeAmbientCacheBytes,
  OFFLINE_MAPS_WIFI_ONLY_KEY,
  OFFLINE_PENDING_RECHECK_MS,
  type OfflineAutoSyncOptions,
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
  GLYPHS_ASSET_ID,
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
export { OFFLINE_SWITCH_ERROR_THRESHOLD, OFFLINE_SWITCH_ERROR_WINDOW_MS, OFFLINE_SWITCH_MAX_HOLD_MS, OFFLINE_SWITCH_STABLE_MS, OfflineModeSwitch, type OfflineModeSwitchOptions } from './mode-switch';
export { noopOfflinePackRegistry, noopOfflineStyleComposer, onlineOnlyOfflineOptions } from './noop';
export { createOfflineMapOptions, type CreateOfflineMapOptionsInput, resolveOfflineMapMode } from './offline-options';
export {
  browserOpfsEnvironment,
  createBrowserNetworkProbe,
  createOpfsPackFileStore,
  createOpfsRegistryPersistence,
  OPFS_PACKS_DIRECTORY,
  OPFS_REGISTRY_FILE,
  OPFS_URI_PREFIX,
  type OpfsDirectoryHandle,
  type OpfsEnvironment,
  type OpfsFileHandle,
  opfsPathOf,
} from './opfs-file-store';
export {
  CORRIDOR_FOCUS_KM,
  distanceToBoundsKm,
  EMPTY_PACK_FOCUS,
  type ExtraPackFacts,
  INCIDENT_FOCUS_KM,
  isExtraPackWanted,
  NO_EXTRA_PACKS,
  type OfflineExtraPackPolicy,
  type OfflinePackFocus,
  type OfflinePackSelection,
  resolveExtraPackPolicy,
} from './pack-selection';
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
  OFFLINE_COVERAGE_METADATA,
  OFFLINE_CUSTOM_MAP_PREFIX,
  OFFLINE_DEPARTMENT_SOURCE_PREFIX,
  OFFLINE_FLOOR_PREFIX,
  OFFLINE_REMOTE_FALLBACK_PREFIX,
  offlineSafeId,
  offlineStyleComposer,
  pmtilesUrlFor,
  type RemoteFallbackSource,
  SPRITE_PLACEHOLDER,
  withRemoteFallback,
} from './style-composer';
export { defaultOfflineFetch, fetchRange, type OfflineFetch, type OfflineFetchResponse, parseContentRange, type RangeResponse } from './transport';
export {
  type FloorCorners,
  type MapLoadErrorKind,
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
