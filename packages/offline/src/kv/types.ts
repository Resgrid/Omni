/**
 * The slice of the react-native-mmkv instance surface the offline layer uses. Native wraps MMKV,
 * web wraps localStorage (never origin-wide), tests use the in-memory backend.
 */
export interface KvBackend {
  readonly id: string;
  getString(key: string): string | undefined;
  getNumber(key: string): number | undefined;
  getBoolean(key: string): boolean | undefined;
  set(key: string, value: string | number | boolean): void;
  delete(key: string): void;
  contains(key: string): boolean;
  getAllKeys(): string[];
  /**
   * Clears this instance only. Absent where the platform cannot scope it (raw web layout), in which
   * case `DurableKv.clear()` deletes the keys it owns one by one.
   */
  clearAll?(): void;
  /** Re-encrypts the instance in place (native MMKV only). */
  recrypt?(key: string | undefined): void;
  trim?(): void;
}

export interface KvBackendConfig {
  id: string;
  encryptionKey?: string;
  /** Open without the ability to write — used to verify a candidate key without risking the data. */
  readOnly?: boolean;
}

export type KvBackendFactory = (config: KvBackendConfig) => KvBackend;

export type KvPlatform = 'native' | 'web';
