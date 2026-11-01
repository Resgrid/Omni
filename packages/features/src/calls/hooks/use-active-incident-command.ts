import { useCommandStore } from '@resgrid/data';

import { INCIDENT_COMMAND_ACTIVE, isActiveCommandFor } from '../lib/close-call';

/**
 * Whether the call has an active incident command on this device's view of it (a loaded board, one established
 * offline, or the IC incident list). An active command blocks closing the call (resgrid-domain); the server enforces
 * the same rule, so a stale "false" still ends in a clear refusal.
 */
export function useHasActiveIncidentCommand(callId: string | null | undefined): boolean {
  return useCommandStore((state) => {
    if (!callId) return false;
    const board = state.boards[callId];
    if (board?.isProvisional) return true;
    if (board?.board?.Command && board.board.Command.Status === INCIDENT_COMMAND_ACTIVE) return true;
    return state.summaries.some((summary) => isActiveCommandFor(summary, callId));
  });
}
