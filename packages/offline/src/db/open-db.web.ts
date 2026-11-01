import { createMemoryDb, type MemoryDbPersistence } from './memory-db';
import type { SqliteDbOptions } from './sqlite-db';
import type { DurableDb } from './types';

export type OpenDurableDbOptions = SqliteDbOptions & { persistence?: MemoryDbPersistence };

/**
 * Web/Electron seam for spike S7 (plan §8.2). Until S7 decides, the memory engine is used, made
 * durable only if a `persistence` adapter is passed. S7 outcomes:
 * - OPFS passes (COOP/COEP headers in nginx and Electron): return `createSqliteDb(options)` here —
 *   expo-sqlite web — and everything above keeps working unchanged (structured ops + raw SQL).
 * - Otherwise: implement `MemoryDbPersistence` over IndexedDB (or the Electron preload filesystem
 *   bridge) and pass it, or implement `DurableDb` over IndexedDB directly.
 * `navigator.storage.persist()` should be requested by the shell either way.
 */
export function openDurableDb(options: OpenDurableDbOptions = {}): Promise<DurableDb> {
  return createMemoryDb({ persistence: options.persistence });
}

export const DURABLE_DB_ENGINE: 'sqlite' | 'memory' = 'memory';
