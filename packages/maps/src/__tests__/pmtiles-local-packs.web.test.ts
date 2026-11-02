import { isPmtilesProtocolRegistered, type LocalPackReader, pmtilesArchiveKey, readLocalPackFile, resetPmtilesProtocolForTests, setLocalPackReader } from '../pmtiles/register-pmtiles.web';

// Downloaded offline packs on the web and Electron: `pmtiles://opfs://…` archives and `opfs://…` files served to
// maplibre-gl from the pack store. maplibre-gl is replaced by a recorder of addProtocol calls; pmtiles by a Protocol that
// keeps added archives by key (what `get`/`add` do in the real one).

interface FakeArchiveSource {
  getKey(): string;
  getBytes(offset: number, length: number): Promise<{ data: ArrayBuffer }>;
}

interface FakeProtocol {
  archives: Map<string, { source: FakeArchiveSource }>;
  tile: jest.Mock;
  add: jest.Mock;
}

type ProtocolHandler = (params: { url: string }, abortController: AbortController) => Promise<{ data: ArrayBuffer }>;

const mockProtocolInstances: FakeProtocol[] = [];
const mockAddProtocol = jest.fn();

jest.mock('pmtiles', () => {
  class PMTiles {
    readonly source: FakeArchiveSource;
    constructor(archiveSource: FakeArchiveSource) {
      this.source = archiveSource;
    }
  }
  class Protocol {
    archives = new Map<string, PMTiles>();
    tile = jest.fn(async () => ({ data: new ArrayBuffer(0) }));
    add = jest.fn((archive: PMTiles) => {
      this.archives.set(archive.source.getKey(), archive);
    });
    constructor() {
      mockProtocolInstances.push(this);
    }
    get(key: string): PMTiles | undefined {
      return this.archives.get(key);
    }
  }
  return { PMTiles, Protocol };
});

jest.mock('../rg/maplibre-loader.web', () => ({
  withMapLibre: (setup: (maplibre: { addProtocol: (...args: unknown[]) => unknown }) => void) => setup({ addProtocol: mockAddProtocol }),
}));

const ARCHIVE_URI = 'opfs://resgrid-offline-maps/scope/files/a.pmtiles';

/** A pack store reader over fixed files; reads come back as views into a larger buffer, like real stores' slices. */
const createReader = (files: Record<string, number[]>) => {
  const stored = new Map(Object.entries(files).map(([path, values]) => [path, new Uint8Array([0xff, ...values, 0xff]).subarray(1, values.length + 1)]));
  const reader = {
    size: jest.fn(async (path: string) => stored.get(path)?.length ?? null),
    read: jest.fn(async (path: string, offset: number, length: number) => {
      const data = stored.get(path);
      if (!data) throw new Error('missing');
      return data.subarray(offset, offset + length);
    }),
  };
  return reader satisfies LocalPackReader;
};

const handlerFor = (scheme: string): ProtocolHandler => {
  const call = mockAddProtocol.mock.calls.find(([name]) => name === scheme);
  if (!call) throw new Error(`no ${scheme} protocol registered`);
  return call[1] as ProtocolHandler;
};

const registeredSchemes = (): string[] => mockAddProtocol.mock.calls.map(([name]) => name as string);

const protocol = (): FakeProtocol => {
  const instance = mockProtocolInstances.at(-1);
  if (!instance) throw new Error('no pmtiles Protocol');
  return instance;
};

beforeEach(() => {
  resetPmtilesProtocolForTests();
  mockProtocolInstances.length = 0;
});

describe('pmtilesArchiveKey', () => {
  it.each([
    ['pmtiles://opfs://resgrid-offline-maps/a/b.pmtiles/3/4/5', 'opfs://resgrid-offline-maps/a/b.pmtiles'],
    ['pmtiles://opfs://resgrid-offline-maps/a/b.pmtiles', 'opfs://resgrid-offline-maps/a/b.pmtiles'],
    ['pmtiles://https://maps.example.org/area.pmtiles/14/2650/6300', 'https://maps.example.org/area.pmtiles'],
    ['pmtiles://https://maps.example.org/area.pmtiles', 'https://maps.example.org/area.pmtiles'],
    ['https://maps.example.org/area.pmtiles', 'https://maps.example.org/area.pmtiles'],
  ])('%s → %s', (url, key) => {
    expect(pmtilesArchiveKey(url)).toBe(key);
  });
});

describe('readLocalPackFile', () => {
  it('reads nothing before the pack store is set', async () => {
    await expect(readLocalPackFile(ARCHIVE_URI)).resolves.toBeNull();
  });

  it('reads a whole opfs:// file from the pack store', async () => {
    const reader = createReader({ 'scope/files/f1.png': [1, 2, 3, 4], 'scope/files/glyphs/Noto Sans Regular/0-255.pbf': [5] });
    setLocalPackReader(reader);
    await expect(readLocalPackFile('opfs://resgrid-offline-maps/scope/files/f1.png')).resolves.toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(reader.read).toHaveBeenCalledWith('scope/files/f1.png', 0, 4);
    // A query string is ignored; percent-encoded names are decoded.
    await expect(readLocalPackFile('opfs://resgrid-offline-maps/scope/files/f1.png?v=2')).resolves.toEqual(new Uint8Array([1, 2, 3, 4]));
    await expect(readLocalPackFile('opfs://resgrid-offline-maps/scope/files/glyphs/Noto%20Sans%20Regular/0-255.pbf')).resolves.toEqual(new Uint8Array([5]));
  });

  it('reads nothing for other URIs or a missing file', async () => {
    const reader = createReader({ 'scope/files/f1.png': [1] });
    setLocalPackReader(reader);
    await expect(readLocalPackFile('file:///docs/resgrid-offline-maps/scope/files/f1.png')).resolves.toBeNull();
    await expect(readLocalPackFile('https://api.resgrid.test/floor.png')).resolves.toBeNull();
    expect(reader.size).not.toHaveBeenCalled();
    await expect(readLocalPackFile('opfs://resgrid-offline-maps/scope/files/gone.png')).resolves.toBeNull();
    expect(reader.read).not.toHaveBeenCalled();
  });
});

describe('setLocalPackReader', () => {
  it('registers the pmtiles protocol, and the opfs protocol once there is a reader', () => {
    setLocalPackReader(null);
    expect(registeredSchemes()).toEqual(['pmtiles']);
    expect(isPmtilesProtocolRegistered()).toBe(true);

    setLocalPackReader(createReader({}));
    setLocalPackReader(createReader({}));
    expect(registeredSchemes()).toEqual(['pmtiles', 'opfs']);
    expect(mockProtocolInstances).toHaveLength(1);
  });

  it('serves opfs:// files to maplibre-gl as array buffers, from the current reader', async () => {
    setLocalPackReader(createReader({ 'scope/files/f1.png': [9, 8, 7] }));
    const opfs = handlerFor('opfs');
    const response = await opfs({ url: 'opfs://resgrid-offline-maps/scope/files/f1.png' }, new AbortController());
    expect(Object.prototype.toString.call(response.data)).toBe('[object ArrayBuffer]');
    // Exactly the file's bytes, not the whole buffer behind the reader's view.
    expect(new Uint8Array(response.data)).toEqual(new Uint8Array([9, 8, 7]));

    setLocalPackReader(createReader({ 'scope/files/f1.png': [1] }));
    await expect(opfs({ url: 'opfs://resgrid-offline-maps/scope/files/f1.png' }, new AbortController()).then((next) => new Uint8Array(next.data))).resolves.toEqual(new Uint8Array([1]));
    await expect(opfs({ url: 'opfs://resgrid-offline-maps/scope/files/missing.png' }, new AbortController())).rejects.toThrow('Offline map file missing');
  });

  it('opens a downloaded archive from the pack store once, before the protocol answers', async () => {
    const reader = createReader({ 'scope/files/a.pmtiles': [10, 11, 12, 13, 14] });
    setLocalPackReader(reader);
    const pmtiles = handlerFor('pmtiles');
    const abortController = new AbortController();
    const tileParams = { url: `pmtiles://${ARCHIVE_URI}/3/4/5` };

    await pmtiles(tileParams, abortController);
    expect(protocol().add).toHaveBeenCalledTimes(1);
    expect(protocol().tile).toHaveBeenCalledWith(tileParams, abortController);
    const archive = protocol().archives.get(ARCHIVE_URI);
    if (!archive) throw new Error('archive expected under its opfs:// key');
    expect(archive.source.getKey()).toBe(ARCHIVE_URI);

    const range = await archive.source.getBytes(1, 3);
    expect(reader.read).toHaveBeenCalledWith('scope/files/a.pmtiles', 1, 3);
    expect(new Uint8Array(range.data)).toEqual(new Uint8Array([11, 12, 13]));

    // The TileJSON request and later tiles reuse the archive.
    await pmtiles({ url: `pmtiles://${ARCHIVE_URI}` }, abortController);
    await pmtiles({ url: `pmtiles://${ARCHIVE_URI}/4/8/10` }, abortController);
    expect(protocol().add).toHaveBeenCalledTimes(1);
    expect(protocol().tile).toHaveBeenCalledTimes(3);
  });

  it('leaves remote archives, and local ones without a reader, to the protocol', async () => {
    setLocalPackReader(createReader({}));
    const pmtiles = handlerFor('pmtiles');
    await pmtiles({ url: 'pmtiles://https://maps.example.org/area.pmtiles/3/4/5' }, new AbortController());
    expect(protocol().add).not.toHaveBeenCalled();

    setLocalPackReader(null);
    await pmtiles({ url: `pmtiles://${ARCHIVE_URI}/3/4/5` }, new AbortController());
    expect(protocol().add).not.toHaveBeenCalled();
    expect(protocol().tile).toHaveBeenCalledTimes(2);
  });
});
