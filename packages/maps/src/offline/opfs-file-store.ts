import type { MemoryDbPersistence, MemoryDbSnapshot } from '@resgrid/offline';

import { normalizePackPath, type OfflinePackFileStore } from './file-store';
import type { OfflineNetworkProbe } from './network';
import type { DiskSpace } from './size-guard';

/**
 * Offline pack storage for the web and Electron (MapLibre plan §19.6) on the Origin Private File System: Electron's
 * `app://` origin is a privileged secure scheme, so the same store keeps packs on disk in the app profile there; in a
 * browser it is best effort (the shell asks `navigator.storage.persist()`; the browser may still evict).
 *
 * A pack is written as numbered segment files (`<name>~000000`, `<name>~000001`, …), one per appended chunk: OPFS from
 * the main thread can only append by rewriting the whole file (`createWritable({ keepExistingData })` copies it), which
 * would turn a 500 MB download quadratic. Reads span segments, so callers (PMTiles reader, glyph zip, department data)
 * see one file (segments never change once written, so their lists are cached between reads — a tile read is one
 * slice). URIs are `opfs://resgrid-offline-maps/<path>`; `setLocalPackReader` serves them to maplibre-gl.
 */

export const OPFS_PACKS_DIRECTORY = 'resgrid-offline-maps';
export const OPFS_URI_PREFIX = `opfs://${OPFS_PACKS_DIRECTORY}/`;
const SEGMENT_SEPARATOR = '~';
const SEGMENT_DIGITS = 6;

/** The parts of the File System Access API the store uses (structural, so tests can pass an in-memory fake). */
export interface OpfsFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<Blob>;
  createWritable(options?: { keepExistingData?: boolean }): Promise<{ write(data: BufferSource | Blob): Promise<void>; close(): Promise<void> }>;
  move?(parent: OpfsDirectoryHandle, name: string): Promise<void>;
}

export interface OpfsDirectoryHandle {
  kind: 'directory';
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OpfsDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  entries(): AsyncIterableIterator<[string, OpfsFileHandle | OpfsDirectoryHandle]>;
}

export interface OpfsEnvironment {
  getRoot(): Promise<OpfsDirectoryHandle>;
  estimate?(): Promise<{ quota?: number; usage?: number }>;
}

/** The browser's OPFS (null without it: an old browser, a private window that refuses it, the tests). */
export const browserOpfsEnvironment = (): OpfsEnvironment | null => {
  const storage = typeof navigator !== 'undefined' ? (navigator.storage as (StorageManager & { getDirectory?: () => Promise<unknown> }) | undefined) : undefined;
  if (!storage || typeof storage.getDirectory !== 'function') return null;
  return {
    getRoot: async () => (await storage.getDirectory?.()) as OpfsDirectoryHandle,
    estimate: typeof storage.estimate === 'function' ? () => storage.estimate() : undefined,
  };
};

interface Segment {
  handle: OpfsFileHandle;
  /** The written segment (never changes afterwards). */
  file: Blob;
  size: number;
}

const isNotFound = (error: unknown): boolean => error instanceof Error && (error.name === 'NotFoundError' || error.name === 'TypeMismatchError');

const segmentName = (name: string, index: number): string => `${name}${SEGMENT_SEPARATOR}${String(index).padStart(SEGMENT_DIGITS, '0')}`;

const SEGMENT_PATTERN = new RegExp(`^(.*)${SEGMENT_SEPARATOR}(\\d{${SEGMENT_DIGITS}})$`);

const splitPath = (relativePath: string): { directories: string[]; name: string } => {
  const parts = normalizePackPath(relativePath).split('/').filter(Boolean);
  const name = parts.pop() ?? '';
  return { directories: parts, name };
};

/** The pack path of an `opfs://` URI, or null for any other URI. */
export const opfsPathOf = (uri: string): string | null => {
  if (!uri.startsWith(OPFS_URI_PREFIX)) return null;
  try {
    return decodeURIComponent(uri.slice(OPFS_URI_PREFIX.length));
  } catch {
    // A malformed escape is not a pack file.
    return null;
  }
};

export function createOpfsPackFileStore(environment: OpfsEnvironment | null = browserOpfsEnvironment()): OfflinePackFileStore | null {
  if (!environment) return null;
  let rootPromise: Promise<OpfsDirectoryHandle> | null = null;
  const root = (): Promise<OpfsDirectoryHandle> => {
    rootPromise =
      rootPromise ??
      environment
        .getRoot()
        .then((top) => top.getDirectoryHandle(OPFS_PACKS_DIRECTORY, { create: true }))
        .catch((error: unknown) => {
          rootPromise = null;
          throw error;
        });
    return rootPromise;
  };

  const directoryFor = async (directories: readonly string[], create: boolean): Promise<OpfsDirectoryHandle | null> => {
    let current = await root();
    for (const part of directories) {
      try {
        current = await current.getDirectoryHandle(part, { create });
      } catch (error) {
        if (!create && isNotFound(error)) return null;
        throw error;
      }
    }
    return current;
  };

  const entriesOf = async (directory: OpfsDirectoryHandle): Promise<[string, OpfsFileHandle | OpfsDirectoryHandle][]> => {
    const list: [string, OpfsFileHandle | OpfsDirectoryHandle][] = [];
    for await (const entry of directory.entries()) list.push(entry);
    return list;
  };

  /** A logical file's segments, in order. */
  const segmentsOf = async (directory: OpfsDirectoryHandle, name: string): Promise<Segment[]> => {
    const found: { index: number; handle: OpfsFileHandle }[] = [];
    for (const [entryName, handle] of await entriesOf(directory)) {
      if (handle.kind !== 'file') continue;
      const match = SEGMENT_PATTERN.exec(entryName);
      if (match && match[1] === name) found.push({ index: Number(match[2]), handle });
    }
    found.sort((a, b) => a.index - b.index);
    return Promise.all(
      found.map(async ({ handle }) => {
        const file = await handle.getFile();
        return { handle, file, size: file.size };
      })
    );
  };

  /** Written segments by normalized path; dropped on every write, move or remove. */
  const cache = new Map<string, { directory: OpfsDirectoryHandle; name: string; segments: Segment[] }>();

  const fileSegments = async (relativePath: string): Promise<{ directory: OpfsDirectoryHandle; name: string; segments: Segment[] } | null> => {
    const key = normalizePackPath(relativePath);
    const cached = cache.get(key);
    if (cached) return cached;
    const { directories, name } = splitPath(relativePath);
    const directory = await directoryFor(directories, false);
    if (!directory || !name) return null;
    const segments = await segmentsOf(directory, name);
    if (segments.length === 0) return null;
    const entry = { directory, name, segments };
    cache.set(key, entry);
    return entry;
  };

  const isDirectory = async (relativePath: string): Promise<OpfsDirectoryHandle | null> => {
    const { directories, name } = splitPath(relativePath);
    if (!name) return root();
    const parent = await directoryFor(directories, false);
    if (!parent) return null;
    try {
      return await parent.getDirectoryHandle(name, { create: false });
    } catch {
      return null;
    }
  };

  const read = async (relativePath: string, offset: number, length: number): Promise<Uint8Array> => {
    const file = await fileSegments(relativePath);
    if (!file) throw Object.assign(new Error(`No offline file at ${relativePath}`), { name: 'NotFoundError' });
    const out: Uint8Array[] = [];
    let wanted = Math.max(0, length);
    let position = 0;
    for (const segment of file.segments) {
      if (wanted <= 0) break;
      const segmentEnd = position + segment.size;
      if (segmentEnd > offset) {
        const start = Math.max(0, offset - position);
        const end = Math.min(segment.size, start + wanted);
        const blob = segment.file.slice(start, end);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        out.push(bytes);
        wanted -= bytes.length;
        offset += bytes.length;
      }
      position = segmentEnd;
    }
    const total = out.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(total);
    let at = 0;
    for (const part of out) {
      result.set(part, at);
      at += part.length;
    }
    return result;
  };

  const copyDirectory = async (from: OpfsDirectoryHandle, to: OpfsDirectoryHandle): Promise<void> => {
    for (const [name, handle] of await entriesOf(from)) {
      if (handle.kind === 'directory') {
        await copyDirectory(handle, await to.getDirectoryHandle(name, { create: true }));
      } else {
        const target = await to.getFileHandle(name, { create: true });
        const writable = await target.createWritable();
        await writable.write(await handle.getFile());
        await writable.close();
      }
    }
  };

  const removeFile = async (directory: OpfsDirectoryHandle, name: string): Promise<void> => {
    for (const { handle } of await segmentsOf(directory, name)) await directory.removeEntry(handle.name).catch(() => undefined);
  };

  const sizeOfDirectory = async (directory: OpfsDirectoryHandle): Promise<number> => {
    let total = 0;
    for (const [, handle] of await entriesOf(directory)) total += handle.kind === 'directory' ? await sizeOfDirectory(handle) : (await handle.getFile()).size;
    return total;
  };

  const moveEntry = async (fromRelativePath: string, toRelativePath: string): Promise<void> => {
    const sourceDirectory = await isDirectory(fromRelativePath);
    const to = splitPath(toRelativePath);
    const targetParent = await directoryFor(to.directories, true);
    if (!targetParent || !to.name) throw new Error('Invalid offline pack path');
    if (sourceDirectory && splitPath(fromRelativePath).name) {
      // A directory tree (extracted glyphs): copy, then drop the source. OPFS cannot rename directories everywhere.
      await targetParent.removeEntry(to.name, { recursive: true }).catch(() => undefined);
      await copyDirectory(sourceDirectory, await targetParent.getDirectoryHandle(to.name, { create: true }));
      const from = splitPath(fromRelativePath);
      const fromParent = await directoryFor(from.directories, false);
      await fromParent?.removeEntry(from.name, { recursive: true }).catch(() => undefined);
      return;
    }
    const source = await fileSegments(fromRelativePath);
    if (!source) throw Object.assign(new Error(`No offline file at ${fromRelativePath}`), { name: 'NotFoundError' });
    await removeFile(targetParent, to.name);
    let index = 0;
    for (const { handle } of source.segments) {
      const name = segmentName(to.name, index);
      index += 1;
      if (handle.move) {
        await handle.move(targetParent, name);
      } else {
        const target = await targetParent.getFileHandle(name, { create: true });
        const writable = await target.createWritable();
        await writable.write(await handle.getFile());
        await writable.close();
        await source.directory.removeEntry(handle.name);
      }
    }
  };

  return {
    uriFor: (relativePath) => `${OPFS_URI_PREFIX}${normalizePackPath(relativePath)}`,
    size: async (relativePath) => {
      const file = await fileSegments(relativePath);
      return file ? file.segments.reduce((sum, segment) => sum + segment.size, 0) : null;
    },
    append: async (relativePath, bytes) => {
      cache.delete(normalizePackPath(relativePath));
      const { directories, name } = splitPath(relativePath);
      const directory = await directoryFor(directories, true);
      if (!directory || !name) throw new Error('Invalid offline pack path');
      const next = (await segmentsOf(directory, name)).length;
      const handle = await directory.getFileHandle(segmentName(name, next), { create: true });
      const writable = await handle.createWritable();
      await writable.write(bytes as BufferSource);
      await writable.close();
    },
    read,
    readText: async (relativePath) => {
      const size = (await fileSegments(relativePath))?.segments.reduce((sum, segment) => sum + segment.size, 0) ?? 0;
      return new TextDecoder().decode(await read(relativePath, 0, size));
    },
    move: async (fromRelativePath, toRelativePath) => {
      cache.clear();
      try {
        await moveEntry(fromRelativePath, toRelativePath);
      } finally {
        // Reading the source cached it again: forget both ends.
        cache.clear();
      }
    },
    remove: async (relativePath) => {
      cache.clear();
      const { directories, name } = splitPath(relativePath);
      const parent = await directoryFor(directories, false);
      if (!parent) return;
      if (!name) {
        for (const [entryName] of await entriesOf(parent)) await parent.removeEntry(entryName, { recursive: true }).catch(() => undefined);
        return;
      }
      const directory = await isDirectory(relativePath);
      if (directory) {
        await parent.removeEntry(name, { recursive: true }).catch(() => undefined);
        return;
      }
      await removeFile(parent, name);
    },
    list: async (relativeDirectory) => {
      const directory = relativeDirectory ? await isDirectory(relativeDirectory) : await root();
      if (!directory) return [];
      const names = new Map<string, boolean>();
      for (const [entryName, handle] of await entriesOf(directory)) {
        if (handle.kind === 'directory') names.set(entryName, true);
        else names.set(SEGMENT_PATTERN.exec(entryName)?.[1] ?? entryName, false);
      }
      return [...names].map(([name, isDir]) => ({ name, isDirectory: isDir }));
    },
    directorySize: async (relativeDirectory) => {
      const directory = relativeDirectory ? await isDirectory(relativeDirectory) : await root();
      return directory ? sizeOfDirectory(directory) : 0;
    },
    diskSpace: async (): Promise<DiskSpace | null> => {
      try {
        const estimate = await environment.estimate?.();
        const quota = estimate?.quota ?? 0;
        return quota > 0 ? { freeBytes: Math.max(0, quota - (estimate?.usage ?? 0)), totalBytes: quota } : null;
      } catch {
        return null;
      }
    },
  };
}

/** The registry snapshot beside (never inside) the packs folder, which retention sweeps. */
export const OPFS_REGISTRY_FILE = `${OPFS_PACKS_DIRECTORY}.registry.json`;

/**
 * Keeps the web pack registry (a memory DB) across reloads as one JSON file in OPFS, so downloaded packs stay known.
 * Saves run one at a time, last write wins; an unreadable file starts empty (retention then removes the orphaned files).
 */
export function createOpfsRegistryPersistence(environment: OpfsEnvironment | null = browserOpfsEnvironment(), fileName: string = OPFS_REGISTRY_FILE): MemoryDbPersistence | null {
  if (!environment) return null;
  let saving: Promise<void> = Promise.resolve();
  return {
    load: async (): Promise<MemoryDbSnapshot | null> => {
      try {
        const handle = await (await environment.getRoot()).getFileHandle(fileName, { create: false });
        const text = await (await handle.getFile()).text();
        const parsed: unknown = text ? JSON.parse(text) : null;
        return parsed !== null && typeof parsed === 'object' && 'tables' in parsed ? (parsed as MemoryDbSnapshot) : null;
      } catch {
        return null;
      }
    },
    save: (snapshot) => {
      const text = JSON.stringify(snapshot);
      saving = saving
        .catch(() => undefined)
        .then(async () => {
          const handle = await (await environment.getRoot()).getFileHandle(fileName, { create: true });
          const writable = await handle.createWritable();
          await writable.write(new TextEncoder().encode(text));
          await writable.close();
        });
      return saving;
    },
  };
}

interface BrowserConnection {
  type?: string;
  saveData?: boolean;
}

const UNMETERED_CONNECTIONS = new Set(['wifi', 'ethernet', 'unknown', 'other']);

/**
 * The browser's view of the network for the Wi-Fi-only choice: `navigator.onLine`, and the Network Information API
 * where there is one (Chromium, so Electron). Without a connection type (Safari, Firefox, most desktops) the connection
 * counts as unmetered; Data Saver or a cellular connection counts as metered.
 */
export const createBrowserNetworkProbe = (): OfflineNetworkProbe => ({
  getState: async () => {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { connection?: BrowserConnection }) : undefined;
    const connection = nav?.connection;
    const isExpensive = connection?.saveData === true || connection?.type === 'cellular';
    const isUnmetered = !isExpensive && (connection?.type === undefined || UNMETERED_CONNECTIONS.has(connection.type));
    return { isConnected: nav?.onLine !== false, isUnmetered, isExpensive };
  },
});
