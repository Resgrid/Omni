import { registerCallFormHookPoints } from '@resgrid/features/calls';

import { RecurringCallNotice } from './components/recurring-call-notice';

/**
 * The call detail's "created by a recurring call" notice (every app: the note is plain text where the app has no recurring
 * calls, and a link to the schedule where it has). Returns a function that removes it again.
 */
export function registerRecurringCallsHookPoints(): () => void {
  return registerCallFormHookPoints({ CallDetailNotice: RecurringCallNotice });
}
