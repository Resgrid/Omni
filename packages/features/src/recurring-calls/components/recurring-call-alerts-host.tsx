import type React from 'react';

import { useRecurringCallAlertsSync } from '../hooks/use-recurring-calls';

/**
 * Mount once inside the signed-in shell: keeps the recurring call alerts live (`useRecurringCallAlertsSync`) for the
 * badge, the banner and the alerts screen, and announces new ones. Inert without `capabilities.calls.recurringCalls`.
 */
export const RecurringCallAlertsHost: React.FC = () => {
  useRecurringCallAlertsSync();

  return null;
};
