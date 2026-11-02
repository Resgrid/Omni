import { PMTiles, Protocol, type RangeResponse, type Source } from 'pmtiles';

import { opfsPathOf } from '../offline/opfs-file-store';
import { withMapLibre } from '../rg/maplibre-loader.web';
import type { LocalPackReader, PmtilesProtocolHandle } from './register-pmtiles';

export type { LocalPackReader, PmtilesProtocolHandle } from './register-pmtiles';

let protocol: Protocol | null = null;
let localReader: LocalPackReader | null = null;
let opfsProtocolRegistered = false;

const PMTILES_PREFIX = 'pmtiles://';
const TILE_SUFFIX = /\/\d+\/\d+\/\d+$/;

/** A downloaded archive in the pack store (`opfs://…`), read in ranges like a remote one. */
class LocalPackSource implements Source {
  constructor(
    private readonly key: string,
    private readonly path: string,
    private readonly reader: LocalPackReader
  ) {}

  getKey(): string {
    return this.key;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const bytes = await this.reader.read(this.path, offset, length);
    return { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
  }
}

/** The archive key of a `pmtiles://` request (the URL without the scheme and without a `/z/x/y` tile suffix). */
export const pmtilesArchiveKey = (url: string): string => {
  const inner = url.startsWith(PMTILES_PREFIX) ? url.slice(PMTILES_PREFIX.length) : url;
  return inner.replace(TILE_SUFFIX, '');
};

/** Before the protocol answers, a local archive (`opfs://…`) gets its reader-backed instance once. */
const ensureLocalArchive = (instance: Protocol, url: string): void => {
  if (!localReader) return;
  const key = pmtilesArchiveKey(url);
  const path = opfsPathOf(key);
  if (path === null || instance.get(key)) return;
  instance.add(new PMTiles(new LocalPackSource(key, path, localReader)));
};

/**
 * Registers the `pmtiles://` protocol with maplibre-gl once per page (idempotent; later calls return the same handle).
 * Remote archives load by range requests; downloaded offline packs (`pmtiles://opfs://…`, §19.6) are read from the pack
 * store set with `setLocalPackReader`. maplibre-gl loads with the first map; the protocol is installed then, before
 * that map is created.
 */
export const registerPmtilesProtocol = (): PmtilesProtocolHandle => {
  if (!protocol) {
    const instance = new Protocol({ metadata: true });
    withMapLibre(({ addProtocol }) =>
      addProtocol('pmtiles', (params, abortController) => {
        ensureLocalArchive(instance, params.url);
        return instance.tile(params, abortController) as ReturnType<Parameters<typeof addProtocol>[1]>;
      })
    );
    protocol = instance;
  }
  return protocol;
};

/** A whole downloaded file by its `opfs://` URI (null for another URI, before the store is set, or when it is gone). */
export const readLocalPackFile = async (uri: string): Promise<Uint8Array | null> => {
  const path = opfsPathOf(uri.split('?')[0]);
  const reader = localReader;
  if (path === null || !reader) return null;
  const size = await reader.size(path);
  return size === null ? null : reader.read(path, 0, size);
};

/**
 * Serves the offline pack store to maplibre-gl on the web and Electron: `pmtiles://opfs://…` archives, and `opfs://…`
 * glyphs, sprites and indoor floor images that the composed offline style points at.
 */
export const setLocalPackReader = (reader: LocalPackReader | null): void => {
  localReader = reader;
  registerPmtilesProtocol();
  if (opfsProtocolRegistered || !reader) return;
  opfsProtocolRegistered = true;
  withMapLibre(({ addProtocol }) =>
    addProtocol('opfs', async (params) => {
      const bytes = await readLocalPackFile(params.url);
      if (!bytes) throw new Error('Offline map file missing');
      return { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
    })
  );
};

export const isPmtilesProtocolRegistered = (): boolean => protocol !== null;

/** Test helper: forget the registration. Not for app code. */
export const resetPmtilesProtocolForTests = (): void => {
  protocol = null;
  localReader = null;
  opfsProtocolRegistered = false;
};
