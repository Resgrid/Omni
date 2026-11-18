import { createTestContext, httpError, lastRequest, ok } from '../../__tests__/helpers';
import * as api from '../../index';

const body = (config: { data?: unknown }) => JSON.parse(String(config.data));

describe('recurring calls (RecurringCalls v4)', () => {
  it('reads schedules, one schedule by query id, the form options and the calendar window', async () => {
    const { ctx, adapter } = createTestContext();
    await api.getRecurringCalls(ctx);
    expect(lastRequest(adapter)).toMatchObject({ method: 'get', url: '/RecurringCalls/GetRecurringCalls' });
    await api.getRecurringCall(ctx, { recurringCallId: 12 });
    expect(lastRequest(adapter).url).toBe('/RecurringCalls/GetRecurringCall?recurringCallId=12');
    await api.getRecurringCallOptions(ctx);
    expect(lastRequest(adapter).url).toBe('/RecurringCalls/GetRecurringCallOptions');
    await api.getScheduledCallsCalendar(ctx, { start: '2026-11-17T00:00:00Z', end: '2026-12-01T00:00:00Z' });
    expect(lastRequest(adapter).url).toBe('/RecurringCalls/GetScheduledCallsCalendar?start=2026-11-17T00%3A00%3A00Z&end=2026-12-01T00%3A00%3A00Z');
  });

  it('asks for open alerts only unless closed hours are given', async () => {
    const { ctx, adapter } = createTestContext();
    await api.getRecurringCallAlerts(ctx);
    expect(lastRequest(adapter).url).toBe('/RecurringCalls/GetRecurringCallAlerts');
    await api.getRecurringCallAlerts(ctx, { includeClosedHours: 24 });
    expect(lastRequest(adapter).url).toBe('/RecurringCalls/GetRecurringCallAlerts?includeClosedHours=24');
  });

  it('posts schedule writes, occurrence actions and alert actions as JSON', async () => {
    const { ctx, adapter } = createTestContext();
    const occurrence = { RecurringCallId: 4, OccurrenceOn: '2026-11-18T16:00:00Z' };

    await api.pauseRecurringCall(ctx, { RecurringCallId: 4, Reason: 'Holiday', ResumeOn: '2026-12-01', DeleteUpcomingCalls: true });
    expect(lastRequest(adapter)).toMatchObject({ method: 'post', url: '/RecurringCalls/PauseRecurringCall' });
    expect(body(lastRequest(adapter))).toEqual({ RecurringCallId: 4, Reason: 'Holiday', ResumeOn: '2026-12-01', DeleteUpcomingCalls: true });

    await api.resumeRecurringCall(ctx, { RecurringCallId: 4 });
    expect(lastRequest(adapter).url).toBe('/RecurringCalls/ResumeRecurringCall');
    await api.deleteRecurringCall(ctx, { RecurringCallId: 4, DeleteUpcomingCalls: false });
    expect(body(lastRequest(adapter))).toEqual({ RecurringCallId: 4, DeleteUpcomingCalls: false });

    for (const [action, path] of [
      [api.skipOccurrence, '/RecurringCalls/SkipOccurrence'],
      [api.restoreOccurrence, '/RecurringCalls/RestoreOccurrence'],
      [api.createOccurrenceCall, '/RecurringCalls/CreateOccurrenceCall'],
      [api.dispatchOccurrenceNow, '/RecurringCalls/DispatchOccurrenceNow'],
    ] as const) {
      await action(ctx, occurrence);
      expect(lastRequest(adapter)).toMatchObject({ method: 'post', url: path });
      expect(body(lastRequest(adapter))).toEqual(occurrence);
    }

    await api.acknowledgeRecurringCallAlert(ctx, { AlertId: 'a-1' });
    expect(lastRequest(adapter).url).toBe('/RecurringCalls/AcknowledgeRecurringCallAlert');
    await api.dismissRecurringCallAlert(ctx, { AlertId: 'a-1', Note: 'Covered' });
    expect(body(lastRequest(adapter))).toEqual({ AlertId: 'a-1', Note: 'Covered' });
  });

  it('saves a schedule and keeps the 400 validation body on the error', async () => {
    const { ctx, adapter } = createTestContext();
    adapter.mockImplementationOnce(async (config) => ok(config, { Status: 'success', Data: { RecurringCallId: 9, CreatedCalls: 2, ReplacedCalls: 0 }, Errors: [] }));

    const input = {
      RecurringCallId: 0,
      Name: 'Transfers',
      Frequency: 2,
      RepeatInterval: 1,
      Days: [2, 4],
      Times: ['08:00'],
      StartsOn: '2026-11-18',
      CreationMode: 0,
      UseRunCard: false,
      Priority: 1,
      CheckInTimersEnabled: false,
    };

    const saved = await api.saveRecurringCall(ctx, input);
    expect(body(lastRequest(adapter))).toEqual(input);
    expect(saved.Data?.RecurringCallId).toBe(9);

    adapter.mockImplementationOnce(async (config) => {
      throw httpError(config, 400, { Status: 'failure', Errors: [{ Key: 'ErrorDaysRequired', Message: 'Choose at least one day of the week.' }] });
    });
    await expect(api.saveRecurringCall(ctx, { ...input, Days: [] })).rejects.toMatchObject({ kind: 'http', status: 400, data: { Errors: [{ Key: 'ErrorDaysRequired' }] } });
  });

  it('caches nothing (dispatchers act on what is current)', () => {
    expect(Object.values(api.recurringCallsEndpoints).filter((definition) => definition.cacheTtlMs !== undefined)).toEqual([]);
  });
});
