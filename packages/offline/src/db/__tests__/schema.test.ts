import { __resetSqliteFake } from '../../__tests__/fakes/expo-sqlite';
import { engines } from '../../__tests__/helpers';
import { applySchema, getSchemaVersion } from '../schema';
import type { DurableDb, SchemaModule, TableSpec } from '../types';

const outboxV1: TableSpec = {
  name: 'q',
  columns: [
    { name: 'id', type: 'TEXT', primaryKey: true },
    { name: 'body', type: 'TEXT', notNull: true },
  ],
};
const outboxV2: TableSpec = { name: 'q', columns: [...outboxV1.columns, { name: 'priority', type: 'INTEGER', notNull: true, default: 0 }] };

const cacheV1: TableSpec = {
  name: 'cache_calls',
  columns: [
    { name: 'id', type: 'TEXT', primaryKey: true },
    { name: 'json', type: 'TEXT' },
  ],
};
const cacheV2: TableSpec = { name: 'cache_calls', columns: [...cacheV1.columns, { name: 'closedAt', type: 'INTEGER' }] };

afterEach(() => __resetSqliteFake());

describe.each(engines())('applySchema (%s)', (_name, open) => {
  let db: DurableDb;
  beforeEach(async () => {
    db = await open();
  });

  it('creates a module at its current version on a fresh database', async () => {
    const results = await applySchema(db, [{ module: 'cache', version: 2, tables: [cacheV2] }]);
    expect(results).toEqual([{ module: 'cache', status: 'created', fromVersion: null, toVersion: 2 }]);
    expect(await db.tableColumns('cache_calls')).toEqual(['id', 'json', 'closedAt']);
    expect(await getSchemaVersion(db, 'cache')).toBe(2);
  });

  it('reports current when nothing changed', async () => {
    await applySchema(db, [{ module: 'cache', version: 1, tables: [cacheV1] }]);
    const results = await applySchema(db, [{ module: 'cache', version: 1, tables: [cacheV1] }]);
    expect(results[0].status).toBe('current');
  });

  it('runs forward-only migrations in order, each recorded', async () => {
    await applySchema(db, [{ module: 'cache', version: 1, tables: [cacheV1] }]);
    await db.insert('cache_calls', { id: '1', json: '{}' });
    const steps: number[] = [];
    const module: SchemaModule = {
      module: 'cache',
      version: 3,
      tables: [cacheV2],
      migrations: [
        {
          toVersion: 3,
          name: 'backfill',
          up: async (tx) => {
            steps.push(3);
            await tx.update('cache_calls', {}, { closedAt: 5 });
          },
        },
        {
          toVersion: 2,
          name: 'add closedAt',
          up: async (tx) => {
            steps.push(2);
            await tx.addColumn('cache_calls', { name: 'closedAt', type: 'INTEGER' });
          },
        },
      ],
    };
    const results = await applySchema(db, [module]);
    expect(steps).toEqual([2, 3]);
    expect(results[0]).toEqual({ module: 'cache', status: 'migrated', fromVersion: 1, toVersion: 3 });
    expect((await db.select('cache_calls'))[0]).toEqual({ id: '1', json: '{}', closedAt: 5 });
  });

  it('applies additive changes without an explicit migration', async () => {
    await applySchema(db, [{ module: 'cache', version: 1, tables: [cacheV1] }]);
    await applySchema(db, [{ module: 'cache', version: 2, tables: [cacheV2] }]);
    expect(await db.tableColumns('cache_calls')).toContain('closedAt');
  });

  it('rebuilds a cache module whose migration fails, and tells the owner to re-hydrate', async () => {
    await applySchema(db, [{ module: 'cache', version: 1, tables: [cacheV1] }]);
    await db.insert('cache_calls', { id: '1', json: '{}' });
    const onRebuilt = jest.fn();
    const results = await applySchema(
      db,
      [
        {
          module: 'cache',
          version: 2,
          tables: [cacheV2],
          migrations: [
            {
              toVersion: 2,
              name: 'broken',
              up: async () => {
                throw new Error('bad migration');
              },
            },
          ],
        },
      ],
      { onRebuilt }
    );
    expect(results[0]).toMatchObject({ status: 'rebuilt', fromVersion: 1, toVersion: 2, failedMigration: 'broken' });
    expect(onRebuilt).toHaveBeenCalledWith(results[0]);
    expect(await db.count('cache_calls')).toBe(0);
    expect(await db.tableColumns('cache_calls')).toEqual(['id', 'json', 'closedAt']);
    expect(await getSchemaVersion(db, 'cache')).toBe(2);
  });

  it('preserves queued rows when the outbox migration fails, migrating it before caches', async () => {
    await applySchema(db, [
      { module: 'cache', version: 1, tables: [cacheV1] },
      { module: 'queue', version: 1, tables: [outboxV1], preserveRowsOnFailure: true },
    ]);
    await db.insert('q', { id: 'e1', body: 'status' });
    await db.insert('q', { id: 'e2', body: 'note' });
    await db.insert('cache_calls', { id: 'c1', json: '{}' });

    const results = await applySchema(db, [
      {
        module: 'cache',
        version: 2,
        tables: [cacheV2],
        migrations: [
          {
            toVersion: 2,
            name: 'cache broken',
            up: async () => {
              throw new Error('x');
            },
          },
        ],
      },
      {
        module: 'queue',
        version: 2,
        tables: [outboxV2],
        preserveRowsOnFailure: true,
        migrations: [
          {
            toVersion: 2,
            name: 'queue broken',
            up: async (tx) => {
              await tx.delete('q');
              throw new Error('half-done migration');
            },
          },
        ],
      },
    ]);

    expect(results.map((result) => result.module)).toEqual(['queue', 'cache']);
    expect(results[0]).toMatchObject({ status: 'rebuilt-preserved', preservedRows: 2, lostRows: 0 });
    expect(results[1]).toMatchObject({ status: 'rebuilt' });
    const rows = await db.select('q', { orderBy: [{ column: 'id' }] });
    expect(rows).toEqual([
      { id: 'e1', body: 'status', priority: 0 },
      { id: 'e2', body: 'note', priority: 0 },
    ]);
    expect(await db.count('cache_calls')).toBe(0);
  });

  it('leaves a database written by a newer build alone', async () => {
    await applySchema(db, [{ module: 'cache', version: 5, tables: [cacheV2] }]);
    await db.insert('cache_calls', { id: '1', json: '{}', closedAt: 1 });
    const results = await applySchema(db, [{ module: 'cache', version: 2, tables: [cacheV2] }]);
    expect(results[0].status).toBe('newer-than-app');
    expect(await getSchemaVersion(db, 'cache')).toBe(5);
    expect(await db.count('cache_calls')).toBe(1);
  });

  it('rejects a migration beyond the declared version', async () => {
    await expect(applySchema(db, [{ module: 'm', version: 1, tables: [cacheV1], migrations: [{ toVersion: 2, name: 'x', up: async () => undefined }] }])).rejects.toThrow();
  });
});
