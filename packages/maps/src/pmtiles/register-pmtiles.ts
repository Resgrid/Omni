import type { PMTiles } from 'pmtiles';

/**
 * PMTiles archives for offline maps (MapLibre plan §19.6). MapLibre Native reads `pmtiles://file://…` sources itself,
 * so on iOS/Android there is nothing to register; the web/Electron build (`register-pmtiles.web.ts`) installs the
 * `pmtiles` protocol in maplibre-gl.
 */
export interface PmtilesProtocolHandle {
  /** Serves a local archive (OPFS `FileSource`, Electron custom protocol) under its `pmtiles://` key. */
  add(archive: PMTiles): void;
}

/** Native: no registration needed; returns null. */
export const registerPmtilesProtocol = (): PmtilesProtocolHandle | null => null;

export const isPmtilesProtocolRegistered = (): boolean => true;
