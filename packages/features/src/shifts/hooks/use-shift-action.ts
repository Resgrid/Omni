import type { ShiftActionOutcome } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { useToast } from '@resgrid/ui';
import { useCallback, useState } from 'react';

import { getShiftErrorKey } from '../lib/shift-rules';

export interface ShiftActionRunner {
  /** The key of the action in flight (only that control shows busy), or null. */
  busy: string | null;
  /** Runs a store mutation, toasts its outcome (the server's error code, translated) and returns it. */
  run: (key: string, action: () => Promise<ShiftActionOutcome>, successKey: string | ((outcome: ShiftActionOutcome) => string)) => Promise<ShiftActionOutcome>;
}

/** Shift mutations are online only and answer with an outcome code rather than throwing (store contract). */
export function useShiftAction(): ShiftActionRunner {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback<ShiftActionRunner['run']>(
    async (key, action, successKey) => {
      setBusy(key);
      try {
        const outcome = await action();
        if (outcome.success) toast.success(t(typeof successKey === 'function' ? successKey(outcome) : successKey));
        else toast.error(t(getShiftErrorKey(outcome.errorCode)));
        return outcome;
      } finally {
        setBusy(null);
      }
    },
    [t, toast]
  );

  return { busy, run };
}
