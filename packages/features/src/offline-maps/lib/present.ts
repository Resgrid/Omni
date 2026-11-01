import type { OfflineMapsErrorCode, OfflineMapsState, OfflinePackState, OfflinePackSummary } from '@resgrid/maps/offline';

const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** `1.5 MB`; null for unknown sizes. */
export const formatBytes = (bytes: number | null | undefined): string | null => {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? Math.round(value) : value.toFixed(value >= 100 ? 0 : 1)} ${UNITS[unit]}`;
};

/** `offline_maps.error.<code>` (dashes become underscores). */
export const errorKey = (code: OfflineMapsErrorCode): string => `offline_maps.error.${code.replace(/-/g, '_')}`;

export const packStateKey = (state: OfflinePackState): string => `offline_maps.state.${state.replace(/-/g, '_')}`;

/** The headline status (`offline_maps.status.*`). */
export const statusKey = (state: OfflineMapsState): string => {
  switch (state.status) {
    case 'checking':
      return 'offline_maps.status.checking';
    case 'downloading':
      return 'offline_maps.status.downloading';
    case 'paused':
      return 'offline_maps.status.paused';
    case 'waiting-for-wifi':
      return 'offline_maps.status.waiting_for_wifi';
    case 'error':
      return 'offline_maps.status.error';
    default:
      if (!state.isInstalled) return 'offline_maps.status.not_downloaded';
      return state.updateAvailable ? 'offline_maps.status.update_available' : 'offline_maps.status.up_to_date';
  }
};

export interface ContentRow {
  id: string;
  /** Translation key of the label, or null when `name` is shown. */
  labelKey: string | null;
  name: string | null;
  detailKey: string | null;
  detailCount: number | null;
  sizeBytes: number | null;
  state: OfflinePackState;
  code: OfflineMapsErrorCode | null;
}

const BASE_KINDS = new Set(['basemap']);
const SUPPORT_KINDS = new Set(['department-data', 'sprite', 'style']);

/** The worst state of a group: what the member needs to know first. */
const groupState = (packs: OfflinePackSummary[]): OfflinePackState => {
  const order: OfflinePackState[] = ['rejected', 'failed', 'not-downloaded', 'outdated', 'building', 'installed'];
  return order.find((state) => packs.some((pack) => pack.state === state)) ?? 'installed';
};

const sumSizes = (packs: OfflinePackSummary[]): number | null => {
  const known = packs.map((pack) => pack.sizeBytes ?? pack.installedBytes).filter((size): size is number => size !== null);
  return known.length > 0 ? known.reduce((sum, size) => sum + size, 0) : null;
};

/**
 * Settings list rows: one "Base map" row for all response-area cells, one "Department data and icons" row for the
 * bundle, sprite and styles, then one row per incident/corridor pack, custom map and indoor floor.
 */
export function buildContentRows(packs: readonly OfflinePackSummary[]): ContentRow[] {
  const rows: ContentRow[] = [];
  const base = packs.filter((pack) => BASE_KINDS.has(pack.kind));
  if (base.length > 0) {
    rows.push({
      id: 'basemap',
      labelKey: 'offline_maps.item.basemap',
      name: null,
      detailKey: 'offline_maps.item.basemap_count',
      detailCount: base.length,
      sizeBytes: sumSizes(base),
      state: groupState(base),
      code: base.find((pack) => pack.code)?.code ?? null,
    });
  }
  const support = packs.filter((pack) => SUPPORT_KINDS.has(pack.kind));
  if (support.length > 0) {
    rows.push({
      id: 'department-data',
      labelKey: 'offline_maps.item.department_data',
      name: null,
      detailKey: null,
      detailCount: null,
      sizeBytes: sumSizes(support),
      state: groupState(support),
      code: support.find((pack) => pack.code)?.code ?? null,
    });
  }
  for (const pack of packs) {
    if (BASE_KINDS.has(pack.kind) || SUPPORT_KINDS.has(pack.kind)) continue;
    rows.push({
      id: pack.packId,
      labelKey: null,
      name: pack.name,
      detailKey: `offline_maps.item.${pack.kind.replace(/-/g, '_')}`,
      detailCount: null,
      sizeBytes: pack.sizeBytes ?? pack.installedBytes,
      state: pack.state,
      code: pack.code,
    });
  }
  return rows;
}
