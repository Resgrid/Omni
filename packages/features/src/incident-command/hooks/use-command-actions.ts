import { useCommandStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { useToast } from '@resgrid/ui';
import { useCallback } from 'react';

import type { CommandEvent } from '../lib/events';

export type CommandActionOutcome = 'sent' | 'queued' | 'rejected' | 'failed';

export interface CommandActionMessages {
  /** Shown when the server accepted the write; omit for silent success. */
  success?: string;
}

/**
 * Sends board writes through the outbox (`dispatchCommandEvent`: ordered per incident, replayed after reconnect) and
 * reports the outcome once: sent (optional success toast), queued offline (info), refused by the server (error; the
 * write waits in Pending sync), or not accepted locally (error — e.g. this app's offline scope has no IC handlers).
 */
export function useCommandActions(): { run: (event: CommandEvent, messages?: CommandActionMessages) => Promise<CommandActionOutcome> } {
  const { t } = useTranslation();
  const toast = useToast();
  const dispatchCommandEvent = useCommandStore((state) => state.dispatchCommandEvent);

  const run = useCallback(
    async (event: CommandEvent, messages: CommandActionMessages = {}): Promise<CommandActionOutcome> => {
      try {
        const result = await dispatchCommandEvent(event.type, event.payload);
        if (result.outcome === 'sent') {
          if (messages.success) toast.success(messages.success);
          return 'sent';
        }
        if (result.outcome === 'queued') {
          toast.info(t('incident_command.queued_offline'));
          return 'queued';
        }
        toast.error(t('incident_command.write_rejected'));
        return 'rejected';
      } catch {
        toast.error(t('incident_command.write_failed'));
        return 'failed';
      }
    },
    [dispatchCommandEvent, t, toast]
  );

  return { run };
}
