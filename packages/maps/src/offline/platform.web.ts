/**
 * Web and Electron (MapLibre plan §19.6): offline packs live in the Origin Private File System and are read by the
 * `pmtiles` protocol in maplibre-gl — supported wherever OPFS is (Electron's secure `app://` origin, current browsers).
 */
export const isOfflineMapPacksSupported = (): boolean => {
  const storage = typeof navigator !== 'undefined' ? (navigator.storage as (StorageManager & { getDirectory?: unknown }) | undefined) : undefined;
  return typeof storage?.getDirectory === 'function';
};
