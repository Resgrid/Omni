// The Field Records context for the incident-command tier (IC: RMS plan RMS-1D). IC authors records against the incident
// its command board shows and the command role this member holds on it; the shell registers this hook only where the
// variant commands incidents (`capabilities.incidentCommand === 'command'`). The role is a hint the server re-checks
// against the call's active command, so a stale board can narrow the catalog but never widen it (legacy IC
// `hooks/use-records-context.ts`).
import { useAuthStore } from '@resgrid/auth';
import { useCommandStore } from '@resgrid/data';
import { type FieldRecordContextInput, type IncidentRoleAssignment, IncidentRoleType } from '@resgrid/models';
import { useMemo } from 'react';

/** The context for a board's call and this member's active role on it (pure; exported for tests). */
export function commandRecordsContext(activeCallId: string | null, roles: readonly IncidentRoleAssignment[] | null | undefined, userId: string | null): FieldRecordContextInput {
  const callId = activeCallId ? Number.parseInt(activeCallId, 10) : Number.NaN;
  if (!Number.isFinite(callId) || callId <= 0) {
    return {};
  }
  const context: FieldRecordContextInput = { CallId: callId };
  const assignment = userId ? (roles ?? []).find((role) => !role.RemovedOn && role.UserId === userId) : undefined;
  const roleName = assignment ? IncidentRoleType[assignment.RoleType] : undefined;
  if (roleName) {
    context.CommandRole = roleName;
  }
  return context;
}

/** `registerRecordsContextHook(useCommandRecordsContext)` for the command tier. */
export function useCommandRecordsContext(): FieldRecordContextInput {
  const activeCallId = useCommandStore((state) => state.activeCallId);
  const roles = useCommandStore((state) => (state.activeCallId ? state.boards[state.activeCallId]?.board?.Roles : undefined));
  const userId = useAuthStore((state) => state.userId);
  return useMemo(() => commandRecordsContext(activeCallId, roles, userId), [activeCallId, roles, userId]);
}
