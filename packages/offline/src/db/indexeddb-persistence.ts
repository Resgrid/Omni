import type { MemoryDbPersistence, MemoryDbSnapshot } from './memory-db';

// The slice of IndexedDB and Web Locks this adapter uses. The browser's objects satisfy it; tests pass fakes.

export interface IdbRequest<T> {
  readonly result: T;
  readonly error: DOMException | null;
}

export interface IdbObjectStore {
  get(key: string): IdbRequest<unknown>;
  put(snapshot: MemoryDbSnapshot, key: string): IdbRequest<IDBValidKey>;
}

export interface IdbTransaction {
  readonly error: DOMException | null;
  objectStore(name: string): IdbObjectStore;
  oncomplete: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onabort: ((event: Event) => void) | null;
}

export interface IdbDatabase {
  createObjectStore(name: string): void;
  transaction(storeName: string, mode: IDBTransactionMode, options?: IDBTransactionOptions): IdbTransaction;
}

export interface IdbOpenRequest extends IdbRequest<IdbDatabase> {
  onupgradeneeded: ((event: IDBVersionChangeEvent) => void) | null;
  onsuccess: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
}

export interface IdbFactory {
  open(name: string, version: number): IdbOpenRequest;
}

export interface WebLocks {
  request(name: string, options: { ifAvailable: boolean }, callback: (lock: { name: string } | null) => Promise<void> | undefined): Promise<void>;
}

/** What the web database needs to outlive a reload. */
export interface IndexedDbPersistenceEnvironment {
  indexedDB: IdbFactory;
  /** Without Web Locks a tab cannot tell whether another tab of the app writes the same database. */
  locks: WebLocks | null;
}

export interface IndexedDbPersistenceOptions {
  /** The IndexedDB database, and the Web Lock that makes one tab its only writer. */
  name: string;
  /** Defaults to the browser's; null keeps the database in memory. */
  environment?: IndexedDbPersistenceEnvironment | null;
}

const STORE = 'snapshot';
const SNAPSHOT_KEY = 'db';

/** IndexedDB and Web Locks of this page, or null where there is no IndexedDB (Node, some private modes). */
export function browserIndexedDbEnvironment(): IndexedDbPersistenceEnvironment | null {
  if (typeof indexedDB === 'undefined') return null;
  const locks = typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : null;

  return { indexedDB, locks };
}

/** Takes the lock for the rest of the page's life when no other tab holds it; resolves to whether it did. */
function claimSoleWriter(locks: WebLocks, name: string): Promise<boolean> {
  return new Promise((resolve) => {
    locks
      .request(name, { ifAvailable: true }, (lock) => {
        resolve(lock !== null);

        // A callback promise that never settles holds the lock until the page closes.
        return lock ? new Promise<void>(() => undefined) : undefined;
      })
      .catch(() => resolve(false));
  });
}

function openDatabase(factory: IdbFactory, name: string): Promise<IdbDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`IndexedDB ${name} could not be opened.`));
  });
}

/** Runs one request and resolves once its transaction has committed (flushed to disk for writes). */
function runRequest<T>(database: IdbDatabase, mode: IDBTransactionMode, work: (store: IdbObjectStore) => IdbRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
    const request = work(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error('IndexedDB request failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

/**
 * Keeps the web/Electron memory database in IndexedDB until spike S7 picks the engine (plan §8.2): the snapshot is read
 * once at open and written after every committed write, and a write resolves only after IndexedDB has committed it, so
 * an outbox event (with any file bytes in its payload) survives a reload once the app reports it queued.
 *
 * Only one tab of an app writes the database (Web Lock `name`): two tabs saving whole snapshots would drop each other's
 * events or send the same one twice. Resolves to null — the database then lives for this page only, as before — when
 * IndexedDB or Web Locks are missing, another tab holds the database, or it cannot be opened or read.
 */
export async function openIndexedDbPersistence({ name, environment = browserIndexedDbEnvironment() }: IndexedDbPersistenceOptions): Promise<MemoryDbPersistence | null> {
  if (!environment?.locks) return null;

  if (!(await claimSoleWriter(environment.locks, name))) return null;

  let database: IdbDatabase;
  let stored: MemoryDbSnapshot | null;

  try {
    database = await openDatabase(environment.indexedDB, name);
    const value = await runRequest(database, 'readonly', (store) => store.get(SNAPSHOT_KEY));
    // SAFETY: this store is created here and holds nothing but what `save` puts under SNAPSHOT_KEY, a MemoryDbSnapshot.
    stored = value === undefined ? null : (value as MemoryDbSnapshot);
  } catch {
    return null;
  }

  return {
    load: async () => {
      const snapshot = stored;
      stored = null;

      return snapshot;
    },
    save: async (snapshot) => {
      await runRequest(database, 'readwrite', (store) => store.put(snapshot, SNAPSHOT_KEY));
    },
  };
}
