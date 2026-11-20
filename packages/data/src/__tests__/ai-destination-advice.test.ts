import * as api from '@resgrid/api';
import { type AiDestinationAdviceData, type AiDestinationAdviceResult, AiDestinationAdviceStates } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { AI_DESTINATION_ADVICE_TTL_MS, useAiDestinationAdviceStore } from '../ai-destinations/ai-destination-advice-store';
import { createDataTestRuntime, type DataTestRuntime, httpError, networkError, notFound, ok } from './helpers';

jest.mock('@resgrid/api', () => {
  const actual = jest.requireActual('@resgrid/api');

  return {
    ...actual,
    getAiDestinationAdvice: jest.fn(),
    requestAiDestinationAdvice: jest.fn(),
    applyAiDestinationAdvice: jest.fn(),
    dismissAiDestinationAdvice: jest.fn(),
  };
});

/** Enhanced AI destination advice per call (Core AiDestinations, M0323; call intake plan §7). */
const advice = (extra: Partial<AiDestinationAdviceData> = {}): AiDestinationAdviceData => ({
  Id: 'a1',
  CallId: 12,
  CurrentPoiId: 3,
  CurrentPoiName: 'General',
  RecommendedPoiId: 7,
  RecommendedPoiName: 'Trauma Center',
  RecommendedPoiStatus: null,
  RequiredCapabilities: [{ Id: 'trauma', Name: 'Level I Trauma' }],
  Rationale: 'Penetrating injury noted.',
  Confidence: 0.82,
  IsChange: true,
  IsConfident: true,
  State: AiDestinationAdviceStates.Open,
  CreatedOn: '2026-11-19T10:00:00Z',
  Trigger: 4,
  ...extra,
});

const answer = (data: { Available?: boolean; Outcome?: string | null; CanApply?: boolean; Advice?: AiDestinationAdviceData | null }) =>
  ok({ Available: data.Available ?? true, Outcome: data.Outcome ?? null, CanApply: data.CanApply ?? true, Advice: data.Advice === undefined ? advice() : data.Advice });

const store = () => useAiDestinationAdviceStore.getState();

let runtime: DataTestRuntime;

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'dispatch' });
  await defaultResetRegistry.getStoreResets().get('data.ai-destination-advice')?.('logout');
  jest.mocked(api.getAiDestinationAdvice).mockReset();
  jest.mocked(api.requestAiDestinationAdvice).mockReset();
  jest.mocked(api.applyAiDestinationAdvice).mockReset();
  jest.mocked(api.dismissAiDestinationAdvice).mockReset();
});

describe('AI destination advice store', () => {
  it('reads a call’s open advice once, then holds it for a while unless asked to read again', async () => {
    jest.mocked(api.getAiDestinationAdvice).mockResolvedValue(answer({}));

    const entry = await store().fetchAdvice(12);

    expect(entry).toMatchObject({ available: true, canApply: true, advice: expect.objectContaining({ Id: 'a1', RecommendedPoiId: 7 }) });
    expect(jest.mocked(api.getAiDestinationAdvice).mock.calls[0][1]).toEqual({ callId: '12' });

    await store().fetchAdvice('12');
    expect(api.getAiDestinationAdvice).toHaveBeenCalledTimes(1);

    runtime.clock.advance(AI_DESTINATION_ADVICE_TTL_MS + 1);
    await store().fetchAdvice(12);
    await store().fetchAdvice(12, { bypassCache: true });
    expect(api.getAiDestinationAdvice).toHaveBeenCalledTimes(3);
  });

  it('hides the advice when the department may not use it, and never asks for an id that is not a call', async () => {
    jest.mocked(api.getAiDestinationAdvice).mockResolvedValue(answer({ Available: false, CanApply: true }));

    expect(await store().fetchAdvice(12)).toMatchObject({ available: false, canApply: false, advice: null });
    expect(await store().fetchAdvice('abc')).toBeNull();
    expect(await store().fetchAdvice(0)).toBeNull();
    expect(api.getAiDestinationAdvice).toHaveBeenCalledTimes(1);
  });

  it('reads a call that is not the department’s (not_found, HTTP 200) or not visible (401) as unavailable', async () => {
    jest.mocked(api.getAiDestinationAdvice).mockResolvedValueOnce(notFound(null));
    expect(await store().fetchAdvice(12)).toMatchObject({ available: false, advice: null });

    jest.mocked(api.getAiDestinationAdvice).mockRejectedValueOnce(httpError(401));
    expect(await store().fetchAdvice(13)).toMatchObject({ available: false });
    expect(store().unsupported).toBe(false);
  });

  it('marks an older server without the endpoints (404) unsupported and asks nothing more', async () => {
    jest.mocked(api.getAiDestinationAdvice).mockRejectedValue(httpError(404));

    expect(await store().fetchAdvice(12)).toBeNull();
    expect(store().unsupported).toBe(true);
    expect(await store().fetchAdvice(14, { bypassCache: true })).toBeNull();
    expect(api.getAiDestinationAdvice).toHaveBeenCalledTimes(1);
    expect(await store().requestAdvice(12)).toEqual({ ok: false, error: 'unavailable' });
    expect(api.requestAiDestinationAdvice).not.toHaveBeenCalled();
  });

  it('keeps what was shown when the server cannot be reached', async () => {
    jest.mocked(api.getAiDestinationAdvice).mockResolvedValueOnce(answer({}));
    await store().fetchAdvice(12);

    jest.mocked(api.getAiDestinationAdvice).mockRejectedValueOnce(networkError());
    expect(await store().fetchAdvice(12, { bypassCache: true })).toMatchObject({ advice: expect.objectContaining({ Id: 'a1' }) });
  });

  it('applies the advice: the call’s open advice is gone and the outcome comes back', async () => {
    jest.mocked(api.getAiDestinationAdvice).mockResolvedValueOnce(answer({}));
    await store().fetchAdvice(12);
    jest.mocked(api.applyAiDestinationAdvice).mockResolvedValueOnce(answer({ Outcome: 'Applied', Advice: advice({ State: AiDestinationAdviceStates.Applied }) }));

    const pending = store().applyAdvice(12, 'a1');

    expect(store().busy['12']).toBe('apply');

    const result = await pending;

    expect(result).toEqual({ ok: true, outcome: 'Applied', advice: expect.objectContaining({ State: AiDestinationAdviceStates.Applied }) });
    expect(jest.mocked(api.applyAiDestinationAdvice).mock.calls[0][1]).toEqual({ AdviceId: 'a1' });
    expect(store().entries['12']).toMatchObject({ available: true, advice: null });
    expect(store().busy['12']).toBeUndefined();
  });

  it('dismisses with a trimmed reason of at most 200 characters, or none', async () => {
    jest.mocked(api.dismissAiDestinationAdvice).mockResolvedValue(answer({ Outcome: 'Dismissed', Advice: advice({ State: AiDestinationAdviceStates.Dismissed }) }));

    await store().dismissAdvice(12, 'a1', `  ${'x'.repeat(250)}  `);
    await store().dismissAdvice(12, 'a1', '   ');

    expect(jest.mocked(api.dismissAiDestinationAdvice).mock.calls[0][1]).toEqual({ AdviceId: 'a1', Reason: 'x'.repeat(200) });
    expect(jest.mocked(api.dismissAiDestinationAdvice).mock.calls[1][1]).toEqual({ AdviceId: 'a1', Reason: null });
    expect(store().entries['12']?.advice).toBeNull();
  });

  it('asks Enhanced AI: a busy model keeps the open advice; a department that lost the feature hides it', async () => {
    jest.mocked(api.requestAiDestinationAdvice).mockResolvedValueOnce(answer({ Outcome: 'Busy' }));

    expect(await store().requestAdvice(12)).toMatchObject({ ok: true, outcome: 'Busy' });
    expect(jest.mocked(api.requestAiDestinationAdvice).mock.calls[0][1]).toEqual({ CallId: 12 });
    expect(store().entries['12']).toMatchObject({ available: true, advice: expect.objectContaining({ Id: 'a1' }) });

    jest.mocked(api.requestAiDestinationAdvice).mockResolvedValueOnce(answer({ Available: false, Outcome: 'NotEntitled', Advice: null }));
    expect(await store().requestAdvice(12)).toMatchObject({ ok: true, outcome: 'NotEntitled' });
    expect(store().entries['12']).toMatchObject({ available: false, canApply: false, advice: null });
  });

  it('says why an action got no answer: offline, not allowed, failed', async () => {
    jest.mocked(api.applyAiDestinationAdvice).mockRejectedValueOnce(networkError());
    expect(await store().applyAdvice(12, 'a1')).toEqual({ ok: false, error: 'offline' });

    jest.mocked(api.applyAiDestinationAdvice).mockRejectedValueOnce(httpError(401));
    expect(await store().applyAdvice(12, 'a1')).toEqual({ ok: false, error: 'not_allowed' });

    jest.mocked(api.applyAiDestinationAdvice).mockResolvedValueOnce({ Data: null, Status: 'failure' });
    expect(await store().applyAdvice(12, 'a1')).toEqual({ ok: false, error: 'failed' });
    expect(store().busy).toEqual({});
  });

  it('reads the call again when the advice acted on was no longer open (a newer one may be)', async () => {
    jest.mocked(api.applyAiDestinationAdvice).mockResolvedValueOnce(answer({ Outcome: 'NotOpen', Advice: advice({ State: AiDestinationAdviceStates.Superseded }) }));
    jest.mocked(api.getAiDestinationAdvice).mockResolvedValueOnce(answer({ Advice: advice({ Id: 'a2' }) }));

    expect(await store().applyAdvice(12, 'a1')).toMatchObject({ ok: true, outcome: 'NotOpen' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(api.getAiDestinationAdvice).toHaveBeenCalledTimes(1);
    expect(store().entries['12']?.advice?.Id).toBe('a2');
  });

  it('never lets a read that left before an action bring back the advice it acted on', async () => {
    let resolveRead: (value: AiDestinationAdviceResult) => void = () => undefined;

    jest.mocked(api.getAiDestinationAdvice).mockImplementationOnce(() => new Promise<AiDestinationAdviceResult>((resolve) => (resolveRead = resolve)));
    jest.mocked(api.dismissAiDestinationAdvice).mockResolvedValueOnce(answer({ Outcome: 'Dismissed', Advice: advice({ State: AiDestinationAdviceStates.Dismissed }) }));

    const read = store().fetchAdvice(12);

    await store().dismissAdvice(12, 'a1');
    resolveRead(answer({}));
    await read;

    expect(store().entries['12']?.advice).toBeNull();
  });

  it('never lets a read refused (401/403) after an action left replace the advice the action brought', async () => {
    let refuseRead: () => void = () => undefined;

    jest.mocked(api.getAiDestinationAdvice).mockImplementationOnce(
      () =>
        new Promise<AiDestinationAdviceResult>((_resolve, reject) => {
          refuseRead = () => reject(httpError(403));
        })
    );
    jest.mocked(api.requestAiDestinationAdvice).mockResolvedValueOnce(answer({ Advice: advice({ Id: 'a2' }) }));

    const read = store().fetchAdvice(12);

    await store().requestAdvice(12);
    refuseRead();
    await read;

    expect(store().entries['12']).toMatchObject({ available: true, advice: expect.objectContaining({ Id: 'a2' }) });
  });

  it('forgets everything on reset (logout, department switch)', async () => {
    jest.mocked(api.getAiDestinationAdvice).mockRejectedValueOnce(httpError(404));
    await store().fetchAdvice(12);
    await defaultResetRegistry.getStoreResets().get('data.ai-destination-advice')?.('logout');

    expect(store()).toMatchObject({ entries: {}, unsupported: false, busy: {} });
  });
});
