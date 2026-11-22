import { type DeskActionOutcome, useDispatcherDeskStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { useToast } from '@resgrid/ui';
import { useCallback, useMemo } from 'react';

import { describeWarning, deskErrorKey } from '../lib/desk-format';

export interface RunDeskActionOptions {
  /** Toast on success (already translated). */
  success?: string;
  /** Refusals the caller explains itself (no error toast for these). */
  handledRefusals?: readonly string[];
}

export interface DeskActions {
  /** Runs a desk write and reports it: the success toast, the warnings it noticed, or why it was refused. */
  run: (action: () => Promise<DeskActionOutcome>, options?: RunDeskActionOptions) => Promise<DeskActionOutcome>;
  busyKeys: readonly string[];
}

/** The desk's actions with the same reporting on every surface (status bar, desk, item, breaks, team board). */
export function useDeskActions(): DeskActions {
  const { t } = useTranslation();
  const toast = useToast();
  const busyKeys = useDispatcherDeskStore((state) => state.busyKeys);

  const run = useCallback(
    async (action: () => Promise<DeskActionOutcome>, options: RunDeskActionOptions = {}) => {
      const outcome = await action();

      if (outcome.ok) {
        if (options.success) toast.success(options.success);

        for (const warning of outcome.warnings) toast.warning(describeWarning(warning, t));
      } else if (outcome.refusal && options.handledRefusals?.includes(outcome.refusal)) {
        // The caller explains this one (a prompt to return work, a coverage explanation).
      } else if (outcome.refusal) {
        toast.error(t(deskErrorKey(outcome.refusal)), t('dispatcher_desk.errors.title'));
      } else {
        toast.error(t(outcome.error?.messageKey ?? 'dispatcher_desk.errors.unknown'), t('dispatcher_desk.errors.title'));
      }

      return outcome;
    },
    [t, toast]
  );

  return useMemo(() => ({ run, busyKeys }), [busyKeys, run]);
}
