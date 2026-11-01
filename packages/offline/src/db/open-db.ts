import type { MemoryDbPersistence } from './memory-db';
import { createSqliteDb, type SqliteDbOptions } from './sqlite-db';
import type { DurableDb } from './types';

/** Same shape on every platform; `persistence` only applies to the web memory engine. */
export type OpenDurableDbOptions = SqliteDbOptions & { persistence?: MemoryDbPersistence };

/** Native (iOS/Android): expo-sqlite. Metro resolves `open-db.web.ts` on web/Electron (spike S7 seam). */
export function openDurableDb(options: OpenDurableDbOptions = {}): Promise<DurableDb> {
  return createSqliteDb(options);
}

export const DURABLE_DB_ENGINE: 'sqlite' | 'memory' = 'sqlite';
