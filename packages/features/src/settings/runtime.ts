import type { ClearAllLocalDataResult, ClearCachedDataResult, DrainResult, OutboxSnapshot, ReconnectResult, StorageDiagnostics, StorageReport } from '@resgrid/offline';

/**
 * What Settings → Advanced → Storage & sync calls (plan §8.2a). Structural, so the app shell passes the pieces of
 * `initOffline()`'s runtime directly: `configureSettings({ storageSync: { storage: runtime.storageManager,
 * outbox: runtime.outbox, sync: runtime.sync } })`.
 */
export interface StorageSyncServices {
  storage: {
    getStorageReport(): Promise<StorageReport>;
    getDiagnosticsSummary(): Promise<StorageDiagnostics>;
    clearCachedData(): Promise<ClearCachedDataResult>;
    clearAllLocalData(options?: { confirmed?: boolean }): Promise<ClearAllLocalDataResult>;
  };
  outbox?: {
    retry(id: string): Promise<boolean>;
    retryAll(): Promise<number>;
    discard(id: string, options: { confirmed: boolean }): Promise<boolean>;
    confirmOnlineAuth(id: string): Promise<boolean>;
    drain(): Promise<DrainResult>;
    getSnapshot(): OutboxSnapshot;
    subscribe(listener: (snapshot: OutboxSnapshot) => void): () => void;
  } | null;
  sync?: { onReconnect(): Promise<ReconnectResult> } | null;
}

/** Unit's active unit (the device reports status and location for it). The shell binds the store that owns it. */
export interface ActiveUnitAdapter {
  /** A React hook returning the active unit id, or null. */
  useActiveUnitId: () => string | null;
  setActiveUnit: (unitId: string) => Promise<void>;
}

export interface SettingsRuntime {
  storageSync?: StorageSyncServices | null;
  activeUnit?: ActiveUnitAdapter | null;
}

let runtime: SettingsRuntime = {};

/** App-shell composition for the Settings feature (after `initOffline()` and `configureData()`). Merges with what was set before. */
export function configureSettings(next: SettingsRuntime): void {
  runtime = { ...runtime, ...next };
}

export const getStorageSyncServices = (): StorageSyncServices | null => runtime.storageSync ?? null;

export const getActiveUnitAdapter = (): ActiveUnitAdapter | null => runtime.activeUnit ?? null;

/** Test helper. */
export function resetSettingsRuntimeForTests(): void {
  runtime = {};
}
