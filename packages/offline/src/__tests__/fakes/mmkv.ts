// In-memory react-native-mmkv fake. Instances with the same id share one "file" for the life of the
// test (so reopening simulates an app restart), and the file remembers the key it is encrypted with:
// opening it with another key loses the data (MMKV discards on CRC failure) unless opened read-only.
interface FakeFile {
  key: string | undefined;
  data: Map<string, string | number | boolean>;
}

export interface FakeMmkvConfig {
  id?: string;
  encryptionKey?: string;
  readOnly?: boolean;
}

const files = new Map<string, FakeFile>();
export const mmkvConstructed: FakeMmkvConfig[] = [];

export function __resetMmkvFake(): void {
  files.clear();
  mmkvConstructed.length = 0;
}

/** Seed a file as a legacy build would have left it. */
export function __seedMmkvFile(id: string, key: string | undefined, values: Record<string, string | number | boolean>): void {
  files.set(id, { key, data: new Map(Object.entries(values)) });
}

export function __getMmkvFile(id: string): FakeFile | undefined {
  return files.get(id);
}

export class MMKV {
  private readonly data: Map<string, string | number | boolean>;
  private readonly file: FakeFile | null;
  private readonly readOnly: boolean;

  constructor(config: FakeMmkvConfig = {}) {
    const id = config.id ?? 'mmkv.default';
    mmkvConstructed.push({ id, encryptionKey: config.encryptionKey, readOnly: config.readOnly });
    this.readOnly = Boolean(config.readOnly);
    let file = files.get(id);
    if (!file) {
      file = { key: config.encryptionKey, data: new Map() };
      files.set(id, file);
    }
    if (file.key !== config.encryptionKey) {
      if (this.readOnly) {
        // Wrong key, read-only: nothing decrypts, nothing is destroyed.
        this.file = null;
        this.data = new Map();
        return;
      }
      file.data.clear();
      file.key = config.encryptionKey;
    }
    this.file = file;
    this.data = file.data;
  }

  private assertWritable(): void {
    if (this.readOnly) throw new Error('MMKV instance is read-only');
  }

  set(key: string, value: string | number | boolean): void {
    this.assertWritable();
    this.data.set(key, value);
  }
  getString(key: string): string | undefined {
    const value = this.data.get(key);
    return typeof value === 'string' ? value : undefined;
  }
  getNumber(key: string): number | undefined {
    const value = this.data.get(key);
    return typeof value === 'number' ? value : undefined;
  }
  getBoolean(key: string): boolean | undefined {
    const value = this.data.get(key);
    return typeof value === 'boolean' ? value : undefined;
  }
  delete(key: string): void {
    this.assertWritable();
    this.data.delete(key);
  }
  contains(key: string): boolean {
    return this.data.has(key);
  }
  getAllKeys(): string[] {
    return Array.from(this.data.keys());
  }
  clearAll(): void {
    this.assertWritable();
    this.data.clear();
  }
  recrypt(key: string | undefined): void {
    this.assertWritable();
    if (this.file) this.file.key = key;
  }
  trim(): void {
    // nothing to trim in memory
  }
}
