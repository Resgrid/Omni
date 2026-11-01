import type { DiskSpace } from './size-guard';

/**
 * Durable file storage for offline packs, addressed by paths relative to one root directory (the app sandbox on
 * native: `createExpoPackFileStore()` in `@resgrid/maps/offline/native`). Relative paths keep the registry valid when
 * iOS moves the sandbox on app update. Paths use `/` and never contain `..`.
 */
export interface OfflinePackFileStore {
  /** Absolute `file://` URI for a relative path (what MapLibre reads: `pmtiles://file://…`). */
  uriFor(relativePath: string): string;
  /** Size in bytes, or null when the file does not exist. */
  size(relativePath: string): Promise<number | null>;
  /** Appends bytes, creating the file and its parent directories when missing. */
  append(relativePath: string, bytes: Uint8Array): Promise<void>;
  /** Reads `length` bytes from `offset` (fewer at the end of the file). */
  read(relativePath: string, offset: number, length: number): Promise<Uint8Array>;
  readText(relativePath: string): Promise<string>;
  /** Atomic rename within the root; replaces the destination. */
  move(fromRelativePath: string, toRelativePath: string): Promise<void>;
  /** Deletes a file or a directory tree; missing paths are ignored. */
  remove(relativePath: string): Promise<void>;
  /** Names directly under a directory ('' = root); empty when missing. */
  list(relativeDirectory: string): Promise<{ name: string; isDirectory: boolean }[]>;
  /** Total bytes under a directory ('' = root); 0 when missing. */
  directorySize(relativeDirectory: string): Promise<number>;
  /** Device free/total space, or null when unknown. */
  diskSpace(): Promise<DiskSpace | null>;
}

const normalize = (path: string): string => {
  const parts = path.split('/').filter((part) => part.length > 0 && part !== '.');
  if (parts.some((part) => part === '..')) {
    throw new Error('Invalid offline pack path');
  }
  return parts.join('/');
};

export const normalizePackPath = normalize;

/**
 * In-memory store (tests, previews). Not durable: never used for real packs.
 */
export function createMemoryPackFileStore(options: { rootUri?: string; disk?: DiskSpace | null } = {}): OfflinePackFileStore & { files: Map<string, Uint8Array>; setDisk(disk: DiskSpace | null): void } {
  const files = new Map<string, Uint8Array>();
  const rootUri = (options.rootUri ?? 'file:///memory/offline-maps').replace(/\/+$/, '');
  let disk = options.disk ?? null;

  const under = (directory: string): string[] => {
    const prefix = directory ? `${directory}/` : '';
    return [...files.keys()].filter((key) => key.startsWith(prefix));
  };

  return {
    files,
    setDisk(next) {
      disk = next;
    },
    uriFor: (relativePath) => `${rootUri}/${normalize(relativePath)}`,
    size: async (relativePath) => files.get(normalize(relativePath))?.length ?? null,
    append: async (relativePath, bytes) => {
      const key = normalize(relativePath);
      const existing = files.get(key) ?? new Uint8Array(0);
      const next = new Uint8Array(existing.length + bytes.length);
      next.set(existing, 0);
      next.set(bytes, existing.length);
      files.set(key, next);
    },
    read: async (relativePath, offset, length) => {
      const data = files.get(normalize(relativePath));
      if (!data) throw new Error('File not found');
      return data.slice(offset, offset + length);
    },
    readText: async (relativePath) => {
      const data = files.get(normalize(relativePath));
      if (!data) throw new Error('File not found');
      return new TextDecoder().decode(data);
    },
    move: async (from, to) => {
      const source = normalize(from);
      const data = files.get(source);
      if (!data) throw new Error('File not found');
      files.delete(source);
      files.set(normalize(to), data);
    },
    remove: async (relativePath) => {
      const key = normalize(relativePath);
      files.delete(key);
      for (const child of under(key)) files.delete(child);
    },
    list: async (relativeDirectory) => {
      const directory = normalize(relativeDirectory);
      const prefix = directory ? `${directory}/` : '';
      const entries = new Map<string, boolean>();
      for (const key of under(directory)) {
        const rest = key.slice(prefix.length);
        const [head, ...tail] = rest.split('/');
        if (head) entries.set(head, (entries.get(head) ?? false) || tail.length > 0);
      }
      return [...entries.entries()].map(([name, isDirectory]) => ({ name, isDirectory }));
    },
    directorySize: async (relativeDirectory) => under(normalize(relativeDirectory)).reduce((sum, key) => sum + (files.get(key)?.length ?? 0), 0),
    diskSpace: async () => disk,
  };
}
