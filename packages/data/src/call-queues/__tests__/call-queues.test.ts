import { closeCallWith, dispatchCallNow, getActiveCalls, getAllPendingScheduledCalls, getPendingCalls, request } from '@resgrid/api';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, flush, httpError, ok } from '../../__tests__/helpers';
import { useCallsStore } from '../../calls/calls-store';
import { archivedCallsEndpoints, useArchivedCallsStore, withArchivedYear } from '../archived-calls-store';
import { useCallQueueActionsStore } from '../call-queue-actions-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  request: jest.fn(),
  dispatchCallNow: jest.fn(),
  closeCallWith: jest.fn(),
  getPendingCalls: jest.fn(),
  getAllPendingScheduledCalls: jest.fn(),
  getActiveCalls: jest.fn(),
}));

beforeEach(async () => {
  await createDataTestRuntime({ variant: 'dispatch' });
  for (const name of ['data.archived-calls', 'data.call-queue-actions', 'data.calls']) await defaultResetRegistry.getStoreResets().get(name)?.('logout');
  jest.mocked(getPendingCalls).mockResolvedValue(ok([]) as never);
  jest.mocked(getAllPendingScheduledCalls).mockResolvedValue(ok([]) as never);
  jest.mocked(getActiveCalls).mockResolvedValue(ok([]) as never);
});

const answerArchived = (years: string[], callsByYear: Record<string, unknown[]>) =>
  jest.mocked(request).mockImplementation(async (_ctx, definition, args) => {
    if (definition === archivedCallsEndpoints.getCallYears) return ok(years) as never;
    const year = String((args as { params: { year: string } }).params.year);
    return ok(callsByYear[year] ?? []) as never;
  });

describe('archived calls store', () => {
  it('loads the newest year by default and keeps a preferred year', async () => {
    answerArchived(['2026', '2025'], { '2026': [{ CallId: 'a' }], '2025': [{ CallId: 'b' }, { CallId: 'c' }] });
    await useArchivedCallsStore.getState().load();
    expect(useArchivedCallsStore.getState().selectedYear).toBe('2026');
    expect(useArchivedCallsStore.getState().archivedCalls).toHaveLength(1);

    await useArchivedCallsStore.getState().selectYear('2025');
    expect(useArchivedCallsStore.getState().archivedCalls).toHaveLength(2);

    await useArchivedCallsStore.getState().load();
    expect(useArchivedCallsStore.getState().selectedYear).toBe('2025');
  });

  it('falls back to the current year when the department has no calls and records a failure', async () => {
    answerArchived([], {});
    await useArchivedCallsStore.getState().load();
    expect(useArchivedCallsStore.getState().years).toEqual([String(new Date(Date.UTC(2026, 9, 31)).getFullYear())]);

    jest.mocked(request).mockRejectedValueOnce(httpError(404));
    await useArchivedCallsStore.getState().load();
    expect(useArchivedCallsStore.getState().errors.years?.code).toBe('not_found');
  });

  it('places an unreported year among the years, newest first', () => {
    expect(withArchivedYear(['2026', '2024'], '2025')).toEqual(['2026', '2025', '2024']);
    expect(withArchivedYear(['2026'], '2026')).toEqual(['2026']);
  });
});

describe('call queue actions', () => {
  it('dispatches now with a replacement list and refreshes the queues and active calls', async () => {
    jest.mocked(dispatchCallNow).mockResolvedValueOnce({ Id: '9', Status: 'success' } as never);
    const outcome = await useCallQueueActionsStore.getState().dispatchNow('9', { dispatchList: 'U:1' });
    expect(outcome).toEqual({ ok: true, error: null });
    expect(dispatchCallNow).toHaveBeenCalledWith(expect.anything(), { CallId: '9', DispatchList: 'U:1' });
    await flush();
    expect(getPendingCalls).toHaveBeenCalled();
    expect(getActiveCalls).toHaveBeenCalled();
    expect(useCallQueueActionsStore.getState().busyCallId).toBeNull();
  });

  it('dispatches to the proposed recipients when no list is given and reports a refusal', async () => {
    jest.mocked(dispatchCallNow).mockResolvedValueOnce({ Status: 'failure' } as never);
    const outcome = await useCallQueueActionsStore.getState().dispatchNow('9');
    expect(dispatchCallNow).toHaveBeenCalledWith(expect.anything(), { CallId: '9' });
    expect(outcome.ok).toBe(false);
    expect(outcome.error?.code).toBe('rejected');
  });

  it('cancels a pending call as Cancelled without notifying anyone', async () => {
    jest.mocked(closeCallWith).mockResolvedValueOnce({ Status: 'success' } as never);
    useCallsStore.setState({ pendingCalls: [] });
    await useCallQueueActionsStore.getState().cancelPending('p1');
    expect(closeCallWith).toHaveBeenCalledWith(expect.anything(), { callId: 'p1', type: 2, sendNotification: false });
  });
});
