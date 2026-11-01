/**
 * Check-in timer status values reported by the check-in timer API
 * (CheckInTimerStatusResultData.Status). Single source of truth for these literals,
 * which the call-detail, check-in, and dispatch-console views compare against.
 */
export const CheckInTimerStatus = {
  Ok: 'Ok',
  Green: 'Green',
  Yellow: 'Yellow',
  Warning: 'Warning',
  Red: 'Red',
  Critical: 'Critical',
  Overdue: 'Overdue',
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare -- enum-like const + literal union type pair
export type CheckInTimerStatus = (typeof CheckInTimerStatus)[keyof typeof CheckInTimerStatus];
