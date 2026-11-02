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

/** What the web protocols read downloaded packs through (the pack file store). */
export interface LocalPackReader {
  size(path: string): Promise<number | null>;
  read(path: string, offset: number, length: number): Promise<Uint8Array>;
}

/** Native: no registration needed; returns null. */
export const registerPmtilesProtocol = (): PmtilesProtocolHandle | null => null;

/** Native: MapLibre Native reads `file://` packs itself; nothing to serve. */
export const setLocalPackReader = (_reader: LocalPackReader | null): void => undefined;

/** Native: files are read by URI where they are used; there is no pack reader. */
export const readLocalPackFile = async (_uri: string): Promise<Uint8Array | null> => null;

export const isPmtilesProtocolRegistered = (): boolean => true;
