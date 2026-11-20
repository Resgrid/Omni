import '../../calls/__tests__/test-setup';

import { ApiError } from '@resgrid/api';
import { type RecurringOccurrenceOutcome, usePoisStore, useRecurringCallsStore, useRoutesStore } from '@resgrid/data';
import { setDepartmentConfig } from '@resgrid/features/department-config';
import { RecurringCallCreationMode, type RecurringCallDetailResultData, RecurringCallFrequency, type RecurringCallResultData } from '@resgrid/models';
import { emitRealtimeEvent } from '@resgrid/realtime';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { activateVariant, hidden, setRights } from '../../calls/__tests__/test-utils';
import { registerCallFormHookPoints, resetCallFormHookPointsForTests } from '../../calls/hook-points';
import { PoiPickerModal } from '../components/poi-picker-modal';
import { agendaWindow, departmentDay } from '../lib/calendar-agenda';
import RecurringCallDetailScreen from '../screens/recurring-call-detail';
import RecurringCallFormScreen, { RecurringCallEditScreen } from '../screens/recurring-call-form';
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
  fetchRecurringCall: jest.fn(async (): Promise<RecurringCallDetailResultData | null> => null),
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
  resetCallFormHookPointsForTests();
  useRoutesStore.setState({ callRoutePlans: [], fetchCallRoutePlans: jest.fn(async () => undefined) });
  usePoisStore.setState({ destinationPois: [] });
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
    busyKeys: [],
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

  it('reads the schedules again on an alerts push (their open-alert counts), and names each row for screen readers', async () => {
    await render(<RecurringCallsScreen />);
    actions.fetchRecurringCalls.mockClear();

    await act(() => emitRealtimeEvent('recurringCallAlertsUpdated', '4', '{"alertId":"a9","kind":2,"raised":true}'));
    expect(actions.fetchRecurringCalls).toHaveBeenCalledWith({ bypassCache: true });
    expect(screen.getByTestId('recurring-call-1').props.accessibilityLabel).toMatch(/^Transfers 1 · recurring_calls\.status_active · recurring_calls\.facility_value:General Hospital · /);
  });

  it('asks again for options that failed to load when the list is refreshed', async () => {
    useRecurringCallsStore.setState({ schedules: [] });
    await render(<RecurringCallsScreen />);
    actions.fetchOptions.mockClear();

    await act(async () => fireEvent.press(screen.getByTestId('recurring-calls-empty-retry')));
    expect(actions.fetchRecurringCalls).toHaveBeenLastCalledWith({ bypassCache: true });
    expect(actions.fetchOptions).toHaveBeenCalledWith();
  });
});

describe('PoiPickerModal', () => {
  it('offers a retry instead of "none found" when the list could not be read', async () => {
    const onRetry = jest.fn();
    const { rerender } = await render(<PoiPickerModal isOpen onClose={jest.fn()} title="Facility" pois={[]} selectedId={null} onSelect={jest.fn()} loadFailed onRetry={onRetry} testID="picker" />);

    expect(screen.getByTestId('picker-error', hidden)).toHaveTextContent(/recurring_calls\.poi_load_error/);
    expect(screen.queryByTestId('picker-empty', hidden)).toBeNull();
    await fireEvent.press(screen.getByTestId('picker-retry', hidden));
    expect(onRetry).toHaveBeenCalled();

    await rerender(<PoiPickerModal isOpen onClose={jest.fn()} title="Facility" pois={[]} selectedId={null} onSelect={jest.fn()} testID="picker" />);
    expect(screen.getByTestId('picker-empty', hidden)).toBeTruthy();
  });
});

describe('RecurringCallFormScreen', () => {
  const detailOf = (overrides: Partial<RecurringCallResultData> = {}): RecurringCallDetailResultData => ({ RecurringCall: schedule(4, overrides), NextDispatches: [], UpcomingCalls: [] });

  it('shows what is missing before sending anything', async () => {
    await render(<RecurringCallFormScreen mode="create" />);
    await act(async () => fireEvent.press(screen.getByTestId('recurring-call-form-submit')));

    expect(actions.saveRecurringCall).not.toHaveBeenCalled();
    expect(screen.getByTestId('recurring-call-form-errors')).toBeTruthy();
    expect(screen.getByTestId('recurring-call-form-error-ErrorNameRequired')).toHaveTextContent('• recurring_calls.errors.name_required:52');
    expect(screen.getByTestId('recurring-call-form-error-ErrorDaysRequired')).toBeTruthy();
    expect(screen.getByTestId('recurring-call-form-error-ErrorTimesRequired')).toBeTruthy();
    expect(screen.getByTestId('recurring-call-form-times-error')).toHaveTextContent('recurring_calls.errors.times_required:52');
  });

  it('explains why the run card is off when the department has none', async () => {
    await render(<RecurringCallFormScreen mode="create" />);
    expect(screen.getByTestId('recurring-call-form-run-card-hint')).toHaveTextContent('recurring_calls.run_card_disabled_hint');
  });

  it('starts a new schedule from freshly read options and ignores an id on the create route', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '42' });
    actions.fetchOptions.mockImplementationOnce(async () => {
      useRecurringCallsStore.setState({ options: { ...OPTIONS, Today: '2026-11-18', DefaultLeadTimeMinutes: 60 } });

      return { ...OPTIONS, Today: '2026-11-18', DefaultLeadTimeMinutes: 60 };
    });
    await render(<RecurringCallFormScreen mode="create" />);

    expect(actions.fetchOptions).toHaveBeenCalledWith(true);
    expect(actions.fetchRecurringCall).not.toHaveBeenCalled();
    expect(screen.getByTestId('recurring-call-form-lead-time-60')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
  });

  it('starts over when the edit route is reused for another schedule', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '4' });
    actions.fetchRecurringCall.mockResolvedValueOnce(detailOf({ Name: 'Schedule four' }));
    const { rerender } = await render(<RecurringCallEditScreen />);

    expect(screen.getByTestId('recurring-call-form-name')).toHaveProp('value', 'Schedule four');

    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '5' });
    actions.fetchRecurringCall.mockResolvedValueOnce({ ...detailOf({ Name: 'Schedule five' }), RecurringCall: schedule(5, { Name: 'Schedule five' }) });
    await rerender(<RecurringCallEditScreen />);

    expect(actions.fetchRecurringCall).toHaveBeenLastCalledWith(5, { bypassCache: true });
    expect(screen.getByTestId('recurring-call-form-name')).toHaveProp('value', 'Schedule five');
  });

  it('edits nothing for an edit link without a valid schedule id', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'nope' });
    await render(<RecurringCallFormScreen mode="edit" />);

    expect(screen.getByTestId('recurring-call-form-invalid')).toBeTruthy();
    expect(screen.queryByTestId('recurring-call-form-submit')).toBeNull();
  });

  it('edits the schedule as the server has it now, not a cached copy', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '4' });
    useRecurringCallsStore.setState({ details: { '4': detailOf({ Name: 'Old name' }) } });
    actions.fetchRecurringCall.mockResolvedValueOnce(detailOf({ Name: 'Fresh name' }));
    await render(<RecurringCallFormScreen mode="edit" />);

    expect(screen.getByTestId('recurring-call-form-name')).toHaveProp('value', 'Fresh name');
  });

  it('shows the read error instead of a cached copy when the schedule cannot be read', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '4' });
    useRecurringCallsStore.setState({ details: { '4': detailOf() } });
    actions.fetchRecurringCall.mockImplementationOnce(async () => {
      useRecurringCallsStore.setState({ detailErrors: { '4': { code: 'not_found', messageKey: 'errors.data.not_found' } } });

      return null;
    });
    await render(<RecurringCallFormScreen mode="edit" />);

    expect(screen.getByTestId('recurring-call-form-load-error')).toHaveTextContent(/recurring_calls\.not_found/);
    expect(screen.queryByTestId('recurring-call-form-submit')).toBeNull();
  });

  it('is unavailable, not loading, where the app has no recurring calls', async () => {
    activateVariant('responder');
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '4' });
    await render(<RecurringCallFormScreen mode="edit" />);

    expect(screen.getByTestId('recurring-call-form-not-allowed')).toBeTruthy();
    expect(actions.fetchRecurringCall).not.toHaveBeenCalled();
  });

  it('keeps a schedule’s run card choice while the department has run cards off, without listing a run card as its dispatch', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '4' });
    actions.fetchRecurringCall.mockResolvedValueOnce(detailOf({ UseRunCard: true, DispatchUnitIds: [] }));
    await render(<RecurringCallFormScreen mode="edit" />);

    expect(screen.getByTestId('recurring-call-form-run-card')).toHaveProp('value', true);
    expect(screen.getByTestId('recurring-call-form-dispatch')).toHaveTextContent('recurring_calls.targets_none');

    await act(async () => fireEvent.press(screen.getByTestId('recurring-call-form-submit')));
    expect(actions.saveRecurringCall).toHaveBeenCalledWith(expect.objectContaining({ RecurringCallId: 4, UseRunCard: true }));
  });

  it('lets a facility name the form filled in follow the facility, and keeps one the dispatcher typed', async () => {
    // SAFETY: points of interest with only the fields the picker and the form read.
    const pois = [
      { PoiId: 1, Name: 'Station A', Address: null, PoiTypeName: null },
      { PoiId: 2, Name: 'Station B', Address: null, PoiTypeName: null },
    ] as never;

    usePoisStore.setState({ pois, fetchPois: jest.fn(async () => undefined) });
    await render(<RecurringCallFormScreen mode="create" />);

    const pick = async (poiId: number) => {
      await fireEvent.press(screen.getByTestId('recurring-call-form-facility-poi'));
      await fireEvent.press(screen.getByTestId(`recurring-call-facility-picker-poi-${poiId}`, hidden));
    };

    await pick(1);
    expect(screen.getByTestId('recurring-call-form-facility-name')).toHaveProp('value', 'Station A');
    await pick(2);
    expect(screen.getByTestId('recurring-call-form-facility-name')).toHaveProp('value', 'Station B');

    await fireEvent.changeText(screen.getByTestId('recurring-call-form-facility-name'), 'Ward 3 entrance');
    await pick(1);
    expect(screen.getByTestId('recurring-call-form-facility-name')).toHaveProp('value', 'Ward 3 entrance');
    usePoisStore.setState({ pois: [] });
  });

  it('edits a schedule and words the server’s validation keys', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '4' });
    useRecurringCallsStore.setState({ details: { '4': detailOf() } });
    actions.fetchRecurringCall.mockResolvedValueOnce(detailOf());
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

    await render(<RecurringCallFormScreen mode="edit" />);
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

  it('takes a free destination (address, point on the map) and a route; a destination POI replaces the free destination', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '4' });
    registerCallFormHookPoints({
      LocationPicker: ({ isOpen, onSelect }) => (isOpen ? <Text testID="map-picker" onPress={() => onSelect({ latitude: 39.35, longitude: -119.35 })} /> : null),
    });
    useRoutesStore.setState({
      callRoutePlans: [
        {
          RoutePlanId: 'rp-1',
          Name: 'Hydrant loop',
          Description: null,
          RouteColor: null,
          UnitId: null,
          StopsCount: 5,
          EstimatedDistanceMeters: null,
          EstimatedDurationSeconds: null,
          RoutingProfile: 0,
          Start: { Latitude: 39.1, Longitude: -119.1, DepartmentGroupId: null, Name: 'Station 1' },
          End: { Latitude: 39.2, Longitude: -119.2, DepartmentGroupId: null, Name: 'Dump site' },
          StartIsStop: false,
          EndIsStop: false,
        },
      ],
      fetchCallRoutePlans: jest.fn(async () => undefined),
    });
    // SAFETY: destinations with only the fields the picker and the form read.
    usePoisStore.setState({ destinationPois: [{ PoiId: 3, Name: 'Mercy Hospital', Address: null, PoiTypeName: null }] as never, fetchDestinationPois: jest.fn(async () => undefined) });
    const stored = detailOf({ DestinationAddress: '5 Oak Ave', DestinationGeoLocationData: '39.3,-119.3', RoutePlanId: 'rp-9', RoutePlanName: 'Old route' });

    useRecurringCallsStore.setState({ details: { '4': stored } });
    actions.fetchRecurringCall.mockResolvedValueOnce(stored);
    await render(<RecurringCallFormScreen mode="edit" />);

    expect(screen.getByTestId('recurring-call-form-destination-address')).toHaveProp('value', '5 Oak Ave');
    expect(screen.getByTestId('recurring-call-form-destination-location')).toHaveTextContent('recurring_calls.destination_location_set:39.30000,-119.30000');
    expect(screen.getByTestId('recurring-call-form-route')).toHaveTextContent('Old route');
    // Cleared, the stored route's name no longer shows as picked.
    await fireEvent.press(screen.getByTestId('recurring-call-form-route-clear'));
    expect(screen.getByTestId('recurring-call-form-route')).not.toHaveTextContent('Old route');
    expect(screen.getByTestId('recurring-call-form-facility-poi-hint')).toHaveTextContent('recurring_calls.facility_poi_hint');

    await fireEvent.press(screen.getByTestId('recurring-call-form-pick-destination-location'));
    await fireEvent.press(screen.getByTestId('map-picker'));
    await fireEvent.press(screen.getByTestId('recurring-call-form-route'));
    await fireEvent.press(screen.getByTestId('call-route-plan-rp-1', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('recurring-call-form-submit')));
    expect(actions.saveRecurringCall).toHaveBeenLastCalledWith(
      expect.objectContaining({ DestinationPoiId: null, DestinationAddress: '5 Oak Ave', DestinationGeoLocationData: '39.350000,-119.350000', RoutePlanId: 'rp-1' })
    );

    await fireEvent.press(screen.getByTestId('recurring-call-form-destination-poi'));
    await fireEvent.press(screen.getByTestId('recurring-call-destination-picker-poi-3', hidden));
    expect(screen.queryByTestId('recurring-call-form-destination-address')).toBeNull();
    expect(screen.getByTestId('recurring-call-form-destination-poi-wins')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('recurring-call-form-route-clear'));
    await act(async () => fireEvent.press(screen.getByTestId('recurring-call-form-submit')));
    expect(actions.saveRecurringCall).toHaveBeenLastCalledWith(expect.objectContaining({ DestinationPoiId: 3, DestinationAddress: null, DestinationGeoLocationData: null, RoutePlanId: null }));
  });

  it('refuses a schedule the person may not change', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '4' });
    useRecurringCallsStore.setState({ details: { '4': detailOf({ CanManage: false }) } });
    actions.fetchRecurringCall.mockResolvedValueOnce(detailOf({ CanManage: false }));
    await render(<RecurringCallFormScreen mode="edit" />);
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

  it('shows the free destination and the route each call runs (Core M0322)', async () => {
    showDetail({ DestinationAddress: '5 Oak Ave', DestinationGeoLocationData: '39.3,-119.3', RoutePlanId: 'rp-1', RoutePlanName: 'Hydrant loop' });
    await render(<RecurringCallDetailScreen />);

    expect(screen.getByTestId('recurring-call-destination-location')).toHaveTextContent(/5 Oak Ave · 39\.3,-119\.3/);
    expect(screen.getByTestId('recurring-call-route')).toHaveTextContent(/Hydrant loop/);
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

  it('keeps "Send call" a button of its own beside the held call’s row', async () => {
    showDetail();
    await render(<RecurringCallDetailScreen />);

    expect(screen.getByTestId('recurring-call-upcoming-55-send')).toBeTruthy();
    expect(within(screen.getByTestId('recurring-call-upcoming-55')).queryByTestId('recurring-call-upcoming-55-send')).toBeNull();
  });

  it('shows neither a cached schedule nor its actions where the app has no recurring calls', async () => {
    activateVariant('responder');
    showDetail();
    await render(<RecurringCallDetailScreen />);

    expect(screen.getByTestId('recurring-call-detail-disabled')).toBeTruthy();
    expect(screen.queryByTestId('recurring-call-edit')).toBeNull();
    expect(actions.fetchRecurringCall).not.toHaveBeenCalled();
  });
});

describe('RecurringCallsCalendarScreen', () => {
  const window = agendaWindow(departmentDay(NOW, null), null);

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

describe('RecurringCallFormScreen: suggested destinations (destination rules, Core M0317)', () => {
  // SAFETY: a destination with only the fields the panel and the form read.
  const hospital = (PoiId: number, Name: string) => ({ PoiId, Name, Address: '', PoiTypeName: 'Hospitals', Latitude: 39.2, Longitude: -119.8, IsDestination: true, CapabilityIds: [], Capabilities: [] }) as never;

  const suggestion = {
    Mode: 2,
    PreferredWithinMinutes: 3,
    SuggestedPoiId: 8,
    Requirements: { PoiTypeIds: [], RequiredCapabilityIds: [], PreferredCapabilityIds: [], Rules: [{ DestinationRuleId: 'r', Name: 'Dialysis', Reason: null }], SetAsideRules: [] },
    Destinations: [
      {
        Poi: hospital(8, 'Renal Center'),
        DistanceMeters: 4000,
        TravelSeconds: 600,
        TravelDistanceMeters: 5000,
        CanProvide: true,
        Status: 0,
        MeetsRequirements: true,
        MissingCapabilityIds: [],
        PreferredCapabilityIds: [],
        Tier: 0,
      },
    ],
  };

  afterEach(() => setDepartmentConfig(null));

  it('suggests destinations from the schedule’s location, type and priority, never fills one, and a pick replaces the free destination', async () => {
    // SAFETY: the config field the panel reads.
    setDepartmentConfig({ DestinationSuggestionMode: 2 } as never);
    const fetchSuggestedDestinations = jest.fn(async () => suggestion);

    // SAFETY: the mock answers with the suggestion fields the panel reads (its POI is a partial destination row).
    usePoisStore.setState({ destinationPois: [], fetchSuggestedDestinations: fetchSuggestedDestinations as never, fetchPoiCapabilities: jest.fn(async () => undefined), poiCapabilities: [] });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '4' });

    const stored: RecurringCallDetailResultData = {
      RecurringCall: schedule(4, { GeoLocationData: '39.14,-119.75', Type: 'Dialysis', Priority: 2, DestinationAddress: '5 Oak Ave', DestinationName: '' }),
      NextDispatches: [],
      UpcomingCalls: [],
    };

    useRecurringCallsStore.setState({ details: { '4': stored } });
    actions.fetchRecurringCall.mockResolvedValueOnce(stored);
    await render(<RecurringCallFormScreen mode="edit" />);

    await act(async () => new Promise((resolve) => setTimeout(resolve, 500)));
    expect(fetchSuggestedDestinations).toHaveBeenCalledWith(expect.objectContaining({ latitude: 39.14, longitude: -119.75, type: 'Dialysis', priority: 2, callId: null, unitId: null }), expect.anything());
    expect(screen.getByTestId('recurring-call-form-destination-suggestions-row-8')).toBeTruthy();
    // "Suggest and fill" never fills a schedule: each call is made from it later.
    expect(screen.getByTestId('recurring-call-form-destination-poi')).toHaveTextContent('recurring_calls.poi_none');
    expect(screen.getByTestId('recurring-call-form-destination-address')).toHaveProp('value', '5 Oak Ave');

    await fireEvent.press(screen.getByTestId('recurring-call-form-destination-suggestions-row-8-use'));
    expect(screen.getByTestId('recurring-call-form-destination-poi')).toHaveTextContent('Renal Center');
    expect(screen.queryByTestId('recurring-call-form-destination-address')).toBeNull();
    expect(screen.getByTestId('recurring-call-form-destination-name')).toHaveProp('value', 'Renal Center');

    await act(async () => fireEvent.press(screen.getByTestId('recurring-call-form-submit')));
    expect(actions.saveRecurringCall).toHaveBeenLastCalledWith(expect.objectContaining({ DestinationPoiId: 8, DestinationAddress: null, DestinationName: 'Renal Center' }));
  });
});
