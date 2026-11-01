import { escalateCall, getCallRecommendation, getDispatchRecommendation } from '@resgrid/api';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, flush, httpError, networkError, notFound, ok } from '../../__tests__/helpers';
import { RUN_CARD_RECOMMENDATION_DEBOUNCE_MS, selectCallRecommendation, useRunCardsStore } from '../run-cards-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getDispatchRecommendation: jest.fn(),
  getCallRecommendation: jest.fn(),
  escalateCall: jest.fn(),
}));

const recommendation = (units: number[], overrides: Record<string, unknown> = {}) => ({
  MatchedRunCardId: 7,
  MatchedRunCardName: 'Structure fire',
  AlarmLevel: 1,
  ModeUsed: 1,
  AutoDispatch: false,
  Units: units.map((UnitId) => ({ UnitId, UnitName: `E${UnitId}` })),
  Personnel: [],
  Shortfalls: [],
  MoveUps: [],
  Notes: [],
  ...overrides,
});

beforeEach(async () => {
  await createDataTestRuntime({ variant: 'dispatch' });
  await defaultResetRegistry.getStoreResets().get('data.run-cards')?.('logout');
});

describe('run cards store — New Call preview', () => {
  it('does not ask before priority and type are both picked', async () => {
    await useRunCardsStore.getState().fetchRecommendation({ priority: null, type: 'Fire' });
    await useRunCardsStore.getState().fetchRecommendation({ priority: 1, type: '  ' });
    expect(getDispatchRecommendation).not.toHaveBeenCalled();
    expect(useRunCardsStore.getState().hasFetched).toBe(false);
  });

  it('sends location only when both coordinates are usable and keeps code choices for units still proposed', async () => {
    jest.mocked(getDispatchRecommendation).mockResolvedValueOnce(ok(recommendation([1, 2])) as never);
    await useRunCardsStore.getState().fetchRecommendation({ priority: 1, type: 'Fire', latitude: 40, longitude: -105 });
    expect(getDispatchRecommendation).toHaveBeenCalledWith(expect.anything(), { priority: 1, type: 'Fire', latitude: 40, longitude: -105 }, expect.objectContaining({ signal: expect.anything() }));
    useRunCardsStore.getState().setUnitResponseCode(1, 3);
    useRunCardsStore.getState().setUnitResponseCode(2, 4);

    jest.mocked(getDispatchRecommendation).mockResolvedValueOnce(ok(recommendation([2])) as never);
    await useRunCardsStore.getState().fetchRecommendation({ priority: 1, type: 'Fire', latitude: 40, longitude: null });
    expect(jest.mocked(getDispatchRecommendation).mock.calls[1][1]).toEqual({ priority: 1, type: 'Fire' });
    expect(useRunCardsStore.getState().unitResponseCodes).toEqual({ 2: 4 });
    expect(useRunCardsStore.getState().hasFetched).toBe(true);
  });

  it('treats not_found as "no card matched" and a failure as a quiet error', async () => {
    jest.mocked(getDispatchRecommendation).mockResolvedValueOnce(notFound(null) as never);
    await useRunCardsStore.getState().fetchRecommendation({ priority: 1, type: 'Fire' });
    expect(useRunCardsStore.getState().recommendation).toBeNull();
    expect(useRunCardsStore.getState().error).toBeNull();

    jest.mocked(getDispatchRecommendation).mockRejectedValueOnce(httpError(500));
    await useRunCardsStore.getState().fetchRecommendation({ priority: 1, type: 'Fire' });
    expect(useRunCardsStore.getState().error?.code).toBe('server');
    expect(useRunCardsStore.getState().isLoading).toBe(false);
  });

  it('debounces lookups and clear() cancels a pending one', async () => {
    jest.useFakeTimers();
    try {
      jest.mocked(getDispatchRecommendation).mockResolvedValue(ok(recommendation([1])) as never);
      useRunCardsStore.getState().fetchRecommendationDebounced({ priority: 1, type: 'F' });
      useRunCardsStore.getState().fetchRecommendationDebounced({ priority: 1, type: 'Fire' });
      jest.advanceTimersByTime(RUN_CARD_RECOMMENDATION_DEBOUNCE_MS);
      expect(getDispatchRecommendation).toHaveBeenCalledTimes(1);
      expect(jest.mocked(getDispatchRecommendation).mock.calls[0][1]).toEqual({ priority: 1, type: 'Fire' });

      useRunCardsStore.getState().fetchRecommendationDebounced({ priority: 2, type: 'Fire' });
      useRunCardsStore.getState().clear();
      jest.advanceTimersByTime(RUN_CARD_RECOMMENDATION_DEBOUNCE_MS * 2);
      expect(getDispatchRecommendation).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('drops a superseded answer', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    jest.mocked(getDispatchRecommendation).mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)) as never);
    jest.mocked(getDispatchRecommendation).mockResolvedValueOnce(ok(recommendation([9])) as never);
    const first = useRunCardsStore.getState().fetchRecommendation({ priority: 1, type: 'Fire' });
    await useRunCardsStore.getState().fetchRecommendation({ priority: 2, type: 'Fire' });
    resolveFirst(ok(recommendation([1])));
    await first;
    expect(useRunCardsStore.getState().recommendation?.Units.map((unit) => unit.UnitId)).toEqual([9]);
  });
});

describe('run cards store — escalation and add-resources', () => {
  it('returns the escalation result and records a failure', async () => {
    jest.mocked(escalateCall).mockResolvedValueOnce({ Success: true, NewAlarmLevel: 2, AddedUnits: 3, AddedPersonnel: 0, Status: 'success' } as never);
    expect(await useRunCardsStore.getState().escalate('42')).toMatchObject({ NewAlarmLevel: 2 });
    expect(escalateCall).toHaveBeenCalledWith(expect.anything(), { callId: '42' });

    jest.mocked(escalateCall).mockRejectedValueOnce(networkError());
    expect(await useRunCardsStore.getState().escalate('42')).toBeNull();
    expect(useRunCardsStore.getState().escalationError?.code).toBe('network');
    expect(useRunCardsStore.getState().isEscalating).toBe(false);
  });

  it('keeps per-call recommendations and leaves the pinned answer when a re-evaluation fails', async () => {
    jest.mocked(getCallRecommendation).mockResolvedValueOnce(ok(recommendation([5])) as never);
    await useRunCardsStore.getState().fetchCallRecommendation('42');
    expect(selectCallRecommendation(useRunCardsStore.getState(), '42').recommendation?.Units).toHaveLength(1);

    jest.mocked(getCallRecommendation).mockRejectedValueOnce(httpError(500));
    expect(await useRunCardsStore.getState().fetchCallRecommendation('42', { reevaluate: true })).toBe(false);
    expect(getCallRecommendation).toHaveBeenLastCalledWith(expect.anything(), { callId: '42', reevaluate: true }, expect.anything());
    const entry = selectCallRecommendation(useRunCardsStore.getState(), '42');
    expect(entry.recommendation?.Units).toHaveLength(1);
    expect(entry.isReevaluating).toBe(false);

    useRunCardsStore.getState().clearCallRecommendation('42');
    expect(selectCallRecommendation(useRunCardsStore.getState(), '42').hasFetched).toBe(false);
  });

  it('a reset drops answers that land afterwards', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    jest.mocked(getCallRecommendation).mockImplementationOnce(() => new Promise((r) => (resolve = r)) as never);
    const pending = useRunCardsStore.getState().fetchCallRecommendation('42');
    await defaultResetRegistry.getStoreResets().get('data.run-cards')?.('logout');
    resolve(ok(recommendation([1])));
    await pending;
    await flush();
    expect(useRunCardsStore.getState().callRecommendations).toEqual({});
  });
});
