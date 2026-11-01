/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run before imports, so they require their stand-ins. */
import './test-setup';

import { useCalendarStore, usePersonnelStore } from '@resgrid/data';
import { type CalendarItemResultData, type PersonnelInfoResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { CalendarItemDetailsSheet } from '../components/calendar-item-details-sheet';
import { buildMarkedDates } from '../components/month-calendar';
import { canSignUp, isDateInRange, itemDays, monthRange, resolveAllDayEndDate, todayKey, upcomingRange } from '../lib/calendar-dates';
import { calendarNav } from '../nav';
import CalendarScreen from '../screens/calendar';

jest.mock('react-native-calendars', () => {
  const mockReact = require('react');
  const { View, Pressable, Text } = require('react-native');
  const MockCalendar = ({ onDayPress, onMonthChange, markedDates, testID }: { onDayPress: (day: object) => void; onMonthChange: (month: object) => void; markedDates?: Record<string, unknown>; testID?: string }) => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return mockReact.createElement(
      View,
      { testID },
      mockReact.createElement(Pressable, { testID: 'mock-calendar-today', onPress: () => onDayPress({ dateString: today, day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear(), timestamp: 0 }) }),
      mockReact.createElement(Pressable, { testID: 'mock-calendar-month', onPress: () => onMonthChange({ dateString: '2030-02-01', day: 1, month: 2, year: 2030, timestamp: 0 }) }),
      mockReact.createElement(
        Text,
        { testID: 'mock-calendar-marked' },
        Object.keys(markedDates ?? {})
          .sort()
          .join(',')
      )
    );
  };
  return { Calendar: MockCalendar };
});

const q = { includeHiddenElements: true } as const;

const item = (CalendarItemId: string, extra: Partial<CalendarItemResultData> = {}): CalendarItemResultData =>
  ({
    CalendarItemId,
    Title: `Event ${CalendarItemId}`,
    Start: `${todayKey()}T09:30:00`,
    End: `${todayKey()}T11:00:00`,
    IsAllDay: false,
    Description: '',
    Location: '',
    SignupType: 0,
    LockEditing: false,
    Attending: false,
    TypeName: '',
    TypeColor: '',
    CreatorUserId: '',
    Attendees: [],
    ...extra,
  }) as CalendarItemResultData;

const fetchers = {
  fetchTodaysItems: jest.fn(async () => undefined),
  fetchUpcomingItems: jest.fn(async () => undefined),
  fetchItemsForDateRange: jest.fn(async () => undefined),
  fetchCalendarItem: jest.fn(async () => null),
  setAttendance: jest.fn(async () => true),
};

beforeEach(() => {
  Object.values(fetchers).forEach((fn) => fn.mockClear());
  fetchers.setAttendance.mockImplementation(async () => true);
  useToastStore.getState().clearToasts();
  useCalendarStore.setState({ todayItems: [], upcomingItems: [], rangeItems: [], itemDetailsById: {}, loading: {}, errors: {}, attendanceError: null, ...fetchers });
  usePersonnelStore.setState({ personnel: [{ UserId: 'creator', FirstName: 'Robin', LastName: 'Ray' } as PersonnelInfoResultData], loading: {}, fetchPersonnel: jest.fn(async () => undefined) });
});

describe('calendar dates', () => {
  it('reads both all-day end conventions and multi-day ranges', () => {
    expect(resolveAllDayEndDate('2026-03-06T00:00:00Z')).toBe('2026-03-05');
    expect(resolveAllDayEndDate('2026-03-05T00:00:00')).toBe('2026-03-05');
    const allDay = { Start: '2026-03-04T00:00:00Z', End: '2026-03-06T00:00:00Z', IsAllDay: true };
    expect(isDateInRange('2026-03-05', allDay)).toBe(true);
    expect(isDateInRange('2026-03-06', allDay)).toBe(false);
    expect(itemDays({ Start: '2026-03-30T22:00:00', End: '2026-04-01T02:00:00', IsAllDay: false })).toEqual(['2026-03-30', '2026-03-31', '2026-04-01']);
    expect(itemDays({ Start: '2026-03-30T22:00:00', End: '2026-03-01T02:00:00', IsAllDay: false })).toEqual(['2026-03-30']);
  });

  it('builds the request ranges and the sign-up rule', () => {
    expect(monthRange(2026, 2)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(upcomingRange(new Date(2026, 11, 28))).toEqual({ start: '2026-12-28', end: '2027-01-04' });
    expect(canSignUp({ SignupType: 1, LockEditing: false })).toBe(true);
    expect(canSignUp({ SignupType: 1, LockEditing: true })).toBe(false);
  });

  it('marks every covered day with the type colour and the selected day', () => {
    const marked = buildMarkedDates([item('1', { Start: '2026-05-01T08:00:00', End: '2026-05-02T08:00:00', TypeColor: '#ff0000' })], '2026-05-03', '#0000ff');
    expect(Object.keys(marked).sort()).toEqual(['2026-05-01', '2026-05-02', '2026-05-03']);
    expect(marked['2026-05-01']?.dots).toEqual([{ key: '1', color: '#ff0000' }]);
    expect(marked['2026-05-03']).toEqual(expect.objectContaining({ selected: true, selectedColor: '#0000ff' }));
  });
});

describe('CalendarScreen', () => {
  it("loads today's and the next week's items and lists today's", async () => {
    useCalendarStore.setState({
      todayItems: [item('1', { Location: 'Station 1', Description: '<p>Bring <b>gear</b></p><script>alert(1)</script>' }), item('2', { Start: '2001-01-01T09:00:00', End: '2001-01-01T10:00:00' })],
    });
    render(<CalendarScreen />);
    await waitFor(() => expect(fetchers.fetchTodaysItems).toHaveBeenCalledWith(todayKey(), todayKey(), { bypassCache: false }));
    expect(fetchers.fetchUpcomingItems).toHaveBeenCalled();

    expect(screen.getByTestId('calendar-card-1')).toBeTruthy();
    // The range can return a neighbour that is not on today.
    expect(screen.queryByTestId('calendar-card-2')).toBeNull();
    expect(screen.getByTestId('calendar-card-1-preview')).toHaveTextContent('Bring gear');
    expect(screen.getByText('Station 1')).toBeTruthy();
  });

  it('shows the empty and error states', async () => {
    useCalendarStore.setState({ errors: { upcoming: { code: 'network', messageKey: 'errors.data.network' } } });
    render(<CalendarScreen />);
    expect(screen.getByTestId('calendar-today-list-empty')).toBeTruthy();
    fireEvent.press(screen.getByTestId('calendar-tab-upcoming'));
    expect(screen.getByTestId('calendar-upcoming-list-error')).toBeTruthy();
    expect(screen.getByText('errors.data.network')).toBeTruthy();
    fireEvent.press(screen.getByTestId('calendar-upcoming-list-retry'));
    await waitFor(() => expect(fetchers.fetchUpcomingItems).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), { bypassCache: true }));
    await waitFor(() => expect(screen.getByTestId('calendar-upcoming-list-error')).toBeTruthy());
  });

  it('loads the visible month and lists the selected day', async () => {
    useCalendarStore.setState({ rangeItems: [item('7', { Title: 'Drill' })] });
    render(<CalendarScreen />);
    fireEvent.press(screen.getByTestId('calendar-tab-calendar'));
    const now = new Date();
    const range = monthRange(now.getFullYear(), now.getMonth() + 1);
    await waitFor(() => expect(fetchers.fetchItemsForDateRange).toHaveBeenCalledWith(range.start, range.end, { bypassCache: false }));
    expect(screen.getByTestId('calendar-select-date')).toBeTruthy();
    expect(screen.getByTestId('mock-calendar-marked')).toHaveTextContent(todayKey());

    fireEvent.press(screen.getByTestId('mock-calendar-today'));
    expect(screen.getByTestId('calendar-card-7')).toBeTruthy();
    expect(screen.getByTestId('month-calendar-selected')).toHaveTextContent(/calendar\.eventsCount:1/);

    fireEvent.press(screen.getByTestId('mock-calendar-month'));
    await waitFor(() => expect(fetchers.fetchItemsForDateRange).toHaveBeenCalledWith('2030-02-01', '2030-02-28', { bypassCache: false }));
  });

  it('opens an item, signs up with a note and refreshes the lists', async () => {
    useCalendarStore.setState({ todayItems: [item('3', { SignupType: 2, CreatorUserId: 'creator' })] });
    render(<CalendarScreen />);
    fireEvent.press(screen.getByTestId('calendar-card-3'));
    await waitFor(() => expect(fetchers.fetchCalendarItem).toHaveBeenCalledWith('3'));
    expect(screen.getByTestId('calendar-item-details-creator', q)).toHaveTextContent('calendar.createdBy: Robin Ray');

    fireEvent.press(screen.getByTestId('calendar-item-details-signup-button', q));
    expect(fetchers.setAttendance).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('calendar-item-details-note', q), ' Bringing the trailer ');
    fireEvent.press(screen.getByTestId('calendar-item-details-confirm-signup', q));
    await waitFor(() => expect(fetchers.setAttendance).toHaveBeenCalledWith('3', true, 'Bringing the trailer'));
    await waitFor(() => expect(useToastStore.getState().toasts[0]).toEqual(expect.objectContaining({ type: 'success', message: 'calendar.attendanceUpdated.signedUp' })));
    expect(fetchers.fetchTodaysItems).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), { bypassCache: true });
  });
});

describe('CalendarItemDetailsSheet', () => {
  it('confirms before cancelling attendance and reports a failure', async () => {
    fetchers.setAttendance.mockImplementationOnce(async () => {
      useCalendarStore.setState({ attendanceError: { code: 'network', messageKey: 'errors.data.network' } });
      return false;
    });
    render(<CalendarItemDetailsSheet item={item('4', { SignupType: 1, Attending: true })} isOpen onClose={jest.fn()} />);
    expect(screen.getByTestId('calendar-item-details-attending', q)).toBeTruthy();
    fireEvent.press(screen.getByTestId('calendar-item-details-unsignup', q));
    expect(fetchers.setAttendance).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('calendar-unsignup-confirm-confirm', q));
    await waitFor(() => expect(fetchers.setAttendance).toHaveBeenCalledWith('4', false, ''));
    await waitFor(() => expect(useToastStore.getState().toasts[0]).toEqual(expect.objectContaining({ type: 'error', message: 'errors.data.network' })));
  });

  it('renders the description through the sanitizer and never shows a withheld value', () => {
    const { unmount } = render(<CalendarItemDetailsSheet item={item('5', { Description: '<p>Hello</p><script>steal()</script>' })} isOpen onClose={jest.fn()} />);
    const html = screen.getByTestId('webview-html', q);
    expect(html).toHaveTextContent(/Hello/);
    expect(html).not.toHaveTextContent(/steal/);
    unmount();

    render(<CalendarItemDetailsSheet item={item('6', { Title: 'REDACTED', Location: 'REDACTED', Description: 'REDACTED' })} isOpen onClose={jest.fn()} />);
    expect(screen.queryByText('REDACTED', q)).toBeNull();
    expect(screen.queryByTestId('webview-html', q)).toBeNull();
    expect(screen.getAllByText('data_protection.protected_value', q).length).toBe(3);
  });

  it('prefers the fetched detail (attendees) over the list row', () => {
    useCalendarStore.setState({ itemDetailsById: { '8': item('8', { Attendees: [{ CalendarItemId: '8', UserId: 'u2', Name: 'Sam Lee', GroupName: 'Station 2', AttendeeType: 1, Timestamp: '', Note: '' }] }) } });
    render(<CalendarItemDetailsSheet item={item('8')} isOpen onClose={jest.fn()} />);
    expect(screen.getByTestId('calendar-item-details-attendees', q)).toBeTruthy();
    expect(screen.getByText('Sam Lee', q)).toBeTruthy();
  });
});

describe('calendar nav', () => {
  it('registers the calendar entry with the department term', () => {
    expect(calendarNav).toEqual([expect.objectContaining({ id: 'calendar', href: '/calendar', termKey: 'module.calendar', requiresModule: 'calendar' })]);
  });
});
