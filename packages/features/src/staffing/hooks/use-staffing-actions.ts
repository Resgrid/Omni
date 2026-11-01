import { usePersonnelStatusStore } from '@resgrid/data';
import { isNoteRequired, type StatusOption, toOptionId } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { useToast } from '@resgrid/ui';
import { useCallback, useRef, useState } from 'react';

/**
 * - `sent` / `queued` / `rejected`: the outbox outcome (queued = saved on the device, sent on reconnect).
 * - `failed`: nothing was queued (no signed-in user, storage error).
 * - `busy`: another staffing save from this control is still running.
 * - `needs-note`: the level's note is Required; the caller opens the note sheet instead.
 */
export type StaffingSubmitResult = 'sent' | 'queued' | 'rejected' | 'failed' | 'busy' | 'needs-note';

export interface StaffingActions {
  /** Id of the level being saved, so only that button shows progress. */
  submittingId: string | null;
  /** One tap on a staffing button: saved at once with no note, unless the level requires one. */
  quickSet: (option: StatusOption) => Promise<StaffingSubmitResult>;
  /** Saves a level with a note (the note sheet). */
  submit: (option: StatusOption, note: string) => Promise<StaffingSubmitResult>;
}

/**
 * The signed-in member's staffing writes (Responder's one-tap staffing + staffing sheet). Writes go through the outbox
 * ordered per member (offline-capable, plan §8.5). Staffing takes no location fix: SavePersonStaffing has no coordinate
 * fields, so there is nothing to wait for even when the level is flagged GPS.
 */
export function useStaffingActions(): StaffingActions {
  const { t } = useTranslation();
  const toast = useToast();
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  // A double tap within one frame must not queue the level twice.
  const busyRef = useRef(false);

  const submit = useCallback(
    async (option: StatusOption, note: string): Promise<StaffingSubmitResult> => {
      if (busyRef.current) return 'busy';
      busyRef.current = true;
      const id = toOptionId(option.Id);
      setSubmittingId(id);
      try {
        const result = await usePersonnelStatusStore.getState().setStaffing({ staffingType: id, note: note.trim() });
        if (result.outcome === 'sent') toast.success(t('home.staffing.updated_successfully'));
        else if (result.outcome === 'queued') toast.warning(t('status.status_queued'));
        else toast.error(t('home.staffing.update_failed'));
        return result.outcome;
      } catch {
        toast.error(t('home.staffing.update_failed'));
        return 'failed';
      } finally {
        busyRef.current = false;
        setSubmittingId(null);
      }
    },
    [t, toast]
  );

  const quickSet = useCallback(async (option: StatusOption): Promise<StaffingSubmitResult> => (isNoteRequired(option) ? 'needs-note' : submit(option, '')), [submit]);

  return { submittingId, quickSet, submit };
}
