import {
  acknowledgeRecurringCallAlert,
  ApiError,
  dismissRecurringCallAlert,
  dispatchOccurrenceNow,
  getRecurringCall,
  getRecurringCallAlerts,
  getRecurringCallOptions,
  getRecurringCalls,
  getScheduledCallsCalendar,
  pauseRecurringCall,
  saveRecurringCall,
  skipOccurrence,
} from '@resgrid/api';
import {
  RecurringCallActionResult,
  type RecurringCallAlertResultData,
  RecurringCallAlertsResult,
  RecurringCallOccurrenceResult,
  RecurringCallOptionsResult,
  RecurringCallResult,
  type RecurringCallResultData,
  RecurringCallsResult,
  SaveRecurringCallResult,
  type ScheduledCallCalendarEntryData,
  ScheduledCallsCalendarResult,
} from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, flush, httpError, persisted } from '../../__tests__/helpers';
import { selectBadgeCount, useBadgeCountsStore } from '../../badge-counts/badge-counts-store';
import { useCallsStore } from '../../calls/calls-store';
import { findNewAlertIds, sortRecurringCallAlerts, useRecurringCallAlertsStore } from '../recurring-call-alerts-store';
import { recurringOccurrenceKey, useRecurringCallsStore } from '../recurring-calls-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getRecurringCalls: jest.fn(),
  getRecurringCall: jest.fn(),
  getRecurringCallOptions: jest.fn(),
  getScheduledCallsCalendar: jest.fn(),
  saveRecurringCall: jest.fn(),
  pauseRecurringCall: jest.fn(),
  resumeRecurringCall: jest.fn(),
  deleteRecurringCall: jest.fn(),
  skipOccurrence: jest.fn(),
  restoreOccurrence: jest.fn(),
  createOccurrenceCall: jest.fn(),
  dispatchOccurrenceNow: jest.fn(),
  getRecurringCallAlerts: jest.fn(),
  acknowledgeRecurringCallAlert: jest.fn(),
  dismissRecurringCallAlert: jest.fn(),
}));

/** A Core result class filled the way Core answers (`Status` and `Data`, plus any other fields). */
const answer = <R extends { Status: string }>(result: R, fields: Partial<R>): R => Object.assign(result, { Status: 'success' }, fields);

const schedule = (RecurringCallId: number, overrides: Partial<RecurringCallResultData> = {}): RecurringCallResultData => ({
  RecurringCallId,
  Name: `Transfers ${RecurringCallId}`,
  Description: null,
  IsActive: true,
  HasEnded: false,
  Frequency: 2,
  RepeatInterval: 1,
  Days: [2, 4],
  MonthlyDay: 0,
  MonthlyWeek: 0,
  MonthlyWeekday: 0,
  Times: ['08:00'],
  StartsOn: '2026-11-18',
  EndsOn: null,
  LeadTimeMinutes: 1440,
  CreationMode: 0,
  ManualAlertMinutes: 15,
  UseRunCard: false,
  NatureOfCall: null,
  Notes: null,
  Address: null,
  GeoLocationData: null,
  Priority: 0,
  Type: null,
  ContactName: null,
  ContactNumber: null,
  ExternalIdentifier: null,
  ReferenceNumber: null,
  IncidentNumber: null,
  MapPage: null,
  DestinationPoiId: null,
  CheckInTimersEnabled: false,
  ScheduleContactName: null,
  ScheduleContactNumber: null,
  ScheduleContactEmail: null,
  FacilityName: null,
  FacilityDetails: null,
  FacilityPoiId: null,
  DestinationName: null,
  DestinationDetails: null,
  DispatchUserIds: [],
  DispatchGroupIds: [],
  DispatchUnitIds: [],
  DispatchRoleIds: [],
  AlertUserIds: [],
  AlertGroupIds: [],
  AlertRoleIds: [],
  PausedOn: null,
  PausedByUserId: null,
  PausedByName: null,
  PauseReason: null,
  ResumeOn: null,
  CreatedByUserId: null,
  CreatedByName: null,
  CreatedOn: null,
  UpdatedOn: null,
  NextDispatchOn: null,
  OpenAlertCount: 0,
  CanManage: true,
  ...overrides,
});

const alert = (AlertId: string, overrides: Partial<RecurringCallAlertResultData> = {}): RecurringCallAlertResultData => ({
  AlertId,
  RecurringCallId: 4,
  ScheduleName: 'Transfers',
  DispatcherMode: false,
  ScheduleDeleted: false,
  Kind: 'NoResources',
  KindId: 3,
  Reason: null,
  OccurrenceOn: '2026-11-18T16:00:00Z',
  OccurrenceOnLocal: '2026-11-18T08:00:00',
  CallId: null,
  CallNumber: null,
  CallState: null,
  CallDispatched: false,
  UnavailableUnits: [],
  UnavailablePeople: [],
  CreatedOn: null,
  AcknowledgedOn: null,
  AcknowledgedByUserId: null,
  AcknowledgedByName: null,
  IsOpen: true,
  ResolvedOn: null,
  Resolution: null,
  ResolvedByName: null,
  ResolutionNote: null,
  CanSend: false,
  CanAct: true,
  ...overrides,
});

const entry = (KindId: number, DispatchOnLocal: string): ScheduledCallCalendarEntryData => ({
  Kind: 'Projected',
  KindId,
  DispatchOn: '',
  DispatchOnLocal,
  OccurrenceOn: null,
  Name: null,
  Priority: 0,
  Address: null,
  CallId: null,
  CallNumber: null,
  RecurringCallId: 4,
  ScheduleName: null,
});

const alertsAnswer = (alerts: RecurringCallAlertResultData[]): RecurringCallAlertsResult => answer(new RecurringCallAlertsResult(), { Data: alerts });

const actionAnswer = (fields: Partial<RecurringCallActionResult>): RecurringCallActionResult => answer(new RecurringCallActionResult(), { Success: true, ...fields });

let runtime: DataTestRuntime;

const reset = async (name: string) => defaultResetRegistry.getStoreResets().get(name)?.('logout');

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'dispatch' });
  await reset('data.recurring-calls');
  await reset('data.recurring-call-alerts');
  await reset('data.badge-counts');
  jest.mocked(getRecurringCalls).mockResolvedValue(answer(new RecurringCallsResult(), { Data: [schedule(1), schedule(2)] }));
  jest.mocked(getRecurringCallAlerts).mockResolvedValue(alertsAnswer([]));
  jest.mocked(getScheduledCallsCalendar).mockResolvedValue(answer(new ScheduledCallsCalendarResult(), { Data: [] }));
  useCallsStore.setState({ refreshQueuedCallLists: jest.fn(async () => undefined), fetchCalls: jest.fn(async () => undefined) });
});

describe('recurring calls store', () => {
  it('loads the schedules and persists them', async () => {
    await useRecurringCallsStore.getState().fetchRecurringCalls();

    expect(useRecurringCallsStore.getState().schedules.map((item) => item.RecurringCallId)).toEqual([1, 2]);
    expect(persisted(runtime.kv, 'omni-recurring-calls-storage')?.state.schedules).toHaveLength(2);
  });

  it('keeps a schedule detail, and drops it once the server says it is gone', async () => {
    jest.mocked(getRecurringCall).mockResolvedValueOnce(answer(new RecurringCallResult(), { Data: { RecurringCall: schedule(4), NextDispatches: ['2026-11-18T16:00:00Z'], UpcomingCalls: [] } }));
    await useRecurringCallsStore.getState().fetchRecurringCall(4);

    expect(useRecurringCallsStore.getState().details['4']?.NextDispatches).toHaveLength(1);
    expect(getRecurringCall).toHaveBeenCalledWith(expect.anything(), { recurringCallId: 4 });

    jest.mocked(getRecurringCall).mockRejectedValueOnce(httpError(404));
    await useRecurringCallsStore.getState().fetchRecurringCall(4, { bypassCache: true });

    expect(useRecurringCallsStore.getState().details['4']).toBeUndefined();
    expect(useRecurringCallsStore.getState().detailErrors['4']?.code).toBe('not_found');
  });

  it('reads the form options once per session unless forced', async () => {
    jest.mocked(getRecurringCallOptions).mockResolvedValue(
      answer(new RecurringCallOptionsResult(), {
        Data: {
          CanCreate: true,
          IsDepartmentAdmin: false,
          RunCardsEnabled: false,
          TimeZone: null,
          Today: '2026-11-17',
          DefaultLeadTimeMinutes: 1440,
          MinLeadTimeMinutes: 60,
          MaxLeadTimeMinutes: 20160,
          LeadTimeChoices: [],
          DefaultManualAlertMinutes: 15,
          MaxManualAlertMinutes: 1440,
          ManualAlertChoices: [],
          MaxTimesPerDay: 24,
          MaxInterval: 52,
        },
      })
    );
    await useRecurringCallsStore.getState().fetchOptions();
    await useRecurringCallsStore.getState().fetchOptions();

    expect(getRecurringCallOptions).toHaveBeenCalledTimes(1);
    expect(useRecurringCallsStore.getState().options?.CanCreate).toBe(true);

    await useRecurringCallsStore.getState().fetchOptions(true);

    expect(getRecurringCallOptions).toHaveBeenCalledTimes(2);
  });

  it('shows only the calendar window the screen asked for last', async () => {
    let answerFirst: (value: ScheduledCallsCalendarResult) => void = () => undefined;

    jest
      .mocked(getScheduledCallsCalendar)
      .mockImplementationOnce(() => new Promise<ScheduledCallsCalendarResult>((resolve) => (answerFirst = resolve)))
      .mockResolvedValueOnce(answer(new ScheduledCallsCalendarResult(), { Data: [entry(4, '2026-12-01T08:00:00')] }));
    const first = useRecurringCallsStore.getState().fetchCalendar({ start: 'a', end: 'b' });

    await useRecurringCallsStore.getState().fetchCalendar({ start: 'c', end: 'd' });
    answerFirst(answer(new ScheduledCallsCalendarResult(), { Data: [entry(1, '2026-11-17T08:00:00')] }));
    await first;

    expect(useRecurringCallsStore.getState().calendarWindow).toEqual({ start: 'c', end: 'd' });
    expect(useRecurringCallsStore.getState().calendar.map((item) => item.KindId)).toEqual([4]);
  });

  it('passes a refused save through with its validation keys, and refreshes after a saved one', async () => {
    const input = { RecurringCallId: 0, Name: '', Frequency: 2, RepeatInterval: 1, Times: [], StartsOn: '', CreationMode: 0, UseRunCard: false, Priority: 0, CheckInTimersEnabled: false };

    jest.mocked(saveRecurringCall).mockRejectedValueOnce(new ApiError({ kind: 'http', status: 400, data: { Errors: [{ Key: 'ErrorNameRequired', Message: 'A name is required.' }] } }));
    await expect(useRecurringCallsStore.getState().saveRecurringCall(input)).rejects.toMatchObject({ status: 400 });

    expect(useRecurringCallsStore.getState().busyKey).toBeNull();

    jest.mocked(saveRecurringCall).mockResolvedValueOnce(answer(new SaveRecurringCallResult(), { Data: { RecurringCallId: 7, CreatedCalls: 1, ReplacedCalls: 0 } }));
    await expect(useRecurringCallsStore.getState().saveRecurringCall({ ...input, Name: 'Transfers' })).resolves.toMatchObject({ RecurringCallId: 7 });
    await flush();

    expect(getRecurringCalls).toHaveBeenCalled();
    expect(useCallsStore.getState().refreshQueuedCallLists).toHaveBeenCalled();
  });

  it('pauses with a reason and resume date, reporting the outcome', async () => {
    jest.mocked(pauseRecurringCall).mockResolvedValueOnce(actionAnswer({ Data: schedule(4, { IsActive: false }) }));
    const outcome = await useRecurringCallsStore.getState().pauseRecurringCall({ RecurringCallId: 4, Reason: 'Holiday', ResumeOn: '2026-12-01', DeleteUpcomingCalls: false });

    expect(pauseRecurringCall).toHaveBeenCalledWith(expect.anything(), { RecurringCallId: 4, Reason: 'Holiday', ResumeOn: '2026-12-01', DeleteUpcomingCalls: false });
    expect(outcome).toMatchObject({ ok: true, schedule: { IsActive: false } });

    jest.mocked(pauseRecurringCall).mockRejectedValueOnce(httpError(401));

    expect(await useRecurringCallsStore.getState().pauseRecurringCall({ RecurringCallId: 4, DeleteUpcomingCalls: false })).toMatchObject({ ok: false, error: { code: 'unauthorized' } });
  });

  it('sends an occurrence now and reads Held as a held call, then refreshes alerts and queues', async () => {
    const occurrence = { RecurringCallId: 4, OccurrenceOn: '2026-11-18T16:00:00Z' };

    jest.mocked(dispatchOccurrenceNow).mockImplementationOnce(async () => {
      expect(useRecurringCallsStore.getState().busyKey).toBe(recurringOccurrenceKey(occurrence));

      return answer(new RecurringCallOccurrenceResult(), {
        Success: true,
        Data: { Outcome: 'Held', CallId: 55, CallNumber: '26-55', CallState: 8, UnavailableUnitIds: [3], UnavailableUserIds: [], RunCardApplied: false },
      });
    });
    const outcome = await useRecurringCallsStore.getState().runOccurrenceAction('dispatch', occurrence);

    await flush();

    expect(outcome).toMatchObject({ ok: true, outcome: 'Held', callId: 55, callNumber: '26-55', callState: 8 });
    expect(getRecurringCallAlerts).toHaveBeenCalled();
    expect(useCallsStore.getState().refreshQueuedCallLists).toHaveBeenCalled();
    expect(useRecurringCallsStore.getState().busyKey).toBeNull();

    jest.mocked(skipOccurrence).mockRejectedValueOnce(httpError(404));

    expect(await useRecurringCallsStore.getState().runOccurrenceAction('skip', occurrence)).toMatchObject({ ok: false, error: { code: 'not_found' } });
  });

  it('clears everything on sign-out', async () => {
    await useRecurringCallsStore.getState().fetchRecurringCalls();
    await reset('data.recurring-calls');

    expect(useRecurringCallsStore.getState().schedules).toEqual([]);
  });
});

describe('recurring call alerts store', () => {
  it('orders open alerts: not yet acknowledged first, then by occurrence', () => {
    const sorted = sortRecurringCallAlerts([
      alert('a', { AcknowledgedOn: '2026-11-17T10:00:00Z', OccurrenceOn: '2026-11-17T08:00:00Z' }),
      alert('b', { OccurrenceOn: '2026-11-18T08:00:00Z' }),
      alert('c', { OccurrenceOn: '2026-11-17T09:00:00Z' }),
    ]);

    expect(sorted.map((item) => item.AlertId)).toEqual(['c', 'b', 'a']);
    expect(findNewAlertIds(null, [alert('x')])).toEqual([]);
    expect(findNewAlertIds([alert('x')], [alert('x'), alert('y')])).toEqual(['y']);
  });

  it('raises nothing on the first answer, marks later arrivals new until seen, and counts the badge', async () => {
    jest.mocked(getRecurringCallAlerts).mockResolvedValueOnce(alertsAnswer([alert('a')]));
    await useRecurringCallAlertsStore.getState().fetchAlerts();

    expect(useRecurringCallAlertsStore.getState()).toMatchObject({ newAlertIds: [], lastNewAt: 0 });
    expect(selectBadgeCount('recurringCallAlerts')(useBadgeCountsStore.getState())).toBe(1);

    jest.mocked(getRecurringCallAlerts).mockResolvedValueOnce(alertsAnswer([alert('a'), alert('b'), alert('closed', { IsOpen: false })]));
    await useRecurringCallAlertsStore.getState().fetchAlerts({ bypassCache: true });

    expect(useRecurringCallAlertsStore.getState().alerts.map((item) => item.AlertId)).toEqual(['a', 'b']);
    expect(useRecurringCallAlertsStore.getState().newAlertIds).toEqual(['b']);
    expect(useRecurringCallAlertsStore.getState().lastNewAt).toBeGreaterThan(0);
    expect(useBadgeCountsStore.getState().recurringCallAlerts).toBe(2);
    expect(persisted(runtime.kv, 'omni-recurring-call-alerts-storage')?.state.alerts).toHaveLength(2);

    useRecurringCallAlertsStore.getState().markAlertsSeen();

    expect(useRecurringCallAlertsStore.getState().newAlertIds).toEqual([]);
  });

  it('acknowledges and dismisses (with a trimmed note), reading the list again after each', async () => {
    jest.mocked(acknowledgeRecurringCallAlert).mockResolvedValueOnce(actionAnswer({}));
    jest.mocked(dismissRecurringCallAlert).mockResolvedValueOnce(actionAnswer({ Message: 'Closed' }));

    expect(await useRecurringCallAlertsStore.getState().acknowledgeAlert('a')).toMatchObject({ ok: true });
    expect(acknowledgeRecurringCallAlert).toHaveBeenCalledWith(expect.anything(), { AlertId: 'a' });
    expect(await useRecurringCallAlertsStore.getState().dismissAlert('a', '  covered  ')).toMatchObject({ ok: true, message: 'Closed' });
    expect(dismissRecurringCallAlert).toHaveBeenCalledWith(expect.anything(), { AlertId: 'a', Note: 'covered' });

    await flush();

    expect(getRecurringCallAlerts).toHaveBeenCalledTimes(2);
  });

  it('stops asking an older server without recurring calls', async () => {
    jest.mocked(getRecurringCallAlerts).mockRejectedValueOnce(httpError(404));
    await useRecurringCallAlertsStore.getState().fetchAlerts();

    expect(useRecurringCallAlertsStore.getState().unsupported).toBe(true);

    await useRecurringCallAlertsStore.getState().fetchAlerts({ bypassCache: true });

    expect(getRecurringCallAlerts).toHaveBeenCalledTimes(1);
  });

  it('is cleared when disabled and on sign-out', async () => {
    jest.mocked(getRecurringCallAlerts).mockResolvedValue(alertsAnswer([alert('a')]));
    await useRecurringCallAlertsStore.getState().fetchAlerts();
    useRecurringCallAlertsStore.getState().disable();

    expect(useRecurringCallAlertsStore.getState().alerts).toEqual([]);
    expect(useBadgeCountsStore.getState().recurringCallAlerts).toBe(0);

    await useRecurringCallAlertsStore.getState().fetchAlerts();
    await reset('data.recurring-call-alerts');

    expect(useRecurringCallAlertsStore.getState().alerts).toEqual([]);
  });
});
