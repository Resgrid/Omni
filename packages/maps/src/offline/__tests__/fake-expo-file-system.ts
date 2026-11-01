// In-memory stand-in for expo-file-system's SDK 57 `File` / `Directory` / `Paths` API (only what the pack store uses).
export const mockFs = { files: new Map<string, Uint8Array>(), dirs: new Set<string>(), free: 5_000, total: 50_000 };

type Part = string | { uri: string };

const joinParts = (parts: Part[]): string =>
  parts
    .map((part, index) => {
      const value = typeof part === 'string' ? part : part.uri;
      return index === 0 ? value.replace(/\/+$/, '') : value.replace(/^\/+|\/+$/g, '');
    })
    .filter((value) => value.length > 0)
    .join('/');

const parentOf = (uri: string): string => uri.slice(0, uri.lastIndexOf('/'));
const nameOf = (uri: string): string => uri.slice(uri.lastIndexOf('/') + 1);

export class Directory {
  uri: string;
  constructor(...parts: Part[]) {
    this.uri = joinParts(parts);
  }
  get exists(): boolean {
    return mockFs.dirs.has(this.uri);
  }
  get name(): string {
    return nameOf(this.uri);
  }
  get size(): number | null {
    return null;
  }
  create(options: { intermediates?: boolean } = {}): void {
    if (!options.intermediates && !mockFs.dirs.has(parentOf(this.uri))) throw new Error('Parent missing');
    let current = this.uri;
    while (current.includes('/') && !current.endsWith(':/') && current !== 'file://') {
      mockFs.dirs.add(current);
      current = parentOf(current);
    }
  }
  delete(): void {
    for (const key of [...mockFs.files.keys()]) if (key.startsWith(`${this.uri}/`)) mockFs.files.delete(key);
    for (const key of [...mockFs.dirs]) if (key === this.uri || key.startsWith(`${this.uri}/`)) mockFs.dirs.delete(key);
  }
  list(): (Directory | File)[] {
    const prefix = `${this.uri}/`;
    const direct = (key: string) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/');
    return [...[...mockFs.dirs].filter(direct).map((key) => new Directory(key)), ...[...mockFs.files.keys()].filter(direct).map((key) => new File(key))];
  }
}

export class File {
  uri: string;
  constructor(...parts: Part[]) {
    this.uri = joinParts(parts);
  }
  get exists(): boolean {
    return mockFs.files.has(this.uri);
  }
  get size(): number {
    return mockFs.files.get(this.uri)?.length ?? 0;
  }
  get name(): string {
    return nameOf(this.uri);
  }
  get parentDirectory(): Directory {
    return new Directory(parentOf(this.uri));
  }
  create(): void {
    if (!mockFs.dirs.has(parentOf(this.uri))) throw new Error('Parent missing');
    mockFs.files.set(this.uri, new Uint8Array(0));
  }
  write(content: Uint8Array, options: { append?: boolean } = {}): void {
    const existing = options.append ? (mockFs.files.get(this.uri) ?? new Uint8Array(0)) : new Uint8Array(0);
    const next = new Uint8Array(existing.length + content.length);
    next.set(existing, 0);
    next.set(content, existing.length);
    mockFs.files.set(this.uri, next);
  }
  open(): { offset: number | null; readBytes(length: number): Uint8Array; close(): void } {
    const uri = this.uri;
    let position = 0;
    return {
      get offset() {
        return position;
      },
      set offset(value: number | null) {
        position = value ?? 0;
      },
      readBytes(length: number) {
        const data = mockFs.files.get(uri) ?? new Uint8Array(0);
        const out = data.slice(position, position + length);
        position += out.length;
        return out;
      },
      close() {
        return undefined;
      },
    };
  }
  async text(): Promise<string> {
    return new TextDecoder().decode(mockFs.files.get(this.uri));
  }
  async move(destination: File): Promise<void> {
    const data = mockFs.files.get(this.uri);
    if (!data) throw new Error('Missing');
    if (!mockFs.dirs.has(parentOf(destination.uri))) throw new Error('Parent missing');
    mockFs.files.delete(this.uri);
    mockFs.files.set(destination.uri, data);
    this.uri = destination.uri;
  }
  delete(): void {
    mockFs.files.delete(this.uri);
  }
}

export const Paths = {
  get document(): Directory {
    return new Directory('file:///docs');
  },
  get availableDiskSpace(): number {
    return mockFs.free;
  },
  get totalDiskSpace(): number {
    return mockFs.total;
  },
};

export const FileMode = { ReadOnly: 'r', ReadWrite: 'rw' };
