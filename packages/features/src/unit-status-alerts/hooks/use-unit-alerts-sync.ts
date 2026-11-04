import { useActiveVariant } from '@resgrid/config';
import { useUnitsStore, useUnitStatusAlertsStore } from '@resgrid/data';
import { useDepartmentConfigStore } from '@resgrid/features/department-config';
import { onRealtimeEvent, showsUnitStatusAlerts } from '@resgrid/realtime';
import { useEffect } from 'react';

/**
 * Keeps unit status timers live while any screen shows them (BigBoard's dashboard, Dispatch's console, Unit's own
 * timer). Thresholds come from the department config; acknowledgements from `UnitStatusAlerts/GetActiveAcknowledgements`.
 * Events are id-only pings, so each refetch bypasses caches; one subscription serves every holder.
 */

// A status change ends the episode an acknowledgement covered, so acknowledgements refetch on unit pushes too.
const ACKNOWLEDGEMENT_EVENTS = ['unitStatusAlertUpdated', 'unitStatusUpdated', 'eventingHubJoined'] as const;

let holders = 0;
let stopSync: (() => void) | null = null;

/** Units whose own roster row a holder keeps fresh (Unit's own timer), with how many holders watch each. */
const watchedUnits = new Map<string, number>();

const refreshAcknowledgements = (): void => void useUnitStatusAlertsStore.getState().fetchAcknowledgements({ bypassCache: true });

const refreshUnits = (): void => void useUnitsStore.getState().fetchUnitInfos({ bypassCache: true });

const startSync = (): (() => void) => {
  const offs = ACKNOWLEDGEMENT_EVENTS.map((name) => onRealtimeEvent(name, refreshAcknowledgements));
  // Department settings changed: the status timers may have.
  const offDepartment = onRealtimeEvent('departmentUpdated', () => void useDepartmentConfigStore.getState().load({ bypassCache: true }));
  // A watched unit's row: nothing else on Unit's screens re-reads the roster when its status changes (dispatch on its
  // behalf, or its own change reaching the server). A ping without an id may be anyone's.
  const offUnit = onRealtimeEvent('unitStatusUpdated', (id) => (watchedUnits.size > 0 && (!id || watchedUnits.has(id)) ? refreshUnits() : undefined));
  const offJoined = onRealtimeEvent('eventingHubJoined', () => (watchedUnits.size > 0 ? refreshUnits() : undefined));

  void useUnitStatusAlertsStore.getState().fetchAcknowledgements();

  if (!useDepartmentConfigStore.getState().config) void useDepartmentConfigStore.getState().load();

  return () => {
    offs.forEach((off) => off());
    offDepartment();
    offUnit();
    offJoined();
  };
};

export interface UnitAlertsSyncOptions {
  /** Also keep this unit's roster row fresh (a screen that does not already re-read units: Unit's own timer). */
  watchUnitId?: string | null;
}

/** Holds the sync until the returned release is called (idempotent); the last release unsubscribes. */
export function retainUnitAlertsSync(options: UnitAlertsSyncOptions = {}): () => void {
  const unitId = options.watchUnitId || null;

  holders += 1;

  if (holders === 1) stopSync = startSync();

  if (unitId) {
    watchedUnits.set(unitId, (watchedUnits.get(unitId) ?? 0) + 1);
    // Fresh on watch: the cached roster can predate the unit's current status.
    refreshUnits();
  }

  let released = false;

  return () => {
    if (released) return;
    released = true;
    holders -= 1;

    if (unitId) {
      const remaining = (watchedUnits.get(unitId) ?? 1) - 1;

      if (remaining > 0) watchedUnits.set(unitId, remaining);
      else watchedUnits.delete(unitId);
    }

    if (holders > 0) return;
    stopSync?.();
    stopSync = null;
  };
}

/** How many screens hold the sync (tests). */
export const getUnitAlertsSyncHolders = (): number => holders;

/** Keeps the timers live while `enabled` (a screen that shows them). */
export function useUnitAlertsSync(enabled: boolean, options: UnitAlertsSyncOptions = {}): void {
  const watchUnitId = options.watchUnitId || null;

  useEffect(() => (enabled ? retainUnitAlertsSync({ watchUnitId }) : undefined), [enabled, watchUnitId]);
}

/** This app shows unit status timers: a module that does (dashboard, dispatch console, unit console — never the app id). */
export function useIsUnitAlertsEnabled(): boolean {
  return showsUnitStatusAlerts(useActiveVariant().modules);
}
