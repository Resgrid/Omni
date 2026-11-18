import '../../calls/__tests__/test-setup';

import { ApiError } from '@resgrid/api';
import { type RecurringOccurrenceOutcome, useRecurringCallsStore } from '@resgrid/data';
import { RecurringCallCreationMode, RecurringCallFrequency, type RecurringCallResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { activateVariant, hidden, setRights } from '../../calls/__tests__/test-utils';
import { agendaWindow, startOfDay } from '../lib/calendar-agenda';
import RecurringCallDetailScreen from '../screens/recurring-call-detail';
import RecurringCallFormScreen from '../screens/recurring-call-form';
import RecurringCallsScreen from '../screens/recurring-calls';
import RecurringCallsCalendarScreen from '../screens/recurring-calls-calendar';

jest.mock('@resgrid/notifications', () => ({ notificationSoundService: { playForNotification: jest.fn(async () => undefined) } }));

const NOW = new Date(2026, 10, 17, 9, 0);

// SAFETY: every field of RecurringCallResultData the screens read, as Core sends them.
const schedule = (RecurringCallId: number, overrides: Partial<RecurringCallResultData> = {}): RecurringCallResultData =>
  ({
    RecurringCallId,
    Name: `Transfers ${RecurringCallId}`,
    Description: 'Dialysis transfers',
    IsActive: true,
    HasEnded: false,
    Frequency: RecurringCallFrequency.Weekly,
    RepeatInterval: 1,
    Days: [2, 4],
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
    NatureOfCall: 'Transfer',
    Notes: null,
    Address: '1 Main St',
    GeoLocationData: null,
    Priority: 1,
    Type: null,
    ContactName: null,
    ContactNumber: null,
    ExternalIdentifier: null,
    ReferenceNumber: null,
    IncidentNumber: null,
    MapPage: null,
    DestinationPoiId: null,
    CheckInTimersEnabled: false,
    ScheduleContactName: 'Ward 3',
    ScheduleContactNumber: '555-0100',
    ScheduleContactEmail: null,
    FacilityName: 'General Hospital',
    FacilityDetails: 'Bay 2',
    FacilityPoiId: null,
    DestinationName: 'Dialysis Center',
    DestinationDetails: null,
    DispatchUserIds: [],
    DispatchGroupIds: [],
    DispatchUnitIds: [7],
    DispatchRoleIds: [],
    AlertUserIds: [],
    AlertGroupIds: [],
    AlertRoleIds: [],
    PausedOn: null,
    PausedByUserId: null,
    PausedByName: null,
    PauseReason: null,
    ResumeOn: null,
    CreatedByUserId: 'u1',
    CreatedByName: 'Ann Lee',
    CreatedOn: '2026-11-01T10:00:00Z',
    UpdatedOn: null,
    NextDispatchOn: '2026-11-18T13:00:00Z',
    OpenAlertCount: 0,
    CanManage: true,
    ...overrides,
  }) as RecurringCallResultData;

const OPTIONS = {
  CanCreate: true,
  IsDepartmentAdmin: true,
  RunCardsEnabled: false,
  TimeZone: 'Eastern Standard Time',
  Today: '2026-11-17',
  DefaultLeadTimeMinutes: 1440,
  MinLeadTimeMinutes: 60,
  MaxLeadTimeMinutes: 20160,
  LeadTimeChoices: [60, 1440],
  DefaultManualAlertMinutes: 15,
  MaxManualAlertMinutes: 1440,
  ManualAlertChoices: [0, 15],
  MaxTimesPerDay: 24,
  MaxInterval: 52,
};

const actions = {
  fetchRecurringCalls: jest.fn(async () => undefined),
  fetchRecurringCall: jest.fn(async () => null),
  fetchOptions: jest.fn(async () => OPTIONS),
  fetchCalendar: jest.fn(async () => undefined),
  saveRecurringCall: jest.fn(async () => ({ RecurringCallId: 4, CreatedCalls: 0, ReplacedCalls: 1 })),
  pauseRecurringCall: jest.fn(async () => ({ ok: true, message: null, schedule: null, error: null })),
  resumeRecurringCall: jest.fn(async () => ({ ok: true, message: null, schedule: null, error: null })),
  deleteRecurringCall: jest.fn(async () => ({ ok: true, message: null, schedule: null, error: null })),
  runOccurrenceAction: jest.fn(async (): Promise<RecurringOccurrenceOutcome> => ({ ok: true, outcome: 'Held', callId: 55, callNumber: '26-55', callState: 8, error: null })),
};

beforeEach(() => {
  jest.clearAllMocks();
  activateVariant('dispatch');
  setRights({});
  useToastStore.setState({ toasts: [] });
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  useRecurringCallsStore.setState({
    schedules: [schedule(1), schedule(2, { IsActive: false, OpenAlertCount: 2, FacilityName: null })],
    details: {},
    detailErrors: {},
    options: OPTIONS,
    calendar: [],
    calendarWindow: null,
    busyKey: null,
    loading: {},
    errors: {},
    fetchedAt: { list: 1, options: 1 },
    ...actions,
  });
});

afterEach(() => useToastStore.getState().clearToasts());

describe('RecurringCallsScreen', () => {
  it('lists schedules with status, mode, facility, next dispatch and open alerts, and filters by status', async () => {
    await render(<RecurringCallsScreen />);

    expect(actions.fetchRecurringCalls).toHaveBeenCalledWith({ bypassCache: true });
    expect(screen.getByText('Transfers 1')).toBeTruthy();
    expect(screen.getByTestId('recurring-call-1-status')).toHaveTextContent('recurring_calls.status_active');
    expect(screen.getByTestId('recurring-call-2-status')).toHaveTextContent('recurring_calls.status_paused');
    expect(screen.getByTestId('recurring-call-1-mode')).toHaveTextContent('recurring_calls.mode_automatic');
    expect(screen.getByTestId('recurring-call-1-facility')).toHaveTextContent('recurring_calls.facility_value:General Hospital');
    expect(screen.getByTestId('recurring-call-2-alerts')).toHaveTextContent('recurring_calls.open_alerts:2');

    await fireEvent.press(screen.getByTestId('recurring-calls-filter-paused'));
    expect(screen.queryByTestId('recurring-call-1')).toBeNull();
    expect(screen.getByTestId('recurring-call-2')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('recurring-call-2'));
    expect(router.push).toHaveBeenCalledWith('/recurring-calls/2');
  });

  it('offers a new schedule only to those who can create calls', async () => {
    const { unmount } = await render(<RecurringCallsScreen />);
    await fireEvent.press(screen.getByTestId('recurring-calls-new'));
    expect(router.push).toHaveBeenCalledWith('/recurring-calls/new');
    await unmount();

    useRecurringCallsStore.setState({ options: { ...OPTIONS, CanCreate: false } });
    await render(<RecurringCallsScreen />);
    expect(screen.queryByTestId('recurring-calls-new')).toBeNull();
  });

  it('is unavailable where the app has no recurring calls', async () => {
    activateVariant('responder');
    await render(<RecurringCallsScreen />);
    expect(screen.getByTestId('recurring-calls-disabled')).toBeTruthy();
    expect(actions.fetchRecurringCalls).not.toHaveBeenCalled();
  });
});

describe('RecurringCallFormScreen', () => {
  it('shows what is missing before sending anything', async () => {
    await render(<RecurringCallFormScreen />);
    await act(async () => fireEvent.press(screen.getByTestId('recurring-call-form-submit')));

    expect(actions.saveRecurringCall).not.toHaveBeenCalled();
    expect(screen.getByTestId('recurring-call-form-errors')).toBeTruthy();
    expect(screen.getByTestId('recurring-call-form-error-ErrorNameRequired')).toHaveTextContent('• recurring_calls.errors.name_required:52');
    expect(screen.getByTestId('recurring-call-form-error-ErrorDaysRequired')).toBeTruthy();
    expect(screen.getByTestId('recurring-call-form-error-ErrorTimesRequired')).toBeTruthy();
    expect(screen.getByTestId('recurring-call-form-times-error')).toHaveTextContent('recurring_calls.errors.times_required:52');
  });

  it('explains why the run card is off when the department has none', async () => {
    await render(<RecurringCallFormScreen />);
    expect(screen.getByTestId('recurring-call-form-run-card-hint')).toHaveTextContent('recurring_calls.run_card_disabled_hint');
  });

  it('edits a schedule and words the server’s validation keys', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '4' });
    useRecurringCallsStore.setState({ details: { '4': { RecurringCall: schedule(4), NextDispatches: [], UpcomingCalls: [] } } });
    actions.saveRecurringCall.mockRejectedValueOnce(
      new ApiError({
        kind: 'http',
        status: 400,
        data: {
          Errors: [
            { Key: 'NewCallField_contactName', Message: 'Contact name is required' },
            { Key: 'ErrorBrandNew', Message: 'Something new.' },
          ],
        },
      })
    );

    await render(<RecurringCallFormScreen />);
    expect(screen.getByTestId('recurring-call-form-name')).toHaveProp('value', 'Transfers 4');
    await fireEvent.changeText(screen.getByTestId('recurring-call-form-name'), 'Dialysis transfers');
    await act(async () => fireEvent.press(screen.getByTestId('recurring-call-form-submit')));

    expect(actions.saveRecurringCall).toHaveBeenCalledWith(
      expect.objectContaining({ RecurringCallId: 4, Name: 'Dialysis transfers', Days: [2, 4], Times: ['08:00', '13:00'], DispatchUnitIds: [7], ReplaceUpcomingCalls: true })
    );
    expect(screen.getByTestId('recurring-call-form-error-NewCallField_contactName')).toHaveTextContent('• recurring_calls.errors.new_call_field:calls.contact_name');
    expect(screen.getByTestId('recurring-call-form-error-ErrorBrandNew')).toHaveTextContent('• Something new.');
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error', message: 'recurring_calls.errors.fix_form' });

    await act(async () => fireEvent.press(screen.getByTestId('recurring-call-form-submit')));
    expect(useToastStore.getState().toasts.some((toast) => toast.message === 'recurring_calls.save_success_edit')).toBe(true);
    expect(router.back).toHaveBeenCalled();
  });

  it('refuses a schedule the person may not change', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '4' });
    useRecurringCallsStore.setState({ details: { '4': { RecurringCall: schedule(4, { CanManage: false }), NextDispatches: [], UpcomingCalls: [] } } });
    await render(<RecurringCallFormScreen />);
    expect(screen.getByTestId('recurring-call-form-not-allowed')).toBeTruthy();
  });
});

describe('RecurringCallDetailScreen', () => {
  const showDetail = (overrides: Partial<RecurringCallResultData> = {}) =>
    useRecurringCallsStore.setState({
      details: {
        '4': {
          RecurringCall: schedule(4, overrides),
          NextDispatches: ['2026-11-18T13:00:00Z'],
          UpcomingCalls: [{ CallId: 55, Number: '26-55', Name: 'Transfer', DispatchOn: null, IsHeld: true }],
        },
      },
    });

  beforeEach(() => jest.mocked(useLocalSearchParams).mockReturnValue({ id: '4' }));

  it('describes the schedule in words, its details and the calls waiting to go out', async () => {
    showDetail();
    await render(<RecurringCallDetailScreen />);

    expect(actions.fetchRecurringCall).toHaveBeenCalledWith(4, { bypassCache: true });
    expect(screen.getByTestId('recurring-call-pattern')).toHaveTextContent(/recurring_calls\.pattern_at:recurring_calls\.pattern_weekly:1,Tue, Thu,08:00, 13:00/);
    expect(screen.getByTestId('recurring-call-mode')).toHaveTextContent('recurring_calls.mode_automatic_summary:recurring_calls.duration_days:1');
    expect(screen.getByTestId('recurring-call-facility')).toHaveTextContent(/General Hospital · Bay 2/);
    expect(screen.getByTestId('recurring-call-contact')).toHaveTextContent(/Ward 3 · 555-0100/);
    expect(screen.getByTestId('recurring-call-upcoming-55')).toHaveTextContent(/recurring_calls\.upcoming_held/);

    await fireEvent.press(screen.getByTestId('recurring-call-upcoming-55'));
    expect(router.push).toHaveBeenCalledWith('/call/55');
  });

  it('pauses with a reason, keeping the waiting calls unless asked', async () => {
    showDetail();
    await render(<RecurringCallDetailScreen />);
    await fireEvent.press(screen.getByTestId('recurring-call-pause'));
    await fireEvent.changeText(screen.getByTestId('pause-recurring-call-dialog-reason', hidden), ' Holiday ');
    await act(async () => fireEvent.press(screen.getByTestId('pause-recurring-call-dialog-confirm', hidden)));

    expect(actions.pauseRecurringCall).toHaveBeenCalledWith({ RecurringCallId: 4, Reason: 'Holiday', ResumeOn: null, DeleteUpcomingCalls: false });
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'success', message: 'recurring_calls.pause_success' });
  });

  it('shows why it is paused and resumes it', async () => {
    showDetail({ IsActive: false, PausedByName: 'Ann Lee', PauseReason: 'Holiday', ResumeOn: '2026-12-01' });
    await render(<RecurringCallDetailScreen />);

    expect(screen.getByTestId('recurring-call-paused')).toHaveTextContent(/recurring_calls\.paused_reason:Holiday/);
    expect(screen.queryByTestId('recurring-call-pause')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('recurring-call-resume')));
    expect(actions.resumeRecurringCall).toHaveBeenCalledWith(4);
  });

  it('deletes it with its waiting calls by default, and hides management from others', async () => {
    showDetail();
    const { unmount } = await render(<RecurringCallDetailScreen />);
    await fireEvent.press(screen.getByTestId('recurring-call-delete'));
    await act(async () => fireEvent.press(screen.getByTestId('recurring-call-delete-confirm-confirm', hidden)));
    expect(actions.deleteRecurringCall).toHaveBeenCalledWith(4, true);
    expect(router.back).toHaveBeenCalled();
    await unmount();

    showDetail({ CanManage: false });
    await render(<RecurringCallDetailScreen />);
    expect(screen.queryByTestId('recurring-call-edit')).toBeNull();
    expect(screen.queryByTestId('recurring-call-delete')).toBeNull();
  });

  it('says when the schedule is gone', async () => {
    useRecurringCallsStore.setState({ detailErrors: { '4': { code: 'not_found', messageKey: 'errors.data.not_found' } } });
    await render(<RecurringCallDetailScreen />);
    expect(screen.getByTestId('recurring-call-detail-error')).toHaveTextContent(/recurring_calls\.not_found/);
  });
});

describe('RecurringCallsCalendarScreen', () => {
  const window = agendaWindow(startOfDay(NOW));

  const projected = {
    Kind: 'Projected',
    KindId: 4,
    DispatchOn: '2026-11-18T18:00:00Z',
    DispatchOnLocal: '2026-11-18T13:00:00',
    OccurrenceOn: '2026-11-18T18:00:00Z',
    Name: 'Transfer',
    Priority: 1,
    Address: '1 Main St',
    CallId: null,
    CallNumber: null,
    RecurringCallId: 4,
    ScheduleName: 'Transfers 4',
  };

  const skipped = { ...projected, Kind: 'Skipped', KindId: 5, DispatchOnLocal: '2026-11-19T08:00:00', OccurrenceOn: '2026-11-19T13:00:00Z' };
  const key = '4-2026-11-18T18:00:00Z-0-4';

  beforeEach(() => useRecurringCallsStore.setState({ calendar: [projected, skipped], calendarWindow: window }));

  it('lists occurrences by department day and sends one now after asking (Held reported as held)', async () => {
    await render(<RecurringCallsCalendarScreen now={() => NOW} />);

    expect(actions.fetchCalendar).toHaveBeenCalledWith(window, { bypassCache: true });
    expect(screen.getByTestId('calendar-day-2026-11-18')).toBeTruthy();
    expect(screen.getByTestId(`calendar-entry-${key}-kind`)).toHaveTextContent('recurring_calls.calendar.kind_projected');
    expect(screen.getByTestId('calendar-entry-4-2026-11-19T13:00:00Z-0-5-actions-restore')).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`calendar-entry-${key}-actions-dispatch`));
    expect(actions.runOccurrenceAction).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByTestId('occurrence-send-confirm-confirm', hidden)));

    expect(actions.runOccurrenceAction).toHaveBeenCalledWith('dispatch', { RecurringCallId: 4, OccurrenceOn: '2026-11-18T18:00:00Z' });
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'warning', message: 'recurring_calls.occurrence.held:26-55' });
  });

  it('skips without asking, and offers nothing to those who cannot create calls', async () => {
    actions.runOccurrenceAction.mockResolvedValueOnce({ ok: true, outcome: 'Skipped', callId: null, callNumber: null, callState: null, error: null });
    const { unmount } = await render(<RecurringCallsCalendarScreen now={() => NOW} />);
    await act(async () => fireEvent.press(screen.getByTestId(`calendar-entry-${key}-actions-skip`)));
    expect(actions.runOccurrenceAction).toHaveBeenCalledWith('skip', { RecurringCallId: 4, OccurrenceOn: '2026-11-18T18:00:00Z' });
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'success', message: 'recurring_calls.occurrence.skipped' });
    await unmount();

    useRecurringCallsStore.setState({ options: { ...OPTIONS, CanCreate: false } });
    await render(<RecurringCallsCalendarScreen now={() => NOW} />);
    expect(screen.queryByTestId(`calendar-entry-${key}-actions-dispatch`)).toBeNull();
  });

  it('narrows to one schedule from the route', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ recurringCallId: '9' });
    await render(<RecurringCallsCalendarScreen now={() => NOW} />);
    expect(screen.getByTestId('calendar-filter')).toBeTruthy();
    expect(screen.getByTestId('recurring-calls-calendar-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('calendar-filter-clear'));
    expect(screen.getByTestId('calendar-day-2026-11-18')).toBeTruthy();
  });
});
