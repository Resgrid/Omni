import { useAuthStore } from '@resgrid/auth';
import { selectPendingPersonnelWrite, usePersonnelStatusStore, usePersonnelStore } from '@resgrid/data';
import { type CurrentStatusRef, resolveCurrentStatusId, toOptionId } from '@resgrid/features/status';
import type { PersonnelInfoResultData, StatusesResultData } from '@resgrid/models';
import { useMemo } from 'react';

/** The signed-in member's row in the personnel list (status, staffing, their colours and timestamps), if loaded. */
export function useOwnPersonnelRow(): PersonnelInfoResultData | undefined {
  const userId = useAuthStore((state) => state.userId);
  return usePersonnelStore((state) => (userId ? state.personnel.find((person) => person.UserId === userId) : undefined));
}

export interface OwnStaffing {
  /** The current level's option id, when it matches one of the department's options. */
  currentId: string | null;
  /** The reference the pickers use to mark the current level (id first, then meaning). */
  current: CurrentStatusRef;
  option: StatusesResultData | undefined;
  text: string | null;
  color: string | null;
  baseType: number | null;
  /** Local wall-clock timestamp of the last change (personnel row), for display. */
  timestamp: string | null;
  /** The name of a newer level queued on the device, shown until it syncs. */
  pendingText: string | null;
  isPending: boolean;
}

/**
 * The member's own staffing: the server's current level (GetCurrentStaffing, falling back to the personnel row), its
 * option from the department's staffing set, and a newer level waiting in the outbox. Meaning comes from BaseType.
 */
export function useOwnStaffing(): OwnStaffing {
  const userId = useAuthStore((state) => state.userId);
  const person = useOwnPersonnelRow();
  const staffingOptions = usePersonnelStore((state) => state.staffingOptions);
  const ownStaffing = usePersonnelStatusStore((state) => state.currentStaffing);
  const queuedWrites = usePersonnelStatusStore((state) => state.queuedWrites);

  return useMemo<OwnStaffing>(() => {
    const current: CurrentStatusRef = { StateId: ownStaffing?.StaffingType ?? person?.StaffingId ?? null, BaseType: person?.StaffingBaseType ?? null };
    const currentId = resolveCurrentStatusId(staffingOptions, current);
    const option = currentId ? staffingOptions.find((candidate) => toOptionId(candidate.Id) === currentId) : undefined;
    const pending = userId ? selectPendingPersonnelWrite({ queuedWrites }, userId, 'staffing') : undefined;
    const pendingOption = pending ? staffingOptions.find((candidate) => toOptionId(candidate.Id) === toOptionId(pending.type)) : undefined;
    return {
      currentId,
      current,
      option,
      text: option?.Text || person?.Staffing || null,
      color: option?.BColor || person?.StaffingColor || null,
      baseType: option?.BaseType ?? person?.StaffingBaseType ?? null,
      timestamp: person?.StaffingTimestamp || ownStaffing?.Timestamp || null,
      pendingText: pendingOption?.Text ?? null,
      isPending: !!pending,
    };
  }, [ownStaffing, person, queuedWrites, staffingOptions, userId]);
}
