import type { DispatcherDeskActionResult } from '@resgrid/models';

import { createTestContext, httpError, lastRequest } from '../../__tests__/helpers';
import * as api from '../../index';

const body = (config: { data?: unknown }) => JSON.parse(String(config.data));

describe('dispatcher desk (DispatcherDesk v4)', () => {
  it('reads the board, the queue, one item by query id, coverage, breaks, rosters, stats and config', async () => {
    const { ctx, adapter } = createTestContext();
    await api.getDispatcherDesk(ctx);
    expect(lastRequest(adapter)).toMatchObject({ method: 'get', url: '/DispatcherDesk/GetDesk' });
    await api.getDispatcherQueue(ctx);
    expect(lastRequest(adapter).url).toBe('/DispatcherDesk/GetQueue');
    await api.getDispatcherQueueItem(ctx, { itemId: 'q-1' });
    expect(lastRequest(adapter).url).toBe('/DispatcherDesk/GetItem?itemId=q-1');
    await api.getDispatcherCoverage(ctx);
    expect(lastRequest(adapter).url).toBe('/DispatcherDesk/GetCoverage');
    await api.getDispatcherCoverage(ctx, { from: '2026-11-19T06:00:00Z', to: '2026-11-20T06:00:00Z', slotMinutes: 15 });
    expect(lastRequest(adapter).url).toBe('/DispatcherDesk/GetCoverage?from=2026-11-19T06%3A00%3A00Z&to=2026-11-20T06%3A00%3A00Z&slotMinutes=15');
    await api.getDispatcherBreaks(ctx, { from: '2026-11-19T06:00:00Z' });
    expect(lastRequest(adapter).url).toBe('/DispatcherDesk/GetBreaks?from=2026-11-19T06%3A00%3A00Z');
    await api.getShiftDispatchers(ctx, { shiftId: 3, shiftDayId: 44 });
    expect(lastRequest(adapter).url).toBe('/DispatcherDesk/GetShiftDispatchers?shiftId=3&shiftDayId=44');
    await api.getDispatcherStats(ctx);
    expect(lastRequest(adapter).url).toBe('/DispatcherDesk/GetStats');
    await api.getDispatcherDeskConfig(ctx);
    expect(lastRequest(adapter).url).toBe('/DispatcherDesk/GetConfig');
  });

  it('posts presence actions, the bodyless ones without a body', async () => {
    const { ctx, adapter } = createTestContext();

    await api.signInToDispatcherDesk(ctx, { DeviceKind: 'phone', CallbackNumber: '+15555550100', Unscheduled: true, DutyEndsOn: null });
    expect(lastRequest(adapter)).toMatchObject({ method: 'post', url: '/DispatcherDesk/SignIn' });
    expect(body(lastRequest(adapter))).toEqual({ DeviceKind: 'phone', CallbackNumber: '+15555550100', Unscheduled: true, DutyEndsOn: null });
    // Desk writes route inside the request: they wait longer than a read before giving up, unless the caller says otherwise.
    expect(lastRequest(adapter).timeout).toBe(api.DESK_WRITE_TIMEOUT_MS);
    await api.signInToDispatcherDesk(ctx, { DeviceKind: 'phone', CallbackNumber: null, Unscheduled: false, DutyEndsOn: null }, { timeoutMs: 5_000 });
    expect(lastRequest(adapter).timeout).toBe(5_000);
    await api.getDispatcherDesk(ctx);
    expect(lastRequest(adapter).timeout).toBe(api.DEFAULT_TIMEOUT_MS);

    for (const [action, path] of [
      [api.signOffDispatcherDesk, '/DispatcherDesk/SignOff'],
      [api.sendDispatcherDeskHeartbeat, '/DispatcherDesk/Heartbeat'],
      [api.setDispatcherAvailable, '/DispatcherDesk/SetAvailable'],
    ] as const) {
      await action(ctx);
      expect(lastRequest(adapter)).toMatchObject({ method: 'post', url: path });
      expect(lastRequest(adapter).data).toBeUndefined();
    }

    await api.setDispatcherAway(ctx, { Reason: 'Radio check' });
    expect(body(lastRequest(adapter))).toEqual({ Reason: 'Radio check' });
    await api.setDispatcherCallbackNumber(ctx, { CallbackNumber: '+15555550100' });
    expect(lastRequest(adapter).url).toBe('/DispatcherDesk/SetCallbackNumber');
    await api.registerDispatcherDeskDevice(ctx, { Platform: 2, Token: 'fcm-token' });
    expect(lastRequest(adapter).url).toBe('/DispatcherDesk/RegisterDevice');
    expect(body(lastRequest(adapter))).toEqual({ Platform: 2, Token: 'fcm-token' });
    await api.unregisterDispatcherDeskDevice(ctx, { Platform: 2, Token: 'fcm-token' });
    expect(lastRequest(adapter).url).toBe('/DispatcherDesk/UnregisterDevice');
  });

  it('posts item, conversation, voice, break and roster actions as JSON', async () => {
    const { ctx, adapter } = createTestContext();

    const sent = async (call: () => Promise<DispatcherDeskActionResult>, path: string, input: Readonly<Record<string, string | number | boolean | null>>) => {
      await call();
      expect(lastRequest(adapter)).toMatchObject({ method: 'post', url: path });
      expect(body(lastRequest(adapter))).toEqual(input);
    };

    const item = { ItemId: 'q-1' };
    const decline = { ItemId: 'q-1', Reason: 'Busy' };
    const transfer = { ItemId: 'q-1', ToUserId: 'u-2', Note: null };
    const complete = { ItemId: 'q-1', Outcome: 2, CallId: 9 };
    const link = { ItemId: 'q-1', CallId: 9 };
    const reply = { ItemId: 'q-1', Body: 'Help is on the way' };
    const note = { ItemId: 'q-1', Body: 'Caller sounded calm' };
    const voice = { ItemId: 'q-1', CallbackNumber: null };
    const plannedBreak = { BreakType: 2, ScheduledStartOn: '2026-11-19T18:00:00Z', DurationMinutes: 30 };
    const breakId = { DispatcherBreakId: 'b-1' };
    const startBreak = { BreakType: 1, DurationMinutes: 15, ReturnWork: true };
    const endBreak = { UserId: null };
    const plan = { ShiftDayId: 44, Replace: false };
    const day = { ShiftDayId: 44 };
    const assign = { ShiftDayId: 44, UserId: 'u-2', IsSupervisor: true };

    await sent(() => api.acceptDispatcherItem(ctx, item), '/DispatcherDesk/AcceptItem', item);
    await sent(() => api.declineDispatcherItem(ctx, decline), '/DispatcherDesk/DeclineItem', decline);
    await sent(() => api.releaseDispatcherItem(ctx, item), '/DispatcherDesk/ReleaseItem', item);
    await sent(() => api.transferDispatcherItem(ctx, transfer), '/DispatcherDesk/TransferItem', transfer);
    await sent(() => api.completeDispatcherItem(ctx, complete), '/DispatcherDesk/CompleteItem', complete);
    await sent(() => api.linkDispatcherItemCall(ctx, link), '/DispatcherDesk/LinkCall', link);
    await sent(() => api.sendDispatcherMessage(ctx, reply), '/DispatcherDesk/SendMessage', reply);
    await sent(() => api.addDispatcherNote(ctx, note), '/DispatcherDesk/AddNote', note);
    await sent(() => api.connectDispatcherVoice(ctx, voice), '/DispatcherDesk/ConnectVoice', voice);
    await sent(() => api.callBackDispatcherCaller(ctx, item), '/DispatcherDesk/CallBack', item);
    await sent(() => api.saveDispatcherBreak(ctx, plannedBreak), '/DispatcherDesk/SaveBreak', plannedBreak);
    await sent(() => api.cancelDispatcherBreak(ctx, breakId), '/DispatcherDesk/CancelBreak', breakId);
    await sent(() => api.startDispatcherBreak(ctx, startBreak), '/DispatcherDesk/StartBreak', startBreak);
    await sent(() => api.endDispatcherBreak(ctx, endBreak), '/DispatcherDesk/EndBreak', endBreak);
    await sent(() => api.planDispatcherBreaks(ctx, plan), '/DispatcherDesk/PlanBreaks', plan);
    await sent(() => api.signupToDispatchForDay(ctx, day), '/DispatcherDesk/SignupForDay', day);
    await sent(() => api.withdrawFromDispatchDay(ctx, day), '/DispatcherDesk/WithdrawFromDay', day);
    await sent(() => api.assignDispatcherToDay(ctx, assign), '/DispatcherDesk/AssignToDay', assign);
    await sent(() => api.removeDispatcherFromDay(ctx, assign), '/DispatcherDesk/RemoveFromDay', assign);
  });

  it('reads a refusal Core answers with a 4xx desk body as the refusal it names, and throws anything else', async () => {
    const { ctx, adapter } = createTestContext();

    adapter.mockImplementationOnce(async (config) => Promise.reject(httpError(config, 409, { Success: false, Error: 'CoverageTooLow' })));
    await expect(api.startDispatcherBreak(ctx, { BreakType: 1, DurationMinutes: 15 })).resolves.toMatchObject({ Success: false, Error: 'CoverageTooLow' });

    adapter.mockImplementationOnce(async (config) => Promise.reject(httpError(config, 404)));
    await expect(api.sendDispatcherDeskHeartbeat(ctx)).rejects.toMatchObject({ kind: 'http', status: 404 });

    adapter.mockImplementationOnce(async (config) => Promise.reject(httpError(config, 503, { Error: 'Busy' })));
    await expect(api.acceptDispatcherItem(ctx, { ItemId: 'q-1' })).rejects.toMatchObject({ kind: 'http', status: 503 });

    // Core answers NotADispatcher as a 403 with a desk body: a refusal. A 401 stays an error whatever its body says.
    adapter.mockImplementationOnce(async (config) => Promise.reject(httpError(config, 403, { Success: false, Error: 'NotADispatcher' })));
    await expect(api.signInToDispatcherDesk(ctx, { DeviceKind: 'phone' })).resolves.toMatchObject({ Success: false, Error: 'NotADispatcher' });

    adapter.mockImplementationOnce(async (config) => Promise.reject(httpError(config, 401, { type: 'https://resgrid.com/problems/session', Error: 'NotADispatcher' })));
    await expect(api.acceptDispatcherItem(ctx, { ItemId: 'q-1' })).rejects.toMatchObject({ kind: 'http', status: 401 });
  });

  it('unregisters the desk device as an ended session straight to the server, quietly', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    try {
      await expect(api.unregisterDispatcherDeskDeviceForEndedSession({ baseUrl: 'https://api.example.com/api/v4/', accessToken: 'ended' }, { Platform: 1, Token: 'apns' })).resolves.toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.com/api/v4/DispatcherDesk/UnregisterDevice',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ Platform: 1, Token: 'apns' }), headers: expect.objectContaining({ Authorization: 'Bearer ended' }) })
      );

      fetchMock.mockRejectedValueOnce(new Error('offline'));
      await expect(api.unregisterDispatcherDeskDeviceForEndedSession({ baseUrl: 'https://api.example.com/api/v4', accessToken: 'ended' }, { Platform: 1, Token: 'apns' })).resolves.toBe(false);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
