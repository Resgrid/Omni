import {
  closeCallWith,
  deleteCallVideoFeed,
  getCall,
  getCallExtraData,
  getCallNotes,
  getCallSiteInfo,
  getCallVideoFeeds,
  getTimersForCall,
  getTimerStatuses,
  performCheckIn,
  saveCallNote,
  toggleCallTimers,
  updateCall,
  uploadCallFile,
} from '@resgrid/api';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, flush, httpError, networkError, notFound, ok, persisted } from '../../__tests__/helpers';
import { setDataLocationProvider } from '../../core/runtime';
import { usePersonnelStore } from '../../personnel/personnel-store';
import { useUnitsStore } from '../../units/units-store';
import { CallFileKind, selectCallNotes, setCallFileReader, useCallDetailStore } from '../call-detail-store';
import { useCallVideoFeedsStore } from '../call-video-feeds-store';
import { enrichTimerNames, useCheckInTimersStore } from '../check-in-timers-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getCall: jest.fn(),
  getCallExtraData: jest.fn(),
  getCallNotes: jest.fn(),
  getCallFiles: jest.fn(),
  getCallSiteInfo: jest.fn(),
  saveCallNote: jest.fn(),
  uploadCallFile: jest.fn(),
  updateCall: jest.fn(),
  closeCallWith: jest.fn(),
  getCallVideoFeeds: jest.fn(),
  deleteCallVideoFeed: jest.fn(),
  getTimerStatuses: jest.fn(),
  getTimersForCall: jest.fn(),
  performCheckIn: jest.fn(),
  toggleCallTimers: jest.fn(),
}));

let runtime: DataTestRuntime;

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'responder' });
  jest.mocked(getCall).mockResolvedValue(ok({ CallId: '5', Name: 'Fire' }) as never);
  jest.mocked(getCallExtraData).mockResolvedValue(ok({ Dispatches: [] }) as never);
  jest.mocked(getCallNotes).mockResolvedValue(ok([{ CallNoteId: 'n1', Note: 'First on scene', FullName: 'B' }]) as never);
  for (const name of ['data.call-detail', 'data.call-video-feeds', 'data.check-in-timers']) await defaultResetRegistry.getStoreResets().get(name)?.('logout');
});

describe('call detail', () => {
  it('loads detail + extras keyed by call and persists them without expiring site info', async () => {
    jest.mocked(getCallSiteInfo).mockResolvedValue(ok({ Contacts: [] }) as never);
    await useCallDetailStore.getState().fetchCallDetail('5');
    await useCallDetailStore.getState().fetchCallSiteInfo('5');
    const record = useCallDetailStore.getState().details['5'];
    expect(record.call?.Name).toBe('Fire');
    expect(record.siteInfo).toEqual({ Contacts: [] });
    const blob = persisted(runtime.kv, 'omni-call-detail-storage');
    expect((blob?.state.details as Record<string, Record<string, unknown>>)['5']).not.toHaveProperty('siteInfo');
  });

  it('records an error code on failure and an empty answer for not_found', async () => {
    jest.mocked(getCall).mockRejectedValue(httpError(404));
    await useCallDetailStore.getState().fetchCallDetail('5');
    expect(useCallDetailStore.getState().errors.detail?.code).toBe('not_found');
    jest.mocked(getCallNotes).mockResolvedValue(notFound([]) as never);
    await useCallDetailStore.getState().fetchCallNotes('5');
    expect(useCallDetailStore.getState().details['5'].notes).toEqual([]);
  });

  it('a refused save keeps the loaded call usable (writeError, rethrown) — Dispatch', async () => {
    await useCallDetailStore.getState().fetchCallDetail('5');
    jest.mocked(updateCall).mockRejectedValue(httpError(400));
    await expect(useCallDetailStore.getState().updateCall({ callId: '5', name: 'x', nature: 'y', priority: 1 })).rejects.toBeDefined();
    expect(useCallDetailStore.getState().writeError?.code).toBe('rejected');
    expect(useCallDetailStore.getState().details['5'].call?.Name).toBe('Fire');
    jest.mocked(closeCallWith).mockResolvedValue({ Status: 'success' } as never);
    await useCallDetailStore.getState().closeCall({ callId: '5', type: 1 });
    expect(useCallDetailStore.getState().writeError).toBeNull();
  });

  it('adds a note offline: shown immediately with a queued marker, then replaced by the server copy', async () => {
    runtime.connectivity.setOnline(false);
    setDataLocationProvider(() => ({ latitude: 1, longitude: 2 }));
    const result = await useCallDetailStore.getState().addNote({ callId: '5', note: 'Water supply established', latitude: 39.1, longitude: -104 });
    expect(result.outcome).toBe('queued');
    const notes = selectCallNotes(useCallDetailStore.getState(), '5');
    expect(notes[notes.length - 1]).toMatchObject({ Note: 'Water supply established', FullName: 'Alex Crew', queued: { state: 'queued' } });

    jest.mocked(saveCallNote).mockResolvedValue({ Id: 'n2', Status: 'success' } as never);
    jest.mocked(getCallNotes).mockResolvedValue(ok([{ CallNoteId: 'n2', Note: 'Water supply established', FullName: 'Alex Crew' }]) as never);
    runtime.connectivity.setOnline(true);
    await runtime.outbox.drain();
    await flush();
    expect(saveCallNote).toHaveBeenCalledWith(expect.anything(), { CallId: '5', UserId: 'user-a', Note: 'Water supply established', Latitude: '39.1', Longitude: '-104', IdempotencyKey: result.id });
    expect(selectCallNotes(useCallDetailStore.getState(), '5').map((note) => note.CallNoteId)).toEqual(['n2']);
  });

  it('a refused note stays visible as rejected', async () => {
    jest.mocked(saveCallNote).mockRejectedValue(httpError(400));
    const result = await useCallDetailStore.getState().addNote({ callId: '5', note: 'x' });
    expect(result.outcome).toBe('rejected');
    expect(useCallDetailStore.getState().queuedNotes[result.id].state).toBe('rejected');
  });

  it('queues image upload metadata and reads the staged bytes only when sending', async () => {
    runtime.connectivity.setOnline(false);
    const reader = jest.fn(async () => 'BASE64');
    setCallFileReader(reader);
    const result = await useCallDetailStore.getState().uploadCallFile({ callId: '5', type: CallFileKind.Image, name: 'scene.jpg', stagedUri: 'file:///staged/scene.jpg' });
    expect(useCallDetailStore.getState().queuedFiles[result.id]).toMatchObject({ name: 'scene.jpg', state: 'queued' });
    expect(reader).not.toHaveBeenCalled();
    jest.mocked(uploadCallFile).mockResolvedValue({ Id: 'f1', Status: 'success' } as never);
    runtime.connectivity.setOnline(true);
    await runtime.outbox.drain();
    expect(reader).toHaveBeenCalledWith('file:///staged/scene.jpg');
    expect(uploadCallFile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ callId: '5', userId: 'user-a', type: 2, data: 'BASE64' }));
    setCallFileReader(null);
  });

  it('resets on wipe', async () => {
    await useCallDetailStore.getState().fetchCallDetail('5');
    await defaultResetRegistry.getStoreResets().get('data.call-detail')?.('department-switch');
    expect(useCallDetailStore.getState().details).toEqual({});
  });
});

describe('call video feeds (Unit shape + Dispatch race guard)', () => {
  it('keeps only the newest request when the call changes mid-flight', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    jest
      .mocked(getCallVideoFeeds)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)) as never)
      .mockResolvedValueOnce(ok([{ CallVideoFeedId: 'b', SortOrder: 2 }]) as never);
    const first = useCallVideoFeedsStore.getState().fetchFeeds('1');
    await useCallVideoFeedsStore.getState().fetchFeeds('2');
    resolveFirst(ok([{ CallVideoFeedId: 'stale', SortOrder: 1 }]));
    await first;
    const state = useCallVideoFeedsStore.getState();
    expect(state.feedsByCall['1']).toBeUndefined();
    expect(state.feedsByCall['2'].map((feed) => feed.CallVideoFeedId)).toEqual(['b']);
  });

  it('restores an optimistically removed feed when the delete is refused', async () => {
    jest.mocked(getCallVideoFeeds).mockResolvedValue(ok([{ CallVideoFeedId: 'a', SortOrder: 1 }]) as never);
    await useCallVideoFeedsStore.getState().fetchFeeds('1');
    jest.mocked(deleteCallVideoFeed).mockRejectedValue(httpError(403));
    expect(await useCallVideoFeedsStore.getState().deleteFeed('a', '1')).toBe(false);
    expect(useCallVideoFeedsStore.getState().feedsByCall['1']).toHaveLength(1);
    expect(useCallVideoFeedsStore.getState().saveError?.code).toBe('forbidden');
  });
});

describe('check-in timers (Dispatch store + Responder overdue count)', () => {
  it('enriches type-labelled timers from resolved timers, units and personnel', () => {
    const statuses = [
      { TargetType: 1, TargetTypeName: 'UnitType', TargetEntityId: '10', TargetName: 'UnitType', UnitId: null, Status: 'Ok' },
      { TargetType: 0, TargetTypeName: 'Personnel', TargetEntityId: 'u9', TargetName: '', UnitId: null, Status: 'Overdue' },
    ] as never[];
    const named = enrichTimerNames(statuses, [], [{ UnitId: '10', Name: 'Engine 1' }], [{ UserId: 'u9', IdentificationNumber: '', FirstName: 'Sam', LastName: 'Lee' }]);
    expect(named.map((s) => s.TargetName)).toEqual(['Engine 1', 'Sam Lee']);
  });

  it('sorts statuses by severity and computes the global overdue count', async () => {
    useUnitsStore.setState({ units: [] });
    usePersonnelStore.setState({ personnel: [] });
    jest.mocked(getTimersForCall).mockResolvedValue(ok([]) as never);
    jest.mocked(getTimerStatuses).mockResolvedValue(
      ok([
        { TargetName: 'A', Status: 'Ok' },
        { TargetName: 'B', Status: 'Overdue' },
        { TargetName: 'C', Status: 'Warning' },
      ]) as never
    );
    await useCheckInTimersStore.getState().fetchTimerStatuses(5);
    expect(useCheckInTimersStore.getState().statusesByCall['5'].map((s) => s.Status)).toEqual(['Overdue', 'Warning', 'Ok']);
    await useCheckInTimersStore.getState().fetchGlobalOverdueCount([
      { CallId: '5', CheckInTimersEnabled: true },
      { CallId: '6', CheckInTimersEnabled: false },
    ]);
    expect(useCheckInTimersStore.getState().globalOverdueCount).toBe(2);
  });

  it('performs a check-in offline with the outbox id as idempotency key', async () => {
    jest.mocked(getTimersForCall).mockResolvedValue(ok([]) as never);
    jest.mocked(getTimerStatuses).mockResolvedValue(ok([]) as never);
    runtime.connectivity.setOnline(false);
    const result = await useCheckInTimersStore.getState().performCheckIn({ callId: 5, checkInType: 0, location: { latitude: 39, longitude: -104 } });
    expect(useCheckInTimersStore.getState().queuedCheckIns[result.id]).toMatchObject({ callId: 5, state: 'queued' });
    jest.mocked(performCheckIn).mockResolvedValue({ Id: 'rec-1', Status: 'success' } as never);
    runtime.connectivity.setOnline(true);
    await runtime.outbox.drain();
    expect(performCheckIn).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ CallId: 5, CheckInType: 0, Latitude: '39', Longitude: '-104', IdempotencyKey: result.id }));
    await flush();
    expect(useCheckInTimersStore.getState().queuedCheckIns).toEqual({});
  });

  it('a network failure keeps the check-in queued; toggling timers is online only', async () => {
    jest.mocked(performCheckIn).mockRejectedValue(networkError());
    const result = await useCheckInTimersStore.getState().performCheckIn({ callId: 5, checkInType: 0 });
    expect(result.outcome).toBe('queued');
    jest.mocked(toggleCallTimers).mockRejectedValue(networkError());
    expect(await useCheckInTimersStore.getState().toggleTimers(5, true)).toBe(false);
    expect(toggleCallTimers).toHaveBeenCalledWith(expect.anything(), { callId: 5, enabled: true });
  });
});
