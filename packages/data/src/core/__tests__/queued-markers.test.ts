import { saveUnitStatus } from '@resgrid/api';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, flush, httpError } from '../../__tests__/helpers';
import { usePersonnelStatusStore } from '../../personnel/personnel-status-store';
import { selectPendingUnitStatus, useUnitStatusStore } from '../../units/unit-status-store';
import { reconcileQueuedMarkers, startQueuedMarkerReconciliation, withoutMarkers } from '../queued-markers';
import { setDataLogger } from '../runtime';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  saveUnitStatus: jest.fn(),
  getUnitStatus: jest.fn(() => new Promise(() => undefined)),
  getAllUnitStatuses: jest.fn(() => new Promise(() => undefined)),
}));

let runtime: DataTestRuntime;

/** A marker restored from storage another tab wrote: this device's outbox never held its event. */
const foreignMarker = (localId: string) => ({ localId, unitId: '10', statusType: '5', respondingTo: '', respondingToType: null, note: '', createdAt: 1, state: 'queued' as const });

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'dispatch' });

  for (const name of ['data.unit-status', 'data.personnel-status']) await defaultResetRegistry.getStoreResets().get(name)?.('logout');
});

describe('queued marker reconciliation', () => {
  it('drops a "Pending sync" marker whose write this outbox does not hold, and keeps queued and refused ones', async () => {
    runtime.connectivity.setOnline(false);
    const queued = await useUnitStatusStore.getState().saveUnitStatus({ unitId: '11', statusType: '5' });
    runtime.connectivity.setOnline(true);
    jest.mocked(saveUnitStatus).mockRejectedValueOnce(httpError(400));
    const refused = await useUnitStatusStore.getState().saveUnitStatus({ unitId: '12', statusType: '5' });
    expect([queued.outcome, refused.outcome]).toEqual(['queued', 'rejected']);
    useUnitStatusStore.getState().applyQueuedStatus(foreignMarker('evt-other-tab'));
    expect(selectPendingUnitStatus(useUnitStatusStore.getState(), '10')).toBeDefined();

    await expect(reconcileQueuedMarkers()).resolves.toBe(1);

    expect(Object.keys(useUnitStatusStore.getState().queuedStatuses).sort()).toEqual([queued.id, refused.id].sort());
    expect(selectPendingUnitStatus(useUnitStatusStore.getState(), '10')).toBeUndefined();
  });

  it('covers every registered store (member statuses too)', async () => {
    usePersonnelStatusStore.getState().applyQueuedWrite({ localId: 'evt-dropped', kind: 'status', userId: 'user-b', type: '2', respondingTo: '', note: '', createdAt: 1, state: 'queued' });

    await expect(reconcileQueuedMarkers()).resolves.toBe(1);

    expect(usePersonnelStatusStore.getState().queuedWrites).toEqual({});
  });

  it('logs a failed lookup with its operation and keeps the markers', async () => {
    const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    setDataLogger(logger);
    useUnitStatusStore.getState().applyQueuedStatus(foreignMarker('evt-unchecked'));
    jest.spyOn(runtime.outbox, 'findEventIds').mockRejectedValueOnce(new TypeError('database closed'));

    await expect(reconcileQueuedMarkers()).resolves.toBe(0);

    expect(logger.warn).toHaveBeenCalledWith({ message: 'Queued marker reconciliation failed', context: { operation: 'reconcileQueuedMarkers', removedBeforeFailure: 0, error: 'TypeError' } });
    expect(Object.keys(useUnitStatusStore.getState().queuedStatuses)).toEqual(['evt-unchecked']);
  });

  it('runs at start and again after every outbox change', async () => {
    useUnitStatusStore.getState().applyQueuedStatus(foreignMarker('evt-restored'));
    const stop = startQueuedMarkerReconciliation();
    await flush();
    expect(useUnitStatusStore.getState().queuedStatuses).toEqual({});

    // A marker left behind later (the app closed between delivery and saving the cleared marker) goes on the next change.
    useUnitStatusStore.getState().applyQueuedStatus(foreignMarker('evt-left-behind'));
    runtime.connectivity.setOnline(false);
    const next = await useUnitStatusStore.getState().saveUnitStatus({ unitId: '10', statusType: '6' });
    await flush(10);
    expect(Object.keys(useUnitStatusStore.getState().queuedStatuses)).toEqual([next.id]);
    stop();
  });

  it('leaves the record itself alone when none of the ids are in it', () => {
    const markers = { a: 1, b: 2 };
    expect(withoutMarkers(markers, ['c'])).toBe(markers);
    expect(withoutMarkers(markers, ['a', 'c'])).toEqual({ b: 2 });
  });
});
