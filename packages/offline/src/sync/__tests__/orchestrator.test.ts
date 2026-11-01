import { createClock, flush } from '../../__tests__/helpers';
import { DurableKv } from '../../kv/durable-kv';
import { createMemoryKvBackend } from '../../kv/memory-backend';
import { createSyncOrchestrator, type HydrationState, LAST_HYDRATION_AT_KEY, LAST_SYNC_AT_KEY } from '../orchestrator';

describe('SyncOrchestrator — hydration', () => {
  it('reports progress per step and becomes field ready when required steps are current', async () => {
    const clock = createClock();
    const kv = new DurableKv(createMemoryKvBackend('main'));
    const sync = createSyncOrchestrator({ kv, now: clock.now });
    let referenceCurrent = false;
    sync.registerHydrationStep({
      id: 'reference',
      required: true,
      isCurrent: () => referenceCurrent,
      run: async (context) => {
        context.reportProgress(0.5);
        context.reportProgress(1);
        referenceCurrent = true;
      },
    });
    sync.registerHydrationStep({ id: 'weather', required: false, isCurrent: () => false, run: async () => Promise.reject(new Error('offline')) });
    const states: HydrationState[] = [];
    sync.subscribe((state) => states.push(state));

    const result = await sync.hydrate();

    expect(result).toEqual({ fieldReady: true, cancelled: false, failed: ['weather'], completed: ['reference'] });
    expect(states.some((state) => state.steps.find((step) => step.id === 'reference')?.progress === 0.5)).toBe(true);
    expect(states.some((state) => state.running)).toBe(true);
    const final = sync.getState();
    expect(final.running).toBe(false);
    expect(final.fieldReady).toBe(true);
    expect(final.steps).toEqual([
      { id: 'reference', required: true, status: 'done', progress: 1, completedAt: clock.now() },
      { id: 'weather', required: false, status: 'failed', progress: 0, error: 'Error' },
    ]);
    // A failed optional step means the hydration was not complete: no hydration timestamp.
    expect(kv.getNumber(LAST_HYDRATION_AT_KEY)).toBeUndefined();
  });

  it('is not field ready while a required step is stale', async () => {
    const sync = createSyncOrchestrator();
    sync.registerHydrationStep({ id: 'working-set', required: true, isCurrent: () => false, run: async () => Promise.reject(new Error('500')) });
    expect((await sync.hydrate()).fieldReady).toBe(false);
    expect(sync.isFieldReady()).toBe(false);
  });

  it('skips steps that are already current unless forced, and records the hydration time', async () => {
    const clock = createClock();
    const kv = new DurableKv(createMemoryKvBackend('main'));
    const sync = createSyncOrchestrator({ kv, now: clock.now });
    const run = jest.fn(async () => undefined);
    sync.registerHydrationStep({ id: 'reference', required: true, isCurrent: () => true, run });
    await sync.hydrate();
    expect(run).not.toHaveBeenCalled();
    await sync.hydrate({ force: true });
    expect(run).toHaveBeenCalledTimes(1);
    expect(sync.getLastHydrationAt()).toBe(clock.now());
  });

  it('runs dependencies first and skips dependents of a failed step', async () => {
    const sync = createSyncOrchestrator();
    const order: string[] = [];
    sync.registerHydrationStep({ id: 'map-packs', required: false, dependsOn: ['manifest'], isCurrent: () => false, run: async () => void order.push('map-packs') });
    sync.registerHydrationStep({ id: 'manifest', required: true, isCurrent: () => false, run: async () => void order.push('manifest') });
    sync.registerHydrationStep({ id: 'bundle', required: true, isCurrent: () => false, run: async () => Promise.reject(new Error('x')) });
    sync.registerHydrationStep({ id: 'board', required: false, dependsOn: ['bundle'], isCurrent: () => false, run: async () => void order.push('board') });

    const result = await sync.hydrate();

    expect(order).toEqual(['manifest', 'map-packs']);
    expect(result.failed.sort()).toEqual(['board', 'bundle']);
    expect(sync.getState().steps.find((step) => step.id === 'board')?.status).toBe('skipped');
  });

  it('shares one run between concurrent calls and can be cancelled', async () => {
    const sync = createSyncOrchestrator();
    let release: () => void = () => undefined;
    const run = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    sync.registerHydrationStep({ id: 'slow', required: true, isCurrent: () => false, run });
    const first = sync.hydrate();
    const second = sync.hydrate();
    await flush();
    sync.cancel();
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(a.cancelled).toBe(true);
  });

  it('unregisters steps', () => {
    const sync = createSyncOrchestrator();
    const dispose = sync.registerHydrationStep({ id: 'x', required: true, isCurrent: () => true, run: async () => undefined });
    dispose();
    expect(sync.getHydrationSteps()).toEqual([]);
  });
});

describe('SyncOrchestrator — reconnect sequence', () => {
  it('runs refresh auth → pull deltas → reconcile → drain → resume realtime, then records the sync', async () => {
    const clock = createClock();
    const kv = new DurableKv(createMemoryKvBackend('main'));
    const sync = createSyncOrchestrator({ kv, now: clock.now });
    const order: string[] = [];
    const step = (name: string) => async () => void order.push(name);
    sync.setReconnectSequence({ resumeRealtime: step('resumeRealtime'), drainOutbox: step('drainOutbox'), refreshAuth: step('refreshAuth'), reconcile: step('reconcile'), pullDeltas: step('pullDeltas') });
    const onSync = jest.fn();
    sync.onSyncCompleted(onSync);

    const result = await sync.onReconnect();

    expect(order).toEqual(['refreshAuth', 'pullDeltas', 'reconcile', 'drainOutbox', 'resumeRealtime']);
    expect(result).toEqual({ ok: true, completed: order, failed: [] });
    expect(kv.getNumber(LAST_SYNC_AT_KEY)).toBe(clock.now());
    expect(onSync).toHaveBeenCalledWith(clock.now());
  });

  it('aborts everything when auth cannot be refreshed', async () => {
    const sync = createSyncOrchestrator();
    const drain = jest.fn(async () => undefined);
    sync.setReconnectSequence({ refreshAuth: async () => Promise.reject(new Error('400')), drainOutbox: drain });
    expect(await sync.onReconnect()).toEqual({ ok: false, abortedAt: 'refreshAuth', completed: [], failed: ['refreshAuth'] });
    expect(drain).not.toHaveBeenCalled();
    expect(sync.getLastSyncAt()).toBeNull();
  });

  it('still drains queued writes when the delta pull fails, without recording a sync', async () => {
    const sync = createSyncOrchestrator();
    const drain = jest.fn(async () => undefined);
    sync.setReconnectSequence({ pullDeltas: async () => Promise.reject(new Error('503')), drainOutbox: drain });
    const result = await sync.onReconnect();
    expect(result).toEqual({ ok: false, completed: ['drainOutbox'], failed: ['pullDeltas'] });
    expect(drain).toHaveBeenCalled();
    expect(sync.getLastSyncAt()).toBeNull();
  });

  it('shares one reconnect run between concurrent triggers', async () => {
    const sync = createSyncOrchestrator();
    const drain = jest.fn(async () => undefined);
    sync.setReconnectSequence({ drainOutbox: drain });
    await Promise.all([sync.onReconnect(), sync.onReconnect()]);
    expect(drain).toHaveBeenCalledTimes(1);
  });
});
