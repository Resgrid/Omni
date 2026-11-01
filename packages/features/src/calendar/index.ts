// @resgrid/features/calendar — the department calendar (Responder): Today / Upcoming / month grid, item details with
// sign-up. Route file: `export { default } from '@resgrid/features/calendar/screens/calendar';`.
export { CalendarCard, type CalendarCardProps } from './components/calendar-card';
export { CalendarItemDetailsSheet, type CalendarItemDetailsSheetProps } from './components/calendar-item-details-sheet';
export { buildMarkedDates, MonthCalendar, type MonthCalendarProps } from './components/month-calendar';
export {
  canSignUp,
  type DateRange,
  extractDatePart,
  formatDayKey,
  formatItemTime,
  isDateInRange,
  itemDayRange,
  itemDays,
  itemsOnDate,
  monthRange,
  normalizeItems,
  resolveAllDayEndDate,
  todayKey,
  todayRange,
  upcomingRange,
} from './lib/calendar-dates';
export { calendarNav, type FeatureNavEntry } from './nav';
export { CALENDAR_ROUTE_PATTERNS, calendarRoutes } from './routes';
export { default as CalendarScreen, type CalendarScreenProps, type CalendarTab } from './screens/calendar';
