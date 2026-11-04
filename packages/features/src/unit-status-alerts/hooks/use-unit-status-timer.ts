import { useNow } from '@resgrid/core/lifecycle/use-now';
import { selectPendingUnitStatus, useUnitsStore, useUnitStatusAlertsStore, useUnitStatusStore } from '@resgrid/data';
import type { UnitStatusAlertAcknowledgementResultData } from '@resgrid/models';
import { useMemo } from 'react';

import {
  type BoardUnit,
  evaluateUnitStatusTimer,
  isRosterBehind,
  NO_TIMER,
  resolveAcknowledgement,
  scheduleUnitStatusTimer,
  type UnitAlertAcknowledgementState,
  type UnitStatusTimer,
  type UnitStatusTimerSchedule,
} from '../lib/unit-status-alerts';
import { useUnitAlertThresholds } from './use-unit-alerts';
import { useUnitAlertsSync } from './use-unit-alerts-sync';

/** The unit's own timer counts down on screen, so it re-reads the clock more often than a board does. */
export const UNIT_TIMER_TICK_MS = 5000;

export interface UnitStatusTimerView extends UnitStatusTimer {
  unit: BoardUnit | null;
  /** What dispatch did about the alert (seen, muted), when it still covers the current status. */
  acknowledgement: UnitStatusAlertAcknowledgementResultData | null;
  acknowledgementState: UnitAlertAcknowledgementState;
}

const EMPTY_VIEW: UnitStatusTimerView = { ...NO_TIMER, unit: null, acknowledgement: null, acknowledgementState: 'none' };

/**
 * One unit's status timer as the unit sees it (Unit app): read from the same roster row dispatch's board reads, so both
 * agree on when it fires, and kept live while shown. While the unit's newer status waits in the outbox, or the roster row
 * is older than the unit's current status, there is no timer to show: the status it would time has already ended.
 */
export function useUnitStatusTimer(unitId: string | null, enabled: boolean = true): UnitStatusTimerView {
  const isOn = enabled && !!unitId;
  const unit = useUnitsStore((state) => (unitId ? state.unitInfos.find((info) => info.UnitId === unitId) : undefined)) ?? null;
  const currentStatusUtc = useUnitStatusStore((state) => (unitId ? state.currentStatusByUnit[unitId]?.TimestampUtc : undefined)) ?? null;
  const hasPendingStatus = useUnitStatusStore((state) => (unitId ? !!selectPendingUnitStatus(state, unitId) : false));
  const acknowledgements = useUnitStatusAlertsStore((state) => state.acknowledgements);
  const { thresholds } = useUnitAlertThresholds();
  const now = useNow(UNIT_TIMER_TICK_MS, isOn && thresholds.length > 0);

  useUnitAlertsSync(isOn, { watchUnitId: unitId });

  return useMemo(() => {
    if (!isOn || !unit || hasPendingStatus || isRosterBehind(unit, currentStatusUtc)) return EMPTY_VIEW;
    const timer = evaluateUnitStatusTimer(unit, thresholds, now);

    if (!timer.hasTimer) return EMPTY_VIEW;
    const acknowledgement = acknowledgements[unit.UnitId] ?? null;

    return { ...timer, unit, acknowledgement, acknowledgementState: resolveAcknowledgement(acknowledgement, unit, timer.alert.level, now) };
  }, [acknowledgements, currentStatusUtc, hasPendingStatus, isOn, now, thresholds, unit]);
}

export interface UnitStatusTimerScheduleView {
  /** The department's timers and the unit's roster row have loaded: until then nothing is known either way. */
  known: boolean;
  unit: BoardUnit | null;
  /** When the timer fires; null when no timer runs (off, no unit, or the status it would time has ended). */
  schedule: UnitStatusTimerSchedule | null;
}

const OFF_SCHEDULE: UnitStatusTimerScheduleView = { known: true, unit: null, schedule: null };

const UNKNOWN_SCHEDULE: UnitStatusTimerScheduleView = { known: false, unit: null, schedule: null };

/**
 * When the unit's own timer fires, from the same inputs as `useUnitStatusTimer` but with no clock: for notifications the
 * device schedules ahead (`scheduleUnitStatusTimer`). Changes only when an input does (status, outbox, mute, timers), and
 * keeps the unit's roster row fresh while on.
 */
export function useUnitStatusTimerSchedule(unitId: string | null, enabled: boolean = true): UnitStatusTimerScheduleView {
  const isOn = enabled && !!unitId;
  const unit = useUnitsStore((state) => (unitId ? state.unitInfos.find((info) => info.UnitId === unitId) : undefined)) ?? null;
  const currentStatusUtc = useUnitStatusStore((state) => (unitId ? state.currentStatusByUnit[unitId]?.TimestampUtc : undefined)) ?? null;
  const hasPendingStatus = useUnitStatusStore((state) => (unitId ? !!selectPendingUnitStatus(state, unitId) : false));
  const acknowledgement = useUnitStatusAlertsStore((state) => (unitId ? state.acknowledgements[unitId] : undefined)) ?? null;
  const { thresholds, configLoaded } = useUnitAlertThresholds();

  useUnitAlertsSync(isOn, { watchUnitId: unitId });

  return useMemo(() => {
    if (!isOn) return OFF_SCHEDULE;

    if (!configLoaded || !unit) return UNKNOWN_SCHEDULE;

    return { known: true, unit, schedule: scheduleUnitStatusTimer({ unit, thresholds, acknowledgement, hasPendingStatus, currentStatusUtc }) };
  }, [acknowledgement, configLoaded, currentStatusUtc, hasPendingStatus, isOn, thresholds, unit]);
}
