import { usePersonnelStatusStore, useUnitStatusStore } from '@resgrid/data';
import { useMemo } from 'react';

/** Units with a status queued on this device (offline on-behalf writes waiting to sync). */
export function usePendingUnitIds(): Set<string> {
  const queued = useUnitStatusStore((state) => state.queuedStatuses);
  return useMemo(
    () =>
      new Set(
        Object.values(queued)
          .filter((status) => status.state === 'queued')
          .map((status) => status.unitId)
      ),
    [queued]
  );
}

/** Members with a status queued on this device. */
export function usePendingPersonnelIds(): Set<string> {
  const queued = usePersonnelStatusStore((state) => state.queuedWrites);
  return useMemo(
    () =>
      new Set(
        Object.values(queued)
          .filter((write) => write.state === 'queued' && write.kind === 'status')
          .map((write) => write.userId)
      ),
    [queued]
  );
}
