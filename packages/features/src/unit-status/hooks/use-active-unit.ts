import { selectPendingUnitStatus, selectUnitById, useUnitRolesStore, useUnitsStore, useUnitStatusStore } from '@resgrid/data';
import { getUnitStatusOptions, useStatusContext } from '@resgrid/features/status';
import type { StatusesResultData, UnitInfoResultData, UnitResultData, UnitTypeStatusResultData } from '@resgrid/models';
import { useEffect, useMemo } from 'react';

import { resolveUnitStatusDisplay, type UnitStatusDisplay } from '../lib/status-display';

export interface ActiveUnitData {
  unitId: string | null;
  unit: UnitResultData | null;
  unitInfo: UnitInfoResultData | null;
  /** The unit's status set (its type's custom set, else the built-in statuses). */
  statuses: StatusesResultData[];
  status: UnitStatusDisplay;
}

/**
 * The status console's active unit (StatusProvider `activeUnitId`): roster row, status set, current status (with a
 * queued newer status shown as pending) — read from the persisted stores so the console works offline, refreshed on
 * mount and whenever the unit changes.
 */
export function useActiveUnit(options: { refresh?: boolean } = {}): ActiveUnitData {
  const { activeUnitId } = useStatusContext();
  const refresh = options.refresh !== false;
  const unit = useUnitsStore((state) => (activeUnitId ? selectUnitById(state, activeUnitId) : undefined)) ?? null;
  const unitInfo = useUnitsStore((state) => (activeUnitId ? state.unitInfos.find((info) => info.UnitId === activeUnitId) : undefined)) ?? null;
  const statusSets = useUnitsStore((state) => state.unitTypeStatuses);
  const currentStatus = useUnitStatusStore((state) => (activeUnitId ? state.currentStatusByUnit[activeUnitId] : undefined)) ?? null;
  const queuedStatuses = useUnitStatusStore((state) => state.queuedStatuses);

  useEffect(() => {
    if (!refresh || !activeUnitId) return;
    const units = useUnitsStore.getState();
    if (units.units.length === 0 || units.unitTypeStatuses.length === 0) void units.fetchUnits();
    if (units.unitInfos.length === 0) void units.fetchUnitInfos();
    void useUnitStatusStore.getState().fetchCurrentStatus(activeUnitId);
    void useUnitRolesStore.getState().fetchAllForUnit(activeUnitId);
  }, [activeUnitId, refresh]);

  const owner = unit ?? unitInfo;
  const statuses = useMemo(() => getUnitStatusOptions<StatusesResultData, UnitTypeStatusResultData>(statusSets, owner), [owner, statusSets]);
  const pending = useMemo(() => (activeUnitId ? (selectPendingUnitStatus({ queuedStatuses }, activeUnitId) ?? null) : null), [activeUnitId, queuedStatuses]);
  const status = useMemo(() => resolveUnitStatusDisplay({ statuses, unitInfo, currentStatus, pending }), [currentStatus, pending, statuses, unitInfo]);

  return { unitId: activeUnitId, unit, unitInfo, statuses, status };
}
