import type { MemoryDbSnapshot } from '@resgrid/offline';

import {
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
} from '../opfs-file-store';

// In-memory Origin Private File System: just the File System Access API surface the store uses (structural interfaces).

const domError = (name: string, message: string): Error => Object.assign(new Error(message), { name });

const toBytes = async (data: BufferSource | Blob): Promise<Uint8Array<ArrayBuffer>> => {
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
};

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

interface FakeStats {
  /** `entries()` calls (directory listings). */
  listings: number;
  /** `handle.move()` calls. */
  moves: number;
}

class FakeFile implements OpfsFileHandle {
  readonly kind = 'file' as const;
  data: Uint8Array<ArrayBuffer> = new Uint8Array(0);

  constructor(
    public name: string,
    public parent: FakeDirectory
  ) {}

  async getFile(): Promise<Blob> {
    return new Blob([this.data]);
  }

  async createWritable(options?: { keepExistingData?: boolean }): Promise<{ write(data: BufferSource | Blob): Promise<void>; close(): Promise<void> }> {
    // Like the real API: writes go to a swap copy that replaces the file on close.
    let pending: Uint8Array<ArrayBuffer> = options?.keepExistingData ? this.data.slice() : new Uint8Array(0);
    return {
      write: async (data) => {
        pending = concat(pending, await toBytes(data));
      },
      close: async () => {
        this.data = pending;
      },
    };
  }
}

class MovableFakeFile extends FakeFile {
  async move(parent: OpfsDirectoryHandle, name: string): Promise<void> {
    const target = parent as FakeDirectory;
    this.parent.children.delete(this.name);
    this.parent.stats.moves += 1;
    target.children.set(name, this);
    this.name = name;
    this.parent = target;
  }
}

class FakeDirectory implements OpfsDirectoryHandle {
  readonly kind = 'directory' as const;
  readonly children = new Map<string, FakeFile | FakeDirectory>();

  constructor(
    public name: string,
    readonly stats: FakeStats,
    private readonly movableFiles: boolean
  ) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDirectory> {
    const existing = this.children.get(name);
    if (existing instanceof FakeDirectory) return existing;
    if (existing) throw domError('TypeMismatchError', `${name} is a file`);
    if (!options?.create) throw domError('NotFoundError', `${name} not found`);
    const created = new FakeDirectory(name, this.stats, this.movableFiles);
    this.children.set(name, created);
    return created;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FakeFile> {
    const existing = this.children.get(name);
    if (existing instanceof FakeFile) return existing;
    if (existing) throw domError('TypeMismatchError', `${name} is a directory`);
    if (!options?.create) throw domError('NotFoundError', `${name} not found`);
    const created = this.movableFiles ? new MovableFakeFile(name, this) : new FakeFile(name, this);
    this.children.set(name, created);
    return created;
  }

  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    const entry = this.children.get(name);
    if (!entry) throw domError('NotFoundError', `${name} not found`);
    if (entry instanceof FakeDirectory && entry.children.size > 0 && !options?.recursive) throw domError('InvalidModificationError', `${name} is not empty`);
    this.children.delete(name);
  }

  async *entries(): AsyncIterableIterator<[string, OpfsFileHandle | OpfsDirectoryHandle]> {
    this.stats.listings += 1;
    for (const entry of [...this.children.entries()]) yield entry;
  }
}

const createFakeOpfs = (options: { movableFiles?: boolean; estimate?: { quota?: number; usage?: number } | 'throws' | null } = {}) => {
  const stats: FakeStats = { listings: 0, moves: 0 };
  const top = new FakeDirectory('', stats, options.movableFiles ?? false);
  const estimate = options.estimate;
  const environment: OpfsEnvironment = {
    getRoot: async () => top,
    estimate:
      estimate === null || estimate === undefined
        ? undefined
        : async () => {
            if (estimate === 'throws') throw new Error('Quota unavailable');
            return estimate;
          },
  };
  /** Every entry under the packs folder as `path` (files with their size), sorted. */
  const tree = (): string[] => {
    const packs = top.children.get(OPFS_PACKS_DIRECTORY);
    const out: string[] = [];
    const walk = (directory: FakeDirectory, prefix: string): void => {
      for (const [name, entry] of directory.children) {
        if (entry instanceof FakeDirectory) {
          out.push(`${prefix}${name}/`);
          walk(entry, `${prefix}${name}/`);
        } else {
          out.push(`${prefix}${name} (${entry.data.length})`);
        }
      }
    };
    if (packs instanceof FakeDirectory) walk(packs, '');
    return out.sort();
  };
  return { top, stats, environment, tree };
};

const bytes = (...values: number[]): Uint8Array<ArrayBuffer> => new Uint8Array(values);
const range = (from: number, to: number): number[] => Array.from({ length: to - from }, (_, index) => from + index);

const storeFor = (fake: ReturnType<typeof createFakeOpfs>) => {
  const store = createOpfsPackFileStore(fake.environment);
  if (!store) throw new Error('store expected with an OPFS environment');
  return store;
};

describe('createOpfsPackFileStore', () => {
  it('returns null without OPFS', () => {
    expect(createOpfsPackFileStore(null)).toBeNull();
  });

  it('appends one numbered segment per chunk and sums their sizes', async () => {
    const fake = createFakeOpfs();
    const store = storeFor(fake);
    await expect(store.size('scope/tmp/a.part')).resolves.toBeNull();

    await store.append('scope/tmp/a.part', bytes(1, 2, 3));
    await store.append('scope/tmp/a.part', bytes(4, 5));
    await store.append('/scope//tmp/./a.part', bytes(6));

    expect(fake.tree()).toEqual(['scope/', 'scope/tmp/', 'scope/tmp/a.part~000000 (3)', 'scope/tmp/a.part~000001 (2)', 'scope/tmp/a.part~000002 (1)']);
    await expect(store.size('scope/tmp/a.part')).resolves.toBe(6);
    await expect(store.size('scope/tmp/other.part')).resolves.toBeNull();
    await expect(store.size('missing/dir/a.part')).resolves.toBeNull();
  });

  it('reads across segment boundaries', async () => {
    const store = storeFor(createFakeOpfs());
    await store.append('a.pmtiles', new Uint8Array(range(0, 4)));
    await store.append('a.pmtiles', new Uint8Array(range(4, 7)));
    await store.append('a.pmtiles', new Uint8Array(range(7, 12)));

    await expect(store.read('a.pmtiles', 0, 12)).resolves.toEqual(new Uint8Array(range(0, 12)));
    await expect(store.read('a.pmtiles', 1, 2)).resolves.toEqual(new Uint8Array([1, 2]));
    // Two segments, then all three.
    await expect(store.read('a.pmtiles', 2, 4)).resolves.toEqual(new Uint8Array([2, 3, 4, 5]));
    await expect(store.read('a.pmtiles', 3, 6)).resolves.toEqual(new Uint8Array(range(3, 9)));
    // Starting exactly on a boundary, and running past the end of the file.
    await expect(store.read('a.pmtiles', 4, 3)).resolves.toEqual(new Uint8Array([4, 5, 6]));
    await expect(store.read('a.pmtiles', 10, 50)).resolves.toEqual(new Uint8Array([10, 11]));
    await expect(store.read('a.pmtiles', 12, 5)).resolves.toEqual(new Uint8Array(0));
    await expect(store.read('a.pmtiles', 2, 0)).resolves.toEqual(new Uint8Array(0));
    await expect(store.read('missing.pmtiles', 0, 1)).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('reads text spanning segments', async () => {
    const store = storeFor(createFakeOpfs());
    const encoded = new TextEncoder().encode('{"version":8,"name":"Größe"}');
    await store.append('scope/files/style.json', encoded.slice(0, 10));
    await store.append('scope/files/style.json', encoded.slice(10));
    await expect(store.readText('scope/files/style.json')).resolves.toBe('{"version":8,"name":"Größe"}');
  });

  it('caches a file’s segment list between reads and drops it on append', async () => {
    const fake = createFakeOpfs();
    const store = storeFor(fake);
    await store.append('a.part', bytes(1, 2));
    await expect(store.read('a.part', 0, 10)).resolves.toEqual(bytes(1, 2));
    const listings = fake.stats.listings;
    await expect(store.read('a.part', 1, 1)).resolves.toEqual(bytes(2));
    await expect(store.size('a.part')).resolves.toBe(2);
    expect(fake.stats.listings).toBe(listings);

    await store.append('a.part', bytes(3, 4));
    await expect(store.size('a.part')).resolves.toBe(4);
    await expect(store.read('a.part', 0, 10)).resolves.toEqual(bytes(1, 2, 3, 4));
  });

  it('lists logical names: segments collapse into one file, directories are flagged', async () => {
    const store = storeFor(createFakeOpfs());
    await store.append('scope/files/a.pmtiles', bytes(1));
    await store.append('scope/files/a.pmtiles', bytes(2));
    await store.append('scope/files/b.json', bytes(3));
    await store.append('scope/files/glyphs-1/Noto Sans Regular/0-255.pbf', bytes(4));

    const listed = await store.list('scope/files');
    expect(listed).toHaveLength(3);
    expect(listed).toEqual(
      expect.arrayContaining([
        { name: 'a.pmtiles', isDirectory: false },
        { name: 'b.json', isDirectory: false },
        { name: 'glyphs-1', isDirectory: true },
      ])
    );
    await expect(store.list('')).resolves.toEqual([{ name: 'scope', isDirectory: true }]);
    await expect(store.list('missing')).resolves.toEqual([]);
    await expect(store.list('scope/files/a.pmtiles')).resolves.toEqual([]);
  });

  it.each([
    ['with FileSystemHandle.move', true],
    ['copying where move is missing', false],
  ])('moves a file into place, replacing the destination (%s)', async (_label, movableFiles) => {
    const fake = createFakeOpfs({ movableFiles });
    const store = storeFor(fake);
    await store.append('scope/tmp/a.part', bytes(1, 2, 3));
    await store.append('scope/tmp/a.part', bytes(4, 5));
    // An older, longer copy at the destination: none of its segments may survive.
    await store.append('scope/files/a.pmtiles', bytes(9));
    await store.append('scope/files/a.pmtiles', bytes(9));
    await store.append('scope/files/a.pmtiles', bytes(9));
    await expect(store.size('scope/files/a.pmtiles')).resolves.toBe(3);

    await store.move('scope/tmp/a.part', 'scope/files/a.pmtiles');

    await expect(store.size('scope/files/a.pmtiles')).resolves.toBe(5);
    await expect(store.read('scope/files/a.pmtiles', 0, 5)).resolves.toEqual(bytes(1, 2, 3, 4, 5));
    expect(fake.tree()).toEqual(['scope/', 'scope/files/', 'scope/files/a.pmtiles~000000 (3)', 'scope/files/a.pmtiles~000001 (2)', 'scope/tmp/']);
    expect(fake.stats.moves).toBe(movableFiles ? 2 : 0);
    // A store opened afterwards (next page load) sees no source.
    await expect(storeFor(fake).size('scope/tmp/a.part')).resolves.toBeNull();
  });

  // Known source bug: `move` clears the segment cache first, then `fileSegments(from)` caches the source again, so the
  // same store still reports the moved-away file until the next move or remove. Change to `it` once that is fixed.
  it('forgets the source of a file move in the same store', async () => {
    const store = storeFor(createFakeOpfs());
    await store.append('scope/tmp/a.part', bytes(1, 2, 3));
    await store.move('scope/tmp/a.part', 'scope/files/a.pmtiles');
    await expect(store.size('scope/tmp/a.part')).resolves.toBeNull();
  });

  it('moves a file into a new directory and refuses a missing source', async () => {
    const store = storeFor(createFakeOpfs());
    await store.append('tmp/a.part', bytes(7));
    await store.move('tmp/a.part', 'scope/files/deep/a.pmtiles');
    await expect(store.read('scope/files/deep/a.pmtiles', 0, 1)).resolves.toEqual(bytes(7));
    await expect(store.move('tmp/missing.part', 'scope/files/b.pmtiles')).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('moves a directory tree into place, replacing an older one (extracted glyphs)', async () => {
    const fake = createFakeOpfs();
    const store = storeFor(fake);
    await store.append('scope/tmp/glyphs-new/Noto Sans Regular/0-255.pbf', bytes(1, 2));
    await store.append('scope/tmp/glyphs-new/Noto Sans Bold/0-255.pbf', bytes(3));
    await store.append('scope/files/glyphs-new/stale.pbf', bytes(9));

    await store.move('scope/tmp/glyphs-new', 'scope/files/glyphs-new');

    expect(fake.tree()).toEqual([
      'scope/',
      'scope/files/',
      'scope/files/glyphs-new/',
      'scope/files/glyphs-new/Noto Sans Bold/',
      'scope/files/glyphs-new/Noto Sans Bold/0-255.pbf~000000 (1)',
      'scope/files/glyphs-new/Noto Sans Regular/',
      'scope/files/glyphs-new/Noto Sans Regular/0-255.pbf~000000 (2)',
      'scope/tmp/',
    ]);
    await expect(store.read('scope/files/glyphs-new/Noto Sans Regular/0-255.pbf', 0, 2)).resolves.toEqual(bytes(1, 2));
    await expect(store.size('scope/files/glyphs-new/stale.pbf')).resolves.toBeNull();
  });

  it('removes a file, a directory tree, and everything for an empty path', async () => {
    const fake = createFakeOpfs();
    const store = storeFor(fake);
    await store.append('scope/files/a.pmtiles', bytes(1));
    await store.append('scope/files/a.pmtiles', bytes(2));
    await store.append('scope/files/a.pmtiles.bak', bytes(3));
    await store.append('scope/tmp/glyphs/x.pbf', bytes(4));
    await store.append('other/b.json', bytes(5));
    await expect(store.size('scope/files/a.pmtiles')).resolves.toBe(2);

    await store.remove('scope/files/a.pmtiles');
    await expect(store.size('scope/files/a.pmtiles')).resolves.toBeNull();
    await expect(store.size('scope/files/a.pmtiles.bak')).resolves.toBe(1);

    await store.remove('scope/tmp');
    await expect(store.list('scope')).resolves.toEqual([{ name: 'files', isDirectory: true }]);

    // Missing paths are ignored.
    await expect(store.remove('scope/files/missing.pmtiles')).resolves.toBeUndefined();
    await expect(store.remove('nowhere/at/all')).resolves.toBeUndefined();

    await store.remove('');
    expect(fake.tree()).toEqual([]);
    expect(fake.top.children.has(OPFS_PACKS_DIRECTORY)).toBe(true);
  });

  it('sizes a directory tree', async () => {
    const store = storeFor(createFakeOpfs());
    await store.append('scope/files/a.pmtiles', bytes(1, 2, 3));
    await store.append('scope/files/a.pmtiles', bytes(4));
    await store.append('scope/files/glyphs/x/0-255.pbf', bytes(5, 6));
    await store.append('other/b.json', bytes(7));
    await expect(store.directorySize('scope')).resolves.toBe(6);
    await expect(store.directorySize('scope/files/glyphs')).resolves.toBe(2);
    await expect(store.directorySize('')).resolves.toBe(7);
    await expect(store.directorySize('missing')).resolves.toBe(0);
  });

  it('reports disk space from the storage estimate', async () => {
    await expect(storeFor(createFakeOpfs({ estimate: { quota: 10_000, usage: 2_500 } })).diskSpace()).resolves.toEqual({ freeBytes: 7_500, totalBytes: 10_000 });
    await expect(storeFor(createFakeOpfs({ estimate: { quota: 1_000, usage: 4_000 } })).diskSpace()).resolves.toEqual({ freeBytes: 0, totalBytes: 1_000 });
    await expect(storeFor(createFakeOpfs({ estimate: { quota: 1_000 } })).diskSpace()).resolves.toEqual({ freeBytes: 1_000, totalBytes: 1_000 });
    await expect(storeFor(createFakeOpfs({ estimate: { usage: 10 } })).diskSpace()).resolves.toBeNull();
    await expect(storeFor(createFakeOpfs({ estimate: { quota: 0, usage: 0 } })).diskSpace()).resolves.toBeNull();
    await expect(storeFor(createFakeOpfs({ estimate: 'throws' })).diskSpace()).resolves.toBeNull();
    await expect(storeFor(createFakeOpfs({ estimate: null })).diskSpace()).resolves.toBeNull();
  });

  it('names files with opfs:// URIs that opfsPathOf reads back', () => {
    const store = storeFor(createFakeOpfs());
    expect(OPFS_URI_PREFIX).toBe('opfs://resgrid-offline-maps/');
    expect(store.uriFor('scope/files/a.pmtiles')).toBe('opfs://resgrid-offline-maps/scope/files/a.pmtiles');
    expect(store.uriFor('/scope//files/./a.pmtiles')).toBe('opfs://resgrid-offline-maps/scope/files/a.pmtiles');
    expect(opfsPathOf(store.uriFor('scope/files/a.pmtiles'))).toBe('scope/files/a.pmtiles');
    expect(opfsPathOf(store.uriFor('scope/files/glyphs-1/Noto Sans Regular/0-255.pbf'))).toBe('scope/files/glyphs-1/Noto Sans Regular/0-255.pbf');
    // maplibre-gl percent-encodes font stacks in glyph URLs.
    expect(opfsPathOf('opfs://resgrid-offline-maps/scope/files/glyphs-1/Noto%20Sans%20Regular/0-255.pbf')).toBe('scope/files/glyphs-1/Noto Sans Regular/0-255.pbf');
    expect(opfsPathOf('file:///docs/resgrid-offline-maps/a.pmtiles')).toBeNull();
    expect(opfsPathOf('opfs://another-folder/a.pmtiles')).toBeNull();
    expect(opfsPathOf('https://api.resgrid.test/a.pmtiles')).toBeNull();
    // A malformed escape is not a pack file (no URIError).
    expect(opfsPathOf('opfs://resgrid-offline-maps/scope/files/100%.png')).toBeNull();
  });

  it('rejects paths that climb out of the root', async () => {
    const store = storeFor(createFakeOpfs());
    await expect(store.append('../escape', bytes(1))).rejects.toThrow('Invalid offline pack path');
    await expect(store.append('', bytes(1))).rejects.toThrow('Invalid offline pack path');
  });

  it('retries opening the root after a failure', async () => {
    const fake = createFakeOpfs();
    let failures = 1;
    const store = createOpfsPackFileStore({
      getRoot: async () => {
        if (failures > 0) {
          failures -= 1;
          throw domError('SecurityError', 'Storage access denied');
        }
        return fake.top;
      },
    });
    if (!store) throw new Error('store expected');
    await expect(store.size('a.part')).rejects.toMatchObject({ name: 'SecurityError' });
    await store.append('a.part', bytes(1));
    await expect(store.size('a.part')).resolves.toBe(1);
  });
});

describe('createOpfsRegistryPersistence', () => {
  const snapshot = (rows: number): MemoryDbSnapshot => ({
    version: 1,
    tables: { offline_map_packs: { spec: { name: 'offline_map_packs', columns: [{ name: 'packId', type: 'TEXT', primaryKey: true }] }, rows: range(0, rows).map((index) => ({ packId: `p${index}` })) } },
  });

  it('returns null without OPFS', () => {
    expect(createOpfsRegistryPersistence(null)).toBeNull();
  });

  it('saves the snapshot as one JSON file beside the packs folder and loads it back', async () => {
    const fake = createFakeOpfs();
    const persistence = createOpfsRegistryPersistence(fake.environment);
    if (!persistence) throw new Error('persistence expected');
    await expect(persistence.load()).resolves.toBeNull();

    await persistence.save(snapshot(2));
    expect(OPFS_REGISTRY_FILE).toBe('resgrid-offline-maps.registry.json');
    expect(fake.top.children.get(OPFS_REGISTRY_FILE)).toBeInstanceOf(FakeFile);
    await expect(persistence.load()).resolves.toEqual(snapshot(2));
  });

  it('keeps the last of several saves', async () => {
    const fake = createFakeOpfs();
    const persistence = createOpfsRegistryPersistence(fake.environment, 'registry.json');
    if (!persistence) throw new Error('persistence expected');
    const first = persistence.save(snapshot(3));
    const second = persistence.save(snapshot(1));
    await Promise.all([first, second]);
    await expect(persistence.load()).resolves.toEqual(snapshot(1));
    // A shorter snapshot replaces the file rather than overwriting its start.
    expect(JSON.parse(new TextDecoder().decode((fake.top.children.get('registry.json') as FakeFile).data))).toEqual(snapshot(1));
  });

  it('starts empty from a missing, unreadable or foreign file', async () => {
    const fake = createFakeOpfs();
    const persistence = createOpfsRegistryPersistence(fake.environment, 'registry.json');
    if (!persistence) throw new Error('persistence expected');
    const write = async (text: string): Promise<void> => {
      const handle = await fake.top.getFileHandle('registry.json', { create: true });
      handle.data = new Uint8Array(new TextEncoder().encode(text));
    };
    await expect(persistence.load()).resolves.toBeNull();
    await write('{not json');
    await expect(persistence.load()).resolves.toBeNull();
    await write('');
    await expect(persistence.load()).resolves.toBeNull();
    await write('{"version":1}');
    await expect(persistence.load()).resolves.toBeNull();
    await write('[1,2]');
    await expect(persistence.load()).resolves.toBeNull();
  });

  it('keeps saving after a failed save', async () => {
    const fake = createFakeOpfs();
    let fail = true;
    const persistence = createOpfsRegistryPersistence({
      getRoot: async () => {
        if (fail) {
          fail = false;
          throw new Error('Storage access denied');
        }
        return fake.top;
      },
    });
    if (!persistence) throw new Error('persistence expected');
    await expect(persistence.save(snapshot(1))).rejects.toThrow('Storage access denied');
    await persistence.save(snapshot(2));
    await expect(persistence.load()).resolves.toEqual(snapshot(2));
  });
});

describe('createBrowserNetworkProbe', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const setNavigator = (value: unknown): void => {
    Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
  };

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete (globalThis as { navigator?: unknown }).navigator;
  });

  it.each([
    ['offline', { onLine: false }, { isConnected: false, isUnmetered: true, isExpensive: false }],
    ['no Network Information API (unmetered)', { onLine: true }, { isConnected: true, isUnmetered: true, isExpensive: false }],
    ['Wi-Fi', { onLine: true, connection: { type: 'wifi' } }, { isConnected: true, isUnmetered: true, isExpensive: false }],
    ['Ethernet', { onLine: true, connection: { type: 'ethernet' } }, { isConnected: true, isUnmetered: true, isExpensive: false }],
    ['a connection without a type', { onLine: true, connection: {} }, { isConnected: true, isUnmetered: true, isExpensive: false }],
    ['cellular', { onLine: true, connection: { type: 'cellular' } }, { isConnected: true, isUnmetered: false, isExpensive: true }],
    ['Data Saver on Wi-Fi', { onLine: true, connection: { type: 'wifi', saveData: true } }, { isConnected: true, isUnmetered: false, isExpensive: true }],
    ['Data Saver without a type', { onLine: true, connection: { saveData: true } }, { isConnected: true, isUnmetered: false, isExpensive: true }],
    ['Bluetooth tethering', { onLine: true, connection: { type: 'bluetooth' } }, { isConnected: true, isUnmetered: false, isExpensive: false }],
  ])('reads %s', async (_label, navigatorValue, expected) => {
    setNavigator(navigatorValue);
    await expect(createBrowserNetworkProbe().getState()).resolves.toEqual(expected);
  });

  it('counts as connected and unmetered without a navigator', async () => {
    setNavigator(undefined);
    await expect(createBrowserNetworkProbe().getState()).resolves.toEqual({ isConnected: true, isUnmetered: true, isExpensive: false });
  });
});
