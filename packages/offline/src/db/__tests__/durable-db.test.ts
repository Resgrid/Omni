import { __resetSqliteFake, isNodeSqliteAvailable, sqliteLog } from '../../__tests__/fakes/expo-sqlite';
import { engines } from '../../__tests__/helpers';
import { createMemoryDb, type MemoryDbSnapshot } from '../memory-db';
import { createSqliteDb } from '../sqlite-db';
import { type DurableDb, SqlNotSupportedError, type TableSpec } from '../types';

const items: TableSpec = {
  name: 'items',
  columns: [
    { name: 'id', type: 'TEXT', primaryKey: true },
    { name: 'name', type: 'TEXT', notNull: true },
    { name: 'rank', type: 'INTEGER' },
    { name: 'kind', type: 'TEXT', default: 'plain' },
  ],
  indexes: [{ name: 'items_rank', columns: ['rank'] }],
};

afterEach(() => __resetSqliteFake());

describe.each(engines())('DurableDb contract (%s)', (_name, open) => {
  let db: DurableDb;

  beforeEach(async () => {
    db = await open();
    await db.createTable(items);
    await db.insert('items', { id: 'a', name: 'Alpha', rank: 3 });
    await db.insert('items', { id: 'b', name: 'Bravo', rank: 1 });
    await db.insert('items', { id: 'c', name: 'Charlie', rank: null });
  });

  it('fills column defaults and lists tables and columns', async () => {
    expect((await db.select('items', { where: { id: 'a' } }))[0]).toEqual({ id: 'a', name: 'Alpha', rank: 3, kind: 'plain' });
    expect(await db.listTables()).toContain('items');
    expect(await db.tableColumns('items')).toEqual(['id', 'name', 'rank', 'kind']);
  });

  it('filters with every condition operator', async () => {
    const ids = async (where: Parameters<DurableDb['select']>[1]) => (await db.select('items', { ...where, orderBy: [{ column: 'id' }] })).map((row) => row.id);
    expect(await ids({ where: { rank: null } })).toEqual(['c']);
    expect(await ids({ where: { rank: { isNull: false } } })).toEqual(['a', 'b']);
    expect(await ids({ where: { rank: { gt: 1 } } })).toEqual(['a']);
    expect(await ids({ where: { rank: { gte: 1, lt: 3 } } })).toEqual(['b']);
    expect(await ids({ where: { rank: { lte: 3 } } })).toEqual(['a', 'b']);
    expect(await ids({ where: { id: { in: ['a', 'c'] } } })).toEqual(['a', 'c']);
    expect(await ids({ where: { id: { in: [] } } })).toEqual([]);
    expect(await ids({ where: { rank: { notIn: [1] } } })).toEqual(['a', 'c']);
    expect(await ids({ where: { id: { ne: 'a' } } })).toEqual(['b', 'c']);
    expect(await ids({ where: { rank: { ne: 1 } } })).toEqual(['a', 'c']);
    expect(await ids({ where: { name: { eq: 'Bravo' } } })).toEqual(['b']);
  });

  it('orders (NULL first), limits, offsets and projects', async () => {
    const rows = await db.select('items', { orderBy: [{ column: 'rank' }], columns: ['id'] });
    expect(rows).toEqual([{ id: 'c' }, { id: 'b' }, { id: 'a' }]);
    const page = await db.select('items', { orderBy: [{ column: 'rank', direction: 'desc' }], limit: 1, offset: 1 });
    expect(page.map((row) => row.id)).toEqual(['b']);
  });

  it('updates, counts and deletes', async () => {
    expect(await db.update('items', { rank: { isNull: true } }, { rank: 9 })).toBe(1);
    expect(await db.count('items', { rank: { gt: 2 } })).toBe(2);
    expect(await db.delete('items', { id: 'a' })).toBe(1);
    expect(await db.count('items')).toBe(2);
    expect(await db.delete('items')).toBe(2);
  });

  it('applies conflict policies', async () => {
    await expect(db.insert('items', { id: 'a', name: 'dup' })).rejects.toThrow();
    expect(await db.insert('items', { id: 'a', name: 'ignored' }, { onConflict: 'ignore' })).toBe(0);
    await db.insert('items', { id: 'a', name: 'Replaced' }, { onConflict: 'replace' });
    expect((await db.select('items', { where: { id: 'a' } }))[0].name).toBe('Replaced');
  });

  it('enforces NOT NULL', async () => {
    await expect(db.insert('items', { id: 'z', name: null })).rejects.toThrow();
  });

  it('rolls a failed transaction back completely', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert('items', { id: 'd', name: 'Delta' });
        await tx.delete('items', { id: 'b' });
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect((await db.select('items', { orderBy: [{ column: 'id' }] })).map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('commits a successful transaction', async () => {
    const result = await db.transaction(async (tx) => {
      await tx.insert('items', { id: 'd', name: 'Delta' });
      return tx.count('items');
    });
    expect(result).toBe(4);
    expect(await db.count('items')).toBe(4);
  });

  it('adds columns to existing rows and drops tables', async () => {
    await db.addColumn('items', { name: 'extra', type: 'TEXT', default: 'x' });
    expect((await db.select('items', { where: { id: 'a' } }))[0].extra).toBe('x');
    await db.dropTable('items');
    expect(await db.listTables()).not.toContain('items');
  });

  it('rejects unsafe identifiers', async () => {
    await expect(db.select('items; DROP TABLE items', {})).rejects.toThrow();
    await expect(db.createTable({ name: 'bad name', columns: [{ name: 'id', type: 'TEXT' }] })).rejects.toThrow();
  });

  it('reports sizes and runs maintenance pragmas without error', async () => {
    const size = await db.getSize();
    expect(size.usedBytes).toBeGreaterThan(0);
    expect(size.totalBytes).toBeGreaterThanOrEqual(size.usedBytes);
    expect(await db.estimateTableBytes('items')).toBeGreaterThan(0);
    await expect(db.incrementalVacuum()).resolves.toBeUndefined();
    await expect(db.optimize()).resolves.toBeUndefined();
    await expect(db.checkpoint()).resolves.toBeUndefined();
  });
});

describe('memory engine', () => {
  it('refuses raw SQL (structured operations only)', async () => {
    const [, open] = engines()[0];
    const db = await open();
    expect(db.supportsSql).toBe(false);
    await expect(db.execute('SELECT 1')).rejects.toBeInstanceOf(SqlNotSupportedError);
    await expect(db.query('SELECT 1')).rejects.toBeInstanceOf(SqlNotSupportedError);
  });

  it('saves after every committed write when given a persistence adapter, and reloads', async () => {
    let saved: MemoryDbSnapshot | null = null;
    const persistence = {
      load: jest.fn(async () => saved),
      save: jest.fn(async (snapshot: MemoryDbSnapshot) => {
        saved = snapshot;
      }),
    };
    const db = await createMemoryDb({ persistence });
    await db.createTable(items);
    await db.insert('items', { id: 'a', name: 'Alpha' });
    await expect(db.insert('items', { id: 'a', name: 'dup' })).rejects.toThrow();
    const reopened = await createMemoryDb({ persistence });
    expect(await reopened.count('items')).toBe(1);
  });
});

(isNodeSqliteAvailable ? describe : describe.skip)('expo-sqlite engine', () => {
  it('sets auto_vacuum=INCREMENTAL on a new file before any table, then WAL', async () => {
    const db = await createSqliteDb({ name: 'pragma-test.db' });
    const autoVacuumIndex = sqliteLog.indexOf('PRAGMA auto_vacuum = INCREMENTAL');
    const walIndex = sqliteLog.indexOf('PRAGMA journal_mode = WAL');
    expect(autoVacuumIndex).toBeGreaterThanOrEqual(0);
    expect(walIndex).toBeGreaterThan(autoVacuumIndex);
    expect(sqliteLog).toContain('PRAGMA synchronous = NORMAL');
    expect(await db.query('PRAGMA auto_vacuum')).toEqual([{ auto_vacuum: 2 }]);
    expect(db.supportsSql).toBe(true);
  });

  it('does not touch auto_vacuum on an existing database', async () => {
    const db = await createSqliteDb({ name: 'existing.db' });
    await db.createTable(items);
    sqliteLog.length = 0;
    await createSqliteDb({ name: 'existing.db' });
    expect(sqliteLog).not.toContain('PRAGMA auto_vacuum = INCREMENTAL');
  });

  it('runs incremental_vacuum, optimize and a WAL checkpoint', async () => {
    const db = await createSqliteDb({ name: 'maint.db' });
    sqliteLog.length = 0;
    await db.incrementalVacuum();
    await db.optimize();
    await db.checkpoint();
    expect(sqliteLog).toEqual(['PRAGMA incremental_vacuum', 'PRAGMA optimize', 'PRAGMA wal_checkpoint(TRUNCATE)']);
  });

  it('serializes concurrent statements around a transaction', async () => {
    const db = await createSqliteDb({ name: 'serial.db' });
    await db.createTable(items);
    const order: string[] = [];
    const tx = db.transaction(async (ops) => {
      await ops.insert('items', { id: 't1', name: 'in tx' });
      order.push('tx');
    });
    const outside = db.insert('items', { id: 'o1', name: 'outside' }).then(() => order.push('outside'));
    await Promise.all([tx, outside]);
    expect(order).toEqual(['tx', 'outside']);
  });
});
