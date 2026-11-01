import type { OfflineMapsErrorCode } from './errors';
import type { OfflineAssetKind } from './types';

const MB = 1024 * 1024;

/** Hard client ceiling for one pack and for the response area, whatever the server says (plan §19.3: 1 GB ceiling). */
export const OFFLINE_PACK_BYTES_CEILING = 1024 * MB;
/** Plan §19.3 default `ResponseAreaMaxBytes` when the manifest does not carry one. */
export const DEFAULT_RESPONSE_AREA_MAX_BYTES = 500 * MB;
/** Plan §19.8: warn before a download that would leave less than 10 % of the device free. */
export const LOW_STORAGE_FREE_RATIO = 0.1;

const positive = (value: number | null | undefined): number | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);

/** The per-pack limit: the manifest's `MaxPackBytes`, never above the ceiling. */
export const resolveMaxPackBytes = (serverValue: number | null | undefined): number => Math.min(positive(serverValue) ?? OFFLINE_PACK_BYTES_CEILING, OFFLINE_PACK_BYTES_CEILING);

/** The response-area limit: the manifest's `ResponseAreaMaxBytes` (default 500 MB), never above the ceiling. */
export const resolveResponseAreaMaxBytes = (serverValue: number | null | undefined): number => Math.min(positive(serverValue) ?? DEFAULT_RESPONSE_AREA_MAX_BYTES, OFFLINE_PACK_BYTES_CEILING);

export interface RejectedAsset {
  assetId: string;
  code: OfflineMapsErrorCode;
}

/** What the guard reads from a manifest asset (manifest assets and persisted snapshot assets both fit). */
export interface SizedAsset {
  assetId: string;
  kind: OfflineAssetKind;
  sizeBytes: number | null;
}

/** What the guard reads from a manifest. */
export interface SizedManifest<T extends SizedAsset> {
  assets: T[];
  policy: { maxPackBytes: number; responseAreaMaxBytes: number };
}

export interface ManifestSizeEvaluation<T extends SizedAsset = SizedAsset> {
  /** Assets the client may download. */
  allowed: T[];
  rejected: RejectedAsset[];
  /** Declared bytes of the response-area base packs. */
  responseAreaBytes: number;
  responseAreaLimitBytes: number;
  maxPackBytes: number;
  /** True when the base packs together exceed the response-area limit (all of them are refused). */
  responseAreaExceeded: boolean;
}

/**
 * Client-side guard for the server's size enforcement (plan §19.3): a pack above the per-pack limit is refused, and if
 * the response-area base packs together exceed `ResponseAreaMaxBytes` none of them is downloaded — the server refuses
 * such areas on save, so this only trips on a server bug or a tampered manifest, and must not fill the device.
 */
export function evaluateManifestSizes<T extends SizedAsset>(manifest: SizedManifest<T>): ManifestSizeEvaluation<T> {
  const maxPackBytes = manifest.policy.maxPackBytes;
  const responseAreaLimitBytes = manifest.policy.responseAreaMaxBytes;
  const rejected: RejectedAsset[] = [];
  const sized: T[] = [];

  for (const asset of manifest.assets) {
    if (asset.sizeBytes !== null && asset.sizeBytes > maxPackBytes) {
      rejected.push({ assetId: asset.assetId, code: 'pack-too-large' });
    } else {
      sized.push(asset);
    }
  }

  const responseAreaBytes = sized.filter((asset) => asset.kind === 'basemap').reduce((sum, asset) => sum + (asset.sizeBytes ?? 0), 0);
  const responseAreaExceeded = responseAreaBytes > responseAreaLimitBytes;
  const allowed = responseAreaExceeded ? sized.filter((asset) => asset.kind !== 'basemap') : sized;
  if (responseAreaExceeded) {
    for (const asset of sized) {
      if (asset.kind === 'basemap') rejected.push({ assetId: asset.assetId, code: 'response-area-too-large' });
    }
  }

  return { allowed, rejected, responseAreaBytes, responseAreaLimitBytes, maxPackBytes, responseAreaExceeded };
}

export interface DiskSpace {
  freeBytes: number;
  totalBytes: number;
}

/** True when downloading `requiredBytes` would leave less than 10 % of the device free. Unknown space never blocks. */
export function wouldExhaustStorage(requiredBytes: number, disk: DiskSpace | null): boolean {
  if (!disk || !(disk.totalBytes > 0) || !Number.isFinite(disk.freeBytes)) {
    return false;
  }
  return disk.freeBytes - requiredBytes < disk.totalBytes * LOW_STORAGE_FREE_RATIO;
}
