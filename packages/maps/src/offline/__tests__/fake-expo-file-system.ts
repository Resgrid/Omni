// In-memory stand-in for expo-file-system's SDK 58 `File` / `Directory` / `Paths` API (only what the pack store uses).
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
  get parentDirectory(): Directory {
    return new Directory(parentOf(this.uri));
  }
  async move(destination: Directory): Promise<void> {
    if (!this.exists) throw new Error('Missing');
    if (mockFs.dirs.has(destination.uri)) throw new Error('Destination exists (the source would move inside it)');
    if (!mockFs.dirs.has(parentOf(destination.uri))) throw new Error('Parent missing');
    const from = this.uri;
    for (const key of [...mockFs.files.keys()]) {
      if (key.startsWith(`${from}/`)) {
        const data = mockFs.files.get(key) as Uint8Array;
        mockFs.files.delete(key);
        mockFs.files.set(`${destination.uri}${key.slice(from.length)}`, data);
      }
    }
    for (const key of [...mockFs.dirs]) {
      if (key === from || key.startsWith(`${from}/`)) {
        mockFs.dirs.delete(key);
        mockFs.dirs.add(`${destination.uri}${key.slice(from.length)}`);
      }
    }
    this.uri = destination.uri;
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

type DownloadTaskState = 'idle' | 'active' | 'paused' | 'completed' | 'cancelled' | 'error';

interface DownloadTaskOptions {
  sessionType?: 'background' | 'foreground';
  onProgress?: (data: { bytesWritten: number; totalBytes: number }) => void;
}

interface DownloadPauseState {
  url: string;
  fileUri: string;
  isDirectory: boolean;
  resumeData?: string;
}

/**
 * Background transfers (`DownloadTask`): every task is recorded in `mockDownloads.tasks`; `mockDownloads.run` decides
 * what `downloadAsync`/`resumeAsync` do (helpers on the task write the file, report progress or wait for a pause).
 */
export const mockDownloads = {
  tasks: [] as DownloadTask[],
  restored: [] as DownloadPauseState[],
  run: null as ((task: DownloadTask, mode: 'download' | 'resume') => Promise<File | null>) | null,
  reset(): void {
    this.tasks.length = 0;
    this.restored.length = 0;
    this.run = null;
  },
};

export class DownloadTask {
  state: DownloadTaskState = 'idle';
  calls: string[] = [];
  released = false;
  private pauseWaiters: (() => void)[] = [];

  constructor(
    public url: string,
    public destination: File,
    public options: DownloadTaskOptions = {}
  ) {
    mockDownloads.tasks.push(this);
  }

  static fromSavable(state: DownloadPauseState, options?: DownloadTaskOptions): DownloadTask {
    if (state.resumeData === 'corrupt') throw new Error('Invalid resume data');
    mockDownloads.restored.push(state);
    const task = new DownloadTask(state.url, new File(state.fileUri), options);
    task.state = 'paused';
    return task;
  }

  /** Writes the finished file where the OS would move it. */
  complete(body: Uint8Array): File {
    mockFs.files.set(this.destination.uri, body);
    this.state = 'completed';
    return this.destination;
  }

  /** Resolves once `pauseAsync` ran (what a pending `downloadAsync` resolves with: null). */
  untilPaused(): Promise<null> {
    return new Promise((resolve) => this.pauseWaiters.push(() => resolve(null)));
  }

  private start(mode: 'download' | 'resume'): Promise<File | null> {
    this.calls.push(mode);
    this.state = 'active';
    if (!mockDownloads.run) return Promise.resolve(this.complete(new Uint8Array(0)));
    return mockDownloads.run(this, mode).catch((error: unknown) => {
      this.state = 'error';
      throw error;
    });
  }

  downloadAsync(): Promise<File | null> {
    return this.start('download');
  }

  resumeAsync(): Promise<File | null> {
    return this.start('resume');
  }

  async pauseAsync(): Promise<void> {
    this.calls.push('pause');
    this.state = 'paused';
    for (const waiter of this.pauseWaiters.splice(0)) waiter();
  }

  savable(): DownloadPauseState {
    if (this.state !== 'paused') throw new Error('Only a paused task can be saved');
    return { url: this.url, fileUri: this.destination.uri, isDirectory: false, resumeData: `resume:${this.url}` };
  }

  release(): void {
    this.calls.push('release');
    this.released = true;
  }
}
