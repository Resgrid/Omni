import { getNearestUnits } from '@resgrid/api';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, flush, networkError, ok } from '../../__tests__/helpers';
import { BOARD_MAX_AGE_MS, boardKeyFor, useDispatchBoardStore } from '../dispatch-board-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getNearestUnits: jest.fn(),
}));

const mockGetNearestUnits = jest.mocked(getNearestUnits);

const board = (name: string) => ({ Latitude: 51.05, Longitude: 3.72, GeneratedOn: '2026-11-13T06:00:00Z', IsDepartmentWide: true, Units: [{ UnitId: 1, Name: name }], Personnel: [], Notes: [] });

beforeEach(async () => {
  jest.useRealTimers();
  await createDataTestRuntime({ variant: 'dispatch' });
  await defaultResetRegistry.getStoreResets().get('data.dispatch-board')?.('logout');
  mockGetNearestUnits.mockReset();
});

describe('dispatch board store', () => {
  it('keys a spot to about a metre', () => {
    expect(boardKeyFor(51.0500004, 3.7200004)).toBe('51.05000,3.72000');
  });

  it('loads the board for a location and reuses it for the same spot', async () => {
    // SAFETY: the mocked endpoint answers with the v4 envelope the store unwraps.
    mockGetNearestUnits.mockResolvedValue(ok(board('ZW 1')) as never);

    await useDispatchBoardStore.getState().fetchNearestBoard(51.05, 3.72);
    await useDispatchBoardStore.getState().fetchNearestBoard(51.050001, 3.720001);

    expect(mockGetNearestUnits).toHaveBeenCalledTimes(1);
    expect(mockGetNearestUnits.mock.calls[0]?.[1]).toEqual({ latitude: 51.05, longitude: 3.72 });
    expect(useDispatchBoardStore.getState().board?.Units[0]?.Name).toBe('ZW 1');
    expect(useDispatchBoardStore.getState().isBoardLoading).toBe(false);
  });

  it('asks again once the board is stale or when forced', async () => {
    // SAFETY: the mocked endpoint answers with the v4 envelope the store unwraps.
    mockGetNearestUnits.mockResolvedValue(ok(board('ZW 1')) as never);
    const now = jest.spyOn(Date, 'now');

    now.mockReturnValue(1_000_000);
    await useDispatchBoardStore.getState().fetchNearestBoard(51.05, 3.72);
    now.mockReturnValue(1_000_000 + BOARD_MAX_AGE_MS + 1);
    await useDispatchBoardStore.getState().fetchNearestBoard(51.05, 3.72);
    await useDispatchBoardStore.getState().fetchNearestBoard(51.05, 3.72, true);
    now.mockRestore();

    expect(mockGetNearestUnits).toHaveBeenCalledTimes(3);
  });

  it('never asks for an unusable location', async () => {
    await useDispatchBoardStore.getState().fetchNearestBoard(0, 0);
    await useDispatchBoardStore.getState().fetchNearestBoard(Number.NaN, 3.72);
    await useDispatchBoardStore.getState().fetchNearestBoard(91, 3.72);

    expect(mockGetNearestUnits).not.toHaveBeenCalled();
  });

  it('drops a board for a spot the dispatcher has moved away from', async () => {
    let resolveFirst: (envelope: ReturnType<typeof ok<ReturnType<typeof board>>>) => void = () => undefined;

    // SAFETY: the mocked endpoint answers with the v4 envelope the store unwraps; the first answer is held back.
    mockGetNearestUnits.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)) as never).mockResolvedValueOnce(ok(board('second')) as never);

    const first = useDispatchBoardStore.getState().fetchNearestBoard(51.05, 3.72);
    await useDispatchBoardStore.getState().fetchNearestBoard(51.1, 3.8);
    resolveFirst(ok(board('first')));
    await first;
    await flush();

    expect(useDispatchBoardStore.getState().board?.Units[0]?.Name).toBe('second');
    expect(useDispatchBoardStore.getState().boardKey).toBe(boardKeyFor(51.1, 3.8));
  });

  it('reports a failure without throwing, and clears on sign-out', async () => {
    mockGetNearestUnits.mockRejectedValue(networkError());

    await useDispatchBoardStore.getState().fetchNearestBoard(51.05, 3.72);

    expect(useDispatchBoardStore.getState().boardError).not.toBeNull();
    expect(useDispatchBoardStore.getState().isBoardLoading).toBe(false);

    await defaultResetRegistry.getStoreResets().get('data.dispatch-board')?.('logout');

    expect(useDispatchBoardStore.getState()).toMatchObject({ board: null, boardKey: null, boardError: null, isBoardLoading: false });
  });
});
