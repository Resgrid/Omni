import { createTestHandler, flush, scopeA } from '../../__tests__/helpers';
import { createManualConnectivitySource } from '../../outbox/connectivity';
import { createOutbox } from '../../outbox/outbox';
import { createOutboxHandlerRegistry } from '../../outbox/registry';
import {
  type IdbDatabase,
  type IdbFactory,
  type IdbObjectStore,
  type IdbOpenRequest,
  type IdbRequest,
  type IdbTransaction,
  type IndexedDbPersistenceEnvironment,
  openIndexedDbPersistence,
  type WebLocks,
} from '../indexeddb-persistence';
import { createMemoryDb, type MemoryDbSnapshot } from '../memory-db';
import type { TableSpec } from '../types';

/** One browser profile's IndexedDB: databases outlive the pages (environments) that open them. */
class FakeIndexedDb {
  readonly databases = new Map<string, Map<string, MemoryDbSnapshot>>();
  failOpen = false;
  failWrites = false;
  /** While set, transactions wait for it before they commit. */
  gate: Promise<void> | null = null;

  /** Holds every commit until the returned function is called. */
  holdCommits(): () => void {
    let release = (): void => undefined;
    this.gate = new Promise((resolve) => {
      release = resolve;
    });

    return () => {
      this.gate = null;
      release();
    };
  }
}

class FakeRequest<T> implements IdbRequest<T> {
  error: DOMException | null = null;

  constructor(public result: T) {}
}

class FakeTransaction implements IdbTransaction {
  error: DOMException | null = null;
  oncomplete: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onabort: ((event: Event) => void) | null = null;

  constructor(
    private readonly browser: FakeIndexedDb,
    private readonly data: Map<string, MemoryDbSnapshot>
  ) {}

  objectStore(): IdbObjectStore {
    return {
      get: (key) => {
        const request = new FakeRequest<MemoryDbSnapshot | undefined>(undefined);
        this.commit(() => {
          const value = this.data.get(key);
          request.result = value === undefined ? undefined : structuredClone(value);
        });

        return request;
      },
      put: (snapshot, key) => {
        const request = new FakeRequest<IDBValidKey>(key);
        this.commit(() => {
          if (this.browser.failWrites) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
          this.data.set(key, structuredClone(snapshot));
        });

        return request;
      },
    };
  }

  private commit(apply: () => void): void {
    void (async () => {
      await Promise.resolve();
      await this.browser.gate;

      try {
        apply();
      } catch (error) {
        this.error = error instanceof DOMException ? error : null;
        this.onerror?.(new Event('error'));

        return;
      }

      this.oncomplete?.(new Event('complete'));
    })();
  }
}

function fakeFactory(browser: FakeIndexedDb): IdbFactory {
  return {
    open: (name) => {
      const existing = browser.databases.get(name);
      const data = existing ?? new Map<string, MemoryDbSnapshot>();

      const database: IdbDatabase = {
        createObjectStore: () => undefined,
        transaction: () => new FakeTransaction(browser, data),
      };

      const request: IdbOpenRequest = { result: database, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      void Promise.resolve().then(() => {
        if (browser.failOpen) {
          request.onerror?.(new Event('error'));

          return;
        }

        if (!existing) {
          browser.databases.set(name, data);
          // SAFETY: Node has no IDBVersionChangeEvent, and the adapter's upgrade handler reads only `request.result`.
          request.onupgradeneeded?.(new Event('upgradeneeded') as IDBVersionChangeEvent);
        }

        request.onsuccess?.(new Event('success'));
      });

      return request;
    },
  };
}

/** Web Locks shared by the tabs of one browser: a held lock stays held while its callback's promise is pending. */
function fakeLocks(): WebLocks {
  const held = new Set<string>();

  return {
    request: async (name, _options, callback) => {
      if (held.has(name)) {
        await callback(null);

        return;
      }

      held.add(name);
      await callback({ name });
      held.delete(name);
    },
  };
}

/** A page of the app: the browser's IndexedDB, and the Web Locks of that browser session. */
const page = (browser: FakeIndexedDb, locks: WebLocks | null = fakeLocks()): IndexedDbPersistenceEnvironment => ({ indexedDB: fakeFactory(browser), locks });

const items: TableSpec = {
  name: 'items',
  columns: [
    { name: 'id', type: 'TEXT', primaryKey: true },
    { name: 'name', type: 'TEXT', notNull: true },
  ],
};

const NAME = 'resgrid-offline.responder';

describe('openIndexedDbPersistence', () => {
  it('keeps the web database across a reload', async () => {
    const browser = new FakeIndexedDb();
    const db = await createMemoryDb({ persistence: (await openIndexedDbPersistence({ name: NAME, environment: page(browser) })) ?? undefined });
    await db.createTable(items);
    await db.insert('items', { id: 'a', name: 'Alpha' });

    const reloaded = await createMemoryDb({ persistence: (await openIndexedDbPersistence({ name: NAME, environment: page(browser) })) ?? undefined });

    expect(await reloaded.select('items')).toEqual([{ id: 'a', name: 'Alpha' }]);
  });

  it('reports a queued file upload only once IndexedDB holds it, and sends it with its bytes after a reload', async () => {
    const browser = new FakeIndexedDb();
    const bytes = 'JVBERi0xLjQK';
    const offline = createManualConnectivitySource(false);
    const registry = createOutboxHandlerRegistry();
    const handler = createTestHandler('calls.file.upload');
    registry.register(handler);

    const db = await createMemoryDb({ persistence: (await openIndexedDbPersistence({ name: NAME, environment: page(browser) })) ?? undefined });
    const outbox = createOutbox({ db, getScope: () => scopeA, registry, connectivity: offline });
    await outbox.init();

    const release = browser.holdCommits();
    let queued = false;

    const enqueue = outbox.enqueue({ type: 'calls.file.upload', payload: { callId: '42', name: 'plan.pdf', data: bytes } }).then((result) => {
      queued = true;

      return result;
    });

    await flush();
    expect(queued).toBe(false);
    release();
    expect((await enqueue).status).toBe('queued');

    const reloaded = await createMemoryDb({ persistence: (await openIndexedDbPersistence({ name: NAME, environment: page(browser) })) ?? undefined });
    const online = createOutbox({ db: reloaded, getScope: () => scopeA, registry, connectivity: createManualConnectivitySource(true) });
    await online.init();
    const result = await online.drain();

    expect(result.sent).toHaveLength(1);
    expect(handler.send).toHaveBeenCalledWith(expect.objectContaining({ payload: { callId: '42', name: 'plan.pdf', data: bytes } }), expect.anything());
  });

  it('lets one tab of the app write the database; another tab keeps its own in memory', async () => {
    const browser = new FakeIndexedDb();
    const locks = fakeLocks();

    expect(await openIndexedDbPersistence({ name: NAME, environment: page(browser, locks) })).not.toBeNull();
    expect(await openIndexedDbPersistence({ name: NAME, environment: page(browser, locks) })).toBeNull();
    expect(await openIndexedDbPersistence({ name: 'resgrid-offline.unit', environment: page(browser, locks) })).not.toBeNull();
  });

  it('stays in memory without IndexedDB or Web Locks, or when the database cannot be opened', async () => {
    const browser = new FakeIndexedDb();

    expect(await openIndexedDbPersistence({ name: NAME, environment: null })).toBeNull();
    expect(await openIndexedDbPersistence({ name: NAME, environment: page(browser, null) })).toBeNull();
    browser.failOpen = true;
    expect(await openIndexedDbPersistence({ name: NAME, environment: page(browser) })).toBeNull();
  });

  it('fails a write IndexedDB refuses and keeps the database as it was', async () => {
    const browser = new FakeIndexedDb();
    const db = await createMemoryDb({ persistence: (await openIndexedDbPersistence({ name: NAME, environment: page(browser) })) ?? undefined });
    await db.createTable(items);
    browser.failWrites = true;

    await expect(db.insert('items', { id: 'a', name: 'Alpha' })).rejects.toThrow('quota');
    expect(await db.select('items')).toEqual([]);
  });
});
