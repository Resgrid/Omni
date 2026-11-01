import { cancelInventoryCount, completeInventoryCount, getInventoryCount, getInventoryCounts, saveInventoryCount } from '@resgrid/api';
import { type InventoryCount, type InventoryCountDetail, InventoryCountStatus } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, ok, persisted } from '../../__tests__/helpers';
import { INVENTORY_RECENT_COUNTS_MAX, settleObserved, useInventoryStore } from '../inventory-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getInventoryCounts: jest.fn(),
  getInventoryCount: jest.fn(),
  saveInventoryCount: jest.fn(),
  completeInventoryCount: jest.fn(),
  cancelInventoryCount: jest.fn(),
}));

const count = (Id: string, SnapshotOn: string | null, Status: number = InventoryCountStatus.Draft): InventoryCount => ({ Id, Revision: 1, Status, SnapshotOn, LocationId: 'loc', Content: null });

const detail = (countId: string, counted: Record<string, number | null>, Status: number = InventoryCountStatus.Draft): InventoryCountDetail => ({
  Count: { ...count(countId, '2026-11-01T10:00:00Z', Status), Revision: 2 },
  Lines: Object.entries(counted).map(([Id, CountedQuantity]) => ({ Id, Revision: 1, CountId: countId, ItemId: `item-${Id}`, LocationId: 'loc', ExpectedQuantity: 3, CountedQuantity })),
});

let runtime: DataTestRuntime;

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'unit' });
  await defaultResetRegistry.getStoreResets().get('data.inventory')?.('logout');
});

describe('inventory store: recent counts', () => {
  it('reads every unit location, de-duplicates and sorts newest snapshot first', async () => {
    jest
      .mocked(getInventoryCounts)
      .mockImplementation((async (_ctx: unknown, params: { locationId?: string }) =>
        ok({ Items: params.locationId === 'root' ? [count('a', '2026-10-01T00:00:00Z'), count('b', '2026-11-01T00:00:00Z')] : [count('b', '2026-11-01T00:00:00Z'), count('c', null)], HasMore: false })) as never);
    await useInventoryStore.getState().fetchCounts(12, ['root', 'cab', 'root', '']);
    expect(getInventoryCounts).toHaveBeenCalledTimes(2);
    expect(useInventoryStore.getState().countsByUnit['12'].map((row) => row.Id)).toEqual(['b', 'a', 'c']);
  });

  it('keeps at most the newest INVENTORY_RECENT_COUNTS_MAX counts', async () => {
    const many = Array.from({ length: INVENTORY_RECENT_COUNTS_MAX + 5 }, (_, index) => count(`k${index}`, `2026-10-${String((index % 28) + 1).padStart(2, '0')}T00:00:${String(index % 60).padStart(2, '0')}Z`));
    jest.mocked(getInventoryCounts).mockResolvedValue(ok({ Items: many, HasMore: false }) as never);
    await useInventoryStore.getState().fetchCounts('12', ['root']);
    expect(useInventoryStore.getState().countsByUnit['12']).toHaveLength(INVENTORY_RECENT_COUNTS_MAX);
  });
});

describe('inventory store: entered values (offline draft)', () => {
  it('holds entered values per count, persists them and clears single lines or the whole count', () => {
    const store = useInventoryStore.getState();
    store.setObserved('ct-1', 'l1', 2);
    store.setObserved('ct-1', 'l2', 0);
    expect(useInventoryStore.getState().observedByCount['ct-1']).toEqual({ l1: 2, l2: 0 });
    expect(persisted(runtime.kv, 'omni-inventory-storage')?.state.observedByCount).toEqual({ 'ct-1': { l1: 2, l2: 0 } });
    store.clearObserved('ct-1', ['l1']);
    expect(useInventoryStore.getState().observedByCount['ct-1']).toEqual({ l2: 0 });
    store.clearObserved('ct-1', ['l2']);
    expect(useInventoryStore.getState().observedByCount['ct-1']).toBeUndefined();
  });

  it('drops entered values once an accepted save holds them; newer edits stay pending', async () => {
    useInventoryStore.getState().setObserved('ct-1', 'l1', 2);
    useInventoryStore.getState().setObserved('ct-1', 'l2', 1);
    jest.mocked(saveInventoryCount).mockResolvedValue({ Data: detail('ct-1', { l1: 2, l2: 0 }) } as never);
    const result = await useInventoryStore.getState().saveCount('ct-1', { CountId: 'ct-1', Revision: 1, Lines: [{ Id: 'l1', Quantity: 2 }] });
    expect(result.outcome).toBe('sent');
    expect(useInventoryStore.getState().observedByCount['ct-1']).toEqual({ l2: 1 });
    expect(useInventoryStore.getState().countsById['ct-1'].Count.Revision).toBe(2);
  });

  it('settleObserved keeps other counts untouched', () => {
    const observed = { a: { l1: 1 }, b: { l9: 4 } };
    expect(settleObserved(observed, 'a', detail('a', { l1: 1 }))).toEqual({ b: { l9: 4 } });
    expect(settleObserved(observed, 'missing', detail('missing', {}))).toBe(observed);
  });

  it('forgets entered values when a reread count has left Draft', async () => {
    useInventoryStore.getState().setObserved('ct-1', 'l1', 2);
    jest.mocked(getInventoryCount).mockResolvedValue(ok(detail('ct-1', { l1: 3 }, InventoryCountStatus.Completed)) as never);
    await useInventoryStore.getState().fetchCount('ct-1', { bypassCache: true });
    expect(useInventoryStore.getState().observedByCount['ct-1']).toBeUndefined();
  });
});

describe('inventory store: completion and cancel', () => {
  it('reuses one completion id across retries and clears it with the draft on success', async () => {
    const first = useInventoryStore.getState().completionIdFor('ct-1');
    expect(useInventoryStore.getState().completionIdFor('ct-1')).toBe(first);
    useInventoryStore.getState().setObserved('ct-1', 'l1', 2);
    jest.mocked(completeInventoryCount).mockResolvedValue(ok({ AwaitingWitness: false }) as never);
    const result = await useInventoryStore.getState().completeCount({ CountId: 'ct-1', Revision: 2, RequestId: first });
    expect(result).toEqual({ AwaitingWitness: false });
    expect(useInventoryStore.getState().completionIdByCount['ct-1']).toBeUndefined();
    expect(useInventoryStore.getState().observedByCount['ct-1']).toBeUndefined();
  });

  it('keeps the completion id and the draft when completion fails', async () => {
    const id = useInventoryStore.getState().completionIdFor('ct-1');
    useInventoryStore.getState().setObserved('ct-1', 'l1', 2);
    jest.mocked(completeInventoryCount).mockRejectedValue(new Error('offline'));
    expect(await useInventoryStore.getState().completeCount({ CountId: 'ct-1', Revision: 2, RequestId: id })).toBeNull();
    expect(useInventoryStore.getState().completionIdFor('ct-1')).toBe(id);
    expect(useInventoryStore.getState().observedByCount['ct-1']).toEqual({ l1: 2 });
    expect(useInventoryStore.getState().actionError).not.toBeNull();
  });

  it('marks a cancelled count cancelled everywhere and drops its draft', async () => {
    useInventoryStore.setState({ countsById: { 'ct-1': detail('ct-1', {}) }, countsByUnit: { '12': [count('ct-1', null), count('ct-2', null)] } });
    useInventoryStore.getState().setObserved('ct-1', 'l1', 2);
    jest.mocked(cancelInventoryCount).mockResolvedValue(ok(null) as never);
    expect(await useInventoryStore.getState().cancelCount({ CountId: 'ct-1', Revision: 2 })).toBe(true);
    const state = useInventoryStore.getState();
    expect(state.countsById['ct-1'].Count.Status).toBe(InventoryCountStatus.Cancelled);
    expect(state.countsByUnit['12'].map((row) => row.Status)).toEqual([InventoryCountStatus.Cancelled, InventoryCountStatus.Draft]);
    expect(state.observedByCount['ct-1']).toBeUndefined();
  });

  it('wipes drafts and counts on logout', async () => {
    useInventoryStore.getState().setObserved('ct-1', 'l1', 2);
    useInventoryStore.setState({ countsByUnit: { '12': [count('ct-1', null)] } });
    await defaultResetRegistry.getStoreResets().get('data.inventory')?.('logout');
    expect(useInventoryStore.getState().observedByCount).toEqual({});
    expect(useInventoryStore.getState().countsByUnit).toEqual({});
  });
});
