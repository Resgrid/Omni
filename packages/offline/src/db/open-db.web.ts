import { openIndexedDbPersistence } from './indexeddb-persistence';
import { createMemoryDb, type MemoryDbPersistence } from './memory-db';
import type { SqliteDbOptions } from './sqlite-db';
import type { DurableDb } from './types';

export type OpenDurableDbOptions = SqliteDbOptions & {
  persistence?: MemoryDbPersistence;
  /** Names the web database per app, since several variants can share an origin (development). */
  variantId?: string;
};

const WEB_DB_NAME = 'resgrid-offline';

/**
 * Web/Electron seam for spike S7 (plan §8.2). Until S7 decides, the memory engine is used, kept in IndexedDB
 * (`openIndexedDbPersistence`) unless another `persistence` is passed; where IndexedDB cannot be used it lives for the
 * page session only. S7 outcomes:
 * - OPFS passes (COOP/COEP headers in nginx and Electron): return `createSqliteDb(options)` here —
 *   expo-sqlite web — and everything above keeps working unchanged (structured ops + raw SQL); the IndexedDB snapshot's
 *   unsent outbox events are carried over once.
 * - Otherwise: keep the IndexedDB snapshot, or implement `DurableDb` over IndexedDB directly.
 * `navigator.storage.persist()` should be requested by the shell either way.
 */
export async function openDurableDb(options: OpenDurableDbOptions = {}): Promise<DurableDb> {
  const name = options.name ?? (options.variantId ? `${WEB_DB_NAME}.${options.variantId}` : WEB_DB_NAME);
  const persistence = options.persistence ?? (await openIndexedDbPersistence({ name })) ?? undefined;

  return createMemoryDb({ persistence });
}

export const DURABLE_DB_ENGINE: 'sqlite' | 'memory' = 'memory';
