import '../../calls/__tests__/test-setup';

import { ApiError } from '@resgrid/api';
import { RecurringCallCreationMode, RecurringCallFrequency, type RecurringCallResultData } from '@resgrid/models';

import { alertKindLabelKey, alertReasonLabelKey, alertTone, isHeldCall, unavailableNames } from '../lib/alert-format';
import { addDays, agendaRange, agendaWindow, groupAgenda, occurrenceActionsFor } from '../lib/calendar-agenda';
import { readSaveErrors } from '../lib/save-errors';
import { addTime, describeSaveError, emptyRecurringCallForm, errorField, scheduleToFormValues, toRecurringCallInput, validateRecurringCallForm } from '../lib/schedule-form';
import { describeMode, describePattern, describeSchedule, formatAlertLead, formatMinutes, recurringCallStatus, wallClockTime } from '../lib/schedule-format';
import { summarizeNames, targetNames } from '../lib/targets';
import { recurringCallsNav } from '../nav';
import { recurringCallsRoutes } from '../routes';

/** Keys come back with their values appended, like the features' i18n mock. */
const t = (key: string, options?: Record<string, string | number>): string => (options ? `${key}:${Object.values(options).join(',')}` : key);

// SAFETY: a schedule with the fields the wording and form helpers read; the rest of the result is not used by them.
const schedule = (overrides: Partial<RecurringCallResultData> = {}): RecurringCallResultData =>
  ({
    RecurringCallId: 4,
    Name: 'Transfers',
    Description: null,
    IsActive: true,
    HasEnded: false,
    Frequency: RecurringCallFrequency.Weekly,
    RepeatInterval: 1,
    Days: [4, 2],
    MonthlyDay: 0,
    MonthlyWeek: 0,
    MonthlyWeekday: 0,
    Times: ['08:00', '13:00'],
    StartsOn: '2026-11-18',
    EndsOn: null,
    LeadTimeMinutes: 1440,
    CreationMode: RecurringCallCreationMode.Automatic,
    ManualAlertMinutes: 15,
    UseRunCard: false,
    Priority: 1,
    DispatchUserIds: ['u1'],
    DispatchGroupIds: [2],
    DispatchUnitIds: [7],
    DispatchRoleIds: [],
    AlertUserIds: [],
    AlertGroupIds: [3],
    AlertRoleIds: [],
    ...overrides,
  }) as RecurringCallResultData;

describe('schedule wording', () => {
  it('says how often it repeats, at what times and between which dates', () => {
    expect(describePattern(schedule(), t, 'en')).toBe('recurring_calls.pattern_weekly:1,Tue, Thu');
    expect(describePattern(schedule({ RepeatInterval: 2 }), t, 'en')).toBe('recurring_calls.pattern_weekly_interval:2,Tue, Thu');
    expect(describePattern(schedule({ Frequency: RecurringCallFrequency.Daily }), t, 'en')).toBe('recurring_calls.pattern_daily:1');
    expect(describePattern(schedule({ Frequency: RecurringCallFrequency.Monthly, MonthlyDay: 15 }), t, 'en')).toBe('recurring_calls.pattern_monthly_day:1,15');
    expect(describePattern(schedule({ Frequency: RecurringCallFrequency.Monthly, MonthlyWeek: 5, MonthlyWeekday: 5 }), t, 'en')).toBe('recurring_calls.pattern_monthly_weekday:1,recurring_calls.week_last,Friday');
    expect(describeSchedule(schedule({ EndsOn: '2027-01-31' }), t, 'en')).toMatch(/^recurring_calls\.pattern_at:recurring_calls\.pattern_weekly:1,Tue, Thu,08:00, 13:00\. recurring_calls\.range_between:/);
  });

  it('says how the calls are made', () => {
    expect(describeMode(schedule(), t)).toBe('recurring_calls.mode_automatic_summary:recurring_calls.duration_days:1');
    expect(describeMode(schedule({ CreationMode: RecurringCallCreationMode.Dispatcher, ManualAlertMinutes: 0 }), t)).toBe('recurring_calls.mode_dispatcher_summary_at_time');
    expect(formatMinutes(120, t)).toBe('recurring_calls.duration_hours:2');
    expect(formatMinutes(45, t)).toBe('recurring_calls.duration_minutes:45');
    expect(formatAlertLead(0, t)).toBe('recurring_calls.alert_at_time');
  });

  it('reads the status, and wall clock times without any zone shift', () => {
    expect(recurringCallStatus(schedule())).toBe('active');
    expect(recurringCallStatus(schedule({ IsActive: false }))).toBe('paused');
    expect(recurringCallStatus(schedule({ IsActive: false, HasEnded: true }))).toBe('ended');
    expect(wallClockTime('2026-11-18T08:00:00')).toBe('08:00');
  });
});

describe('schedule form', () => {
  it('starts blank on the department’s today with its defaults', () => {
    expect(emptyRecurringCallForm({ DefaultLeadTimeMinutes: 120, DefaultManualAlertMinutes: 30, Today: '2026-11-17' }, 2)).toMatchObject({
      startsOn: '2026-11-17',
      leadTimeMinutes: 120,
      manualAlertMinutes: 30,
      priority: 2,
    });
  });

  it('checks what it can before sending, with Core’s keys', () => {
    const blank = emptyRecurringCallForm(null, 0);
    expect(validateRecurringCallForm(blank, null)).toEqual(['ErrorNameRequired', 'ErrorDaysRequired', 'ErrorTimesRequired', 'ErrorStartsOnRequired']);
    expect(validateRecurringCallForm({ ...scheduleToFormValues(schedule()), endsOn: '2026-01-01', repeatInterval: '99' }, { MaxTimesPerDay: 24, MaxInterval: 52 })).toEqual([
      'ErrorIntervalInvalid',
      'ErrorEndsBeforeStart',
    ]);
    expect(validateRecurringCallForm({ ...scheduleToFormValues(schedule()), frequency: RecurringCallFrequency.Monthly, monthlyMode: 'date', monthlyDay: '32' }, null)).toEqual(['ErrorMonthlyDayInvalid']);
    expect(validateRecurringCallForm({ ...scheduleToFormValues(schedule()), scheduleContactEmail: 'nope' }, null)).toEqual(['ErrorContactEmailInvalid']);
  });

  it('round-trips a schedule into Core’s input, sending only the fields its pattern and mode use', () => {
    const values = scheduleToFormValues(schedule({ FacilityName: 'General Hospital', DestinationPoiId: 9 }));
    const input = toRecurringCallInput(values, 4);

    expect(input).toMatchObject({
      RecurringCallId: 4,
      Name: 'Transfers',
      Frequency: RecurringCallFrequency.Weekly,
      Days: [2, 4],
      MonthlyDay: 0,
      MonthlyWeek: 0,
      Times: ['08:00', '13:00'],
      LeadTimeMinutes: 1440,
      ManualAlertMinutes: null,
      FacilityName: 'General Hospital',
      DestinationPoiId: 9,
      DispatchUserIds: ['u1'],
      DispatchGroupIds: [2],
      DispatchUnitIds: [7],
      AlertGroupIds: [3],
      IsActive: null,
      ReplaceUpcomingCalls: true,
    });

    const monthly = toRecurringCallInput(
      { ...values, frequency: RecurringCallFrequency.Monthly, monthlyMode: 'weekday', monthlyWeek: 5, monthlyWeekday: 1, creationMode: RecurringCallCreationMode.Dispatcher, startPaused: true },
      0
    );

    expect(monthly).toMatchObject({ RecurringCallId: 0, Days: [], MonthlyDay: 0, MonthlyWeek: 5, MonthlyWeekday: 1, LeadTimeMinutes: null, ManualAlertMinutes: 15, IsActive: false, ReplaceUpcomingCalls: undefined });
    expect(addTime(['13:00'], '08:00')).toEqual(['08:00', '13:00']);
    expect(addTime(['08:00'], '08:00')).toEqual(['08:00']);
  });

  it('words Core’s validation keys, the department’s required fields and unknown keys', () => {
    expect(describeSaveError({ Key: 'ErrorDaysRequired', Message: 'x' }, t, null)).toBe('recurring_calls.errors.days_required:52');
    expect(describeSaveError({ Key: 'ErrorTooManyTimes', Message: null }, t, { MaxTimesPerDay: 12, MaxInterval: 52 })).toBe('recurring_calls.errors.too_many_times:12');
    expect(describeSaveError({ Key: 'NewCallField_address', Message: 'Address is required' }, t, null)).toBe('recurring_calls.errors.new_call_field:calls.address');
    expect(describeSaveError({ Key: 'ErrorSomethingNew', Message: 'Core says no.' }, t, null)).toBe('Core says no.');
    expect(errorField('ErrorTimesRequired')).toBe('times');
    expect(errorField('NewCallField_address')).toBe('call');
  });

  it('reads the 400 body at the boundary and nothing else', () => {
    const refused = new ApiError({ kind: 'http', status: 400, data: { Status: 'failure', Errors: [{ Key: 'ErrorNameRequired', Message: 'A name is required.' }, { Key: 'NewCallField_address' }] } });
    expect(readSaveErrors(refused)).toEqual([
      { Key: 'ErrorNameRequired', Message: 'A name is required.' },
      { Key: 'NewCallField_address', Message: null },
    ]);
    expect(readSaveErrors(new ApiError({ kind: 'http', status: 400, data: 'Bad request' }))).toEqual([]);
    expect(readSaveErrors(new ApiError({ kind: 'http', status: 500, data: { Errors: [{ Key: 'X' }] } }))).toEqual([]);
    expect(readSaveErrors(new ApiError({ kind: 'network' }))).toEqual([]);
  });

  it('names who is dispatched, keeping ids nobody lists any more', () => {
    // SAFETY: recipient lists with only the id and name fields the names are read from.
    const recipients = { personnel: [{ UserId: 'u1', FirstName: 'Ann', LastName: 'Lee' }], groups: [{ GroupId: '2', Name: 'Station 2' }], roles: [], units: [{ UnitId: '7', Name: 'Medic 7' }] } as never;
    expect(targetNames({ users: ['u1', 'gone'], groups: ['2'], roles: [], units: ['7'] }, recipients)).toEqual(['Ann Lee', 'gone', 'Station 2', 'Medic 7']);
    expect(summarizeNames([], 'none')).toBe('none');
    expect(summarizeNames(['a', 'b', 'c', 'd', 'e', 'f'], 'none')).toBe('a, b, c, d +2');
  });
});

describe('alerts and the calendar agenda', () => {
  it('words alerts by kind and reason', () => {
    expect(alertKindLabelKey({ KindId: 3 })).toBe('recurring_calls.alerts.kind_no_resources');
    expect(alertKindLabelKey({ KindId: 99 })).toBe('recurring_calls.alerts.kind_other');
    expect(alertReasonLabelKey({ Reason: 'NoneAvailable' })).toBe('recurring_calls.alerts.reason_none_available');
    expect(alertReasonLabelKey({ Reason: 'Future' })).toBeNull();
    expect(alertTone({ KindId: 5 })).toBe('info');
    expect(alertTone({ KindId: 4 })).toBe('warning');
    expect(isHeldCall({ CallId: 9, CallState: 8 })).toBe(true);
    expect(unavailableNames({ UnavailableUnits: [{ Id: '3', Name: 'Medic 3' }], UnavailablePeople: [{ Id: 'u2', Name: null }] })).toBe('Medic 3, u2');
  });

  it('groups entries by the department day and offers the occurrence actions Core allows', () => {
    // SAFETY: calendar entries with only the fields the agenda groups and acts on.
    const entries = [
      { KindId: 4, DispatchOnLocal: '2026-11-18T13:00:00', DispatchOn: '', RecurringCallId: 4, OccurrenceOn: '2026-11-18T18:00:00Z', CallId: null },
      { KindId: 1, DispatchOnLocal: '2026-11-18T08:00:00', DispatchOn: '', RecurringCallId: 4, OccurrenceOn: '2026-11-18T13:00:00Z', CallId: 12 },
      { KindId: 5, DispatchOnLocal: '2026-11-19T08:00:00', DispatchOn: '', RecurringCallId: 6, OccurrenceOn: '2026-11-19T13:00:00Z', CallId: null },
    ] as never;

    expect(groupAgenda(entries).map((day) => [day.day, day.entries.map((entry) => entry.KindId)])).toEqual([
      ['2026-11-18', [1, 4]],
      ['2026-11-19', [5]],
    ]);
    expect(groupAgenda(entries, 6).map((day) => day.day)).toEqual(['2026-11-19']);
    expect(occurrenceActionsFor({ KindId: 4, RecurringCallId: 4, OccurrenceOn: 'x', CallId: null })).toEqual(['dispatch', 'create', 'skip']);
    expect(occurrenceActionsFor({ KindId: 7, RecurringCallId: 4, OccurrenceOn: 'x', CallId: null })).toEqual(['dispatch', 'create', 'skip']);
    expect(occurrenceActionsFor({ KindId: 5, RecurringCallId: 4, OccurrenceOn: 'x', CallId: null })).toEqual(['restore']);
    expect(occurrenceActionsFor({ KindId: 8, RecurringCallId: 4, OccurrenceOn: 'x', CallId: 3 })).toEqual([]);
    expect(occurrenceActionsFor({ KindId: 1, RecurringCallId: null, OccurrenceOn: null, CallId: 3 })).toEqual([]);
  });

  it('asks for two weeks plus yesterday, within Core’s 100-day limit', () => {
    const from = new Date(2026, 10, 17, 15, 30);
    const window = agendaWindow(from);
    expect(new Date(window.start).getTime()).toBe(new Date(2026, 10, 16).getTime());
    expect(new Date(window.end).getTime()).toBe(addDays(new Date(2026, 10, 17), 14).getTime());
    expect(agendaRange(from)).toEqual({ first: '2026-11-16', last: '2026-11-30' });
  });
});

describe('routes and nav', () => {
  it('builds schedule paths and refuses junk ids', () => {
    expect(recurringCallsRoutes.detail(4)).toBe('/recurring-calls/4');
    expect(recurringCallsRoutes.edit('4')).toBe('/recurring-calls/4/edit');
    expect(recurringCallsRoutes.detail('../x')).toBeNull();
    expect(recurringCallsRoutes.calendar(4)).toBe('/recurring-calls/calendar?recurringCallId=4');
    expect(recurringCallsRoutes.calendar()).toBe('/recurring-calls/calendar');
    expect(recurringCallsRoutes.alerts()).toBe('/recurring-call-alerts');
  });

  it('declares the capability-gated entries, the alerts one with its count', () => {
    expect(recurringCallsNav.map((entry) => [entry.id, entry.href, entry.badge])).toEqual([
      ['recurring-calls', '/recurring-calls', undefined],
      ['recurring-call-alerts', '/recurring-call-alerts', 'recurringCallAlerts'],
    ]);
    // SAFETY: the entries read capabilities.calls.recurringCalls only.
    expect(recurringCallsNav.every((entry) => entry.requiresCapability?.({ calls: { recurringCalls: false } } as never) === false)).toBe(true);
    // SAFETY: as above.
    expect(recurringCallsNav.every((entry) => entry.requiresCapability?.({ calls: { recurringCalls: true } } as never) === true)).toBe(true);
  });
});
