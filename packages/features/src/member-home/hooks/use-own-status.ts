import { useAuthStore } from '@resgrid/auth';
import { selectPendingPersonnelWrite, usePersonnelStatusStore, usePersonnelStore } from '@resgrid/data';
import { useOwnPersonnelRow } from '@resgrid/features/staffing';
import { type CurrentStatusRef, resolveCurrentStatusId, toOptionId } from '@resgrid/features/status';
import type { StatusesResultData } from '@resgrid/models';
import { useMemo } from 'react';

export interface OwnStatus {
  currentId: string | null;
  current: CurrentStatusRef;
  option: StatusesResultData | undefined;
  text: string | null;
  color: string | null;
  baseType: number | null;
  /** Where the status points (station, call, POI), as the server named it. */
  destination: string | null;
  /** Local wall-clock timestamp of the last change (personnel row), for display. */
  timestamp: string | null;
  pendingText: string | null;
  isPending: boolean;
}

/**
 * The member's own personnel status: GetCurrentStatus (falling back to the personnel row), its option in the
 * department's set, the destination, and a newer status waiting in the outbox. Meaning comes from BaseType.
 */
export function useOwnStatus(): OwnStatus {
  const userId = useAuthStore((state) => state.userId);
  const person = useOwnPersonnelRow();
  const statusOptions = usePersonnelStore((state) => state.statusOptions);
  const ownStatus = usePersonnelStatusStore((state) => state.currentStatus);
  const queuedWrites = usePersonnelStatusStore((state) => state.queuedWrites);

  return useMemo<OwnStatus>(() => {
    const current: CurrentStatusRef = { StateId: ownStatus?.StatusType ?? person?.StatusId ?? null, BaseType: person?.StatusBaseType ?? null };
    const currentId = resolveCurrentStatusId(statusOptions, current);
    const option = currentId ? statusOptions.find((candidate) => toOptionId(candidate.Id) === currentId) : undefined;
    const pending = userId ? selectPendingPersonnelWrite({ queuedWrites }, userId, 'status') : undefined;
    const pendingOption = pending ? statusOptions.find((candidate) => toOptionId(candidate.Id) === toOptionId(pending.type)) : undefined;
    return {
      currentId,
      current,
      option,
      text: option?.Text || person?.Status || null,
      color: option?.BColor || person?.StatusColor || null,
      baseType: option?.BaseType ?? person?.StatusBaseType ?? null,
      destination: ownStatus?.DestinationName || ownStatus?.DestinationAddress || person?.StatusDestinationName || null,
      timestamp: person?.StatusTimestamp || ownStatus?.Timestamp || null,
      pendingText: pendingOption?.Text ?? null,
      isPending: !!pending,
    };
  }, [ownStatus, person, queuedWrites, statusOptions, userId]);
}
