import { getCall, getCallExtraData, releaseFromCallWith } from '@resgrid/api';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, httpError, notFound, ok } from '../../__tests__/helpers';
import { useCallDetailStore } from '../call-detail-store';
import { useCallsStore } from '../calls-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getCall: jest.fn(),
  getCallExtraData: jest.fn(),
  releaseFromCallWith: jest.fn(),
}));

const releasedUnit = { Id: '45', Type: 'Unit', Name: 'MUG 1', ReleasedOn: '2026-11-16T10:32:00Z', ReleasedBy: 'Dana Dispatcher' };

let runtime: DataTestRuntime;

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'dispatch' });
  await defaultResetRegistry.getStoreResets().get('data.calls')?.('logout');
  await defaultResetRegistry.getStoreResets().get('data.call-detail')?.('logout');
  jest.mocked(releaseFromCallWith).mockReset();
  // SAFETY: GetCall and GetCallExtraData envelopes with only the fields these tests read.
  jest.mocked(getCall).mockResolvedValue(ok({ CallId: '123', Name: 'Cardiac arrest' }) as never);
  // SAFETY: as above, after the release (the unit moved to ReleasedUnits).
  jest.mocked(getCallExtraData).mockResolvedValue(ok({ Dispatches: [{ Id: '46', Type: 'Unit', Name: 'Ambulance 2' }], ReleasedUnits: [releasedUnit] }) as never);
});

describe('releasing a resource from a call', () => {
  it('sends the release and re-reads the call, so the unit moves to the released list', async () => {
    // SAFETY: a ReleaseUnit envelope with the fields Core sends.
    jest.mocked(releaseFromCallWith).mockResolvedValue({ Status: 'updated', Data: { CallId: '123', UnitId: '45', ReleasedOn: '2026-11-16T10:32:00Z', StatusApplied: true } } as never);

    const outcome = await useCallDetailStore.getState().releaseFromCall({ kind: 'unit', callId: '123', resourceId: '45', notify: true });

    expect(outcome).toEqual({ releasedOn: '2026-11-16T10:32:00Z', statusApplied: true });
    expect(releaseFromCallWith).toHaveBeenCalledWith(expect.anything(), { kind: 'unit', callId: '123', resourceId: '45', notify: true });
    expect(getCallExtraData).toHaveBeenCalledWith(expect.anything(), { callId: '123' });
    expect(useCallDetailStore.getState().details['123'].extraData?.ReleasedUnits).toEqual([releasedUnit]);
    expect(useCallDetailStore.getState().writeError).toBeNull();
  });

  it('reports a kept status, and a call that no longer exists as null (not_found arrives as HTTP 200)', async () => {
    // SAFETY: a ReleasePersonnel envelope.
    jest.mocked(releaseFromCallWith).mockResolvedValue({ Status: 'updated', Data: { CallId: '123', UserId: 'u-1', ReleasedOn: '2026-11-16T10:40:00Z', StatusApplied: false } } as never);
    await expect(useCallDetailStore.getState().releaseFromCall({ kind: 'personnel', callId: '123', resourceId: 'u-1', notify: false })).resolves.toEqual({ releasedOn: '2026-11-16T10:40:00Z', statusApplied: false });

    jest.mocked(getCallExtraData).mockClear();
    // SAFETY: a not_found envelope.
    jest.mocked(releaseFromCallWith).mockResolvedValue(notFound(null) as never);
    await expect(useCallDetailStore.getState().releaseFromCall({ kind: 'unit', callId: '999', resourceId: '45', notify: true })).resolves.toBeNull();
    expect(getCallExtraData).not.toHaveBeenCalled();
  });

  it('keeps a release whose call read fails, and reads nothing for a release answered after sign-out', async () => {
    // SAFETY: a ReleaseUnit envelope with the fields Core sends.
    const released = { Status: 'updated', Data: { CallId: '123', UnitId: '45', ReleasedOn: '2026-11-16T10:32:00Z', StatusApplied: true } } as never;
    jest.mocked(releaseFromCallWith).mockResolvedValueOnce(released);
    jest.mocked(getCallExtraData).mockRejectedValueOnce(httpError(503));

    await expect(useCallDetailStore.getState().releaseFromCall({ kind: 'unit', callId: '123', resourceId: '45', notify: true })).resolves.toEqual({ releasedOn: '2026-11-16T10:32:00Z', statusApplied: true });
    expect(useCallDetailStore.getState().writeError).toBeNull();

    let answer: (value: never) => void = () => undefined;

    jest.mocked(releaseFromCallWith).mockReturnValueOnce(
      new Promise<never>((resolve) => {
        answer = resolve;
      })
    );

    const releasing = useCallDetailStore.getState().releaseFromCall({ kind: 'unit', callId: '123', resourceId: '45', notify: true });
    await defaultResetRegistry.getStoreResets().get('data.call-detail')?.('logout');
    jest.mocked(getCallExtraData).mockClear();
    answer(released);
    await releasing;

    expect(getCallExtraData).not.toHaveBeenCalled();
    expect(useCallDetailStore.getState().details['123']).toBeUndefined();
  });

  it('stamps each dispatch read when it leaves, so a list read that left before the release stays the older one', async () => {
    let answerList: (value: never) => void = () => undefined;

    jest.mocked(getCallExtraData).mockReturnValueOnce(
      new Promise<never>((resolve) => {
        answerList = resolve;
      })
    );

    const listRead = useCallsStore.getState().fetchCallDispatches(['123'], { bypassCache: true });
    const listLeftAt = runtime.clock.now();

    runtime.clock.advance(5000);
    // SAFETY: a ReleaseUnit envelope with the fields Core sends.
    jest.mocked(releaseFromCallWith).mockResolvedValueOnce({ Status: 'updated', Data: { CallId: '123', UnitId: '45', ReleasedOn: '2026-11-16T10:32:00Z', StatusApplied: true } } as never);
    await useCallDetailStore.getState().releaseFromCall({ kind: 'unit', callId: '123', resourceId: '45', notify: true });
    runtime.clock.advance(5000);
    // SAFETY: the list read's GetCallExtraData answer, from before the release (MUG 1 still dispatched).
    answerList(ok({ Dispatches: [{ Id: '45', Type: 'Unit', Name: 'MUG 1' }] }) as never);
    await listRead;

    expect(useCallsStore.getState().callDispatchesFetchedAt['123']).toBe(listLeftAt);
    expect(useCallDetailStore.getState().details['123'].fetchedAt).toBe(listLeftAt + 5000);
  });

  it('rethrows a refusal and records it as the last write error', async () => {
    jest.mocked(releaseFromCallWith).mockRejectedValue(httpError(400));

    await expect(useCallDetailStore.getState().releaseFromCall({ kind: 'unit', callId: '123', resourceId: '45', notify: true })).rejects.toBeDefined();
    expect(useCallDetailStore.getState().writeError?.code).toBe('rejected');
    expect(useCallDetailStore.getState().isWriting).toBe(false);
  });
});
