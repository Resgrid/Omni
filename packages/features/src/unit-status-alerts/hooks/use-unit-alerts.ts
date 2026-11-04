import { useNow } from '@resgrid/core/lifecycle/use-now';
import { useUnitsStore, useUnitStatusAlertsStore } from '@resgrid/data';
import { useDepartmentConfigStore } from '@resgrid/features/department-config';
import type { UnitStatusThresholdData } from '@resgrid/models';
import { useMemo } from 'react';

import { type AnnotatedUnit, annotateUnit, type BoardUnit, UnitStatusAlertNoteRequirement } from '../lib/unit-status-alerts';

/** A unit crosses its threshold through the passage of time, so the timers re-evaluate on a tick. */
export const UNIT_ALERT_REEVALUATE_MS = 15000;

const EMPTY_THRESHOLDS: readonly UnitStatusThresholdData[] = [];

export interface UnitAlertsThresholds {
  thresholds: readonly UnitStatusThresholdData[];
  noteRequirement: number;
  /** Config has loaded (thresholds are known). */
  configLoaded: boolean;
  /** Config loaded but the server sent no threshold list at all (an older server): timers are unknown, not "none". */
  thresholdsUnsupported: boolean;
}

/** The department's status timers and whether acknowledging needs a reason (department config). */
export function useUnitAlertThresholds(): UnitAlertsThresholds {
  const config = useDepartmentConfigStore((state) => state.config);
  const rawThresholds = config?.UnitStatusThresholds;

  return {
    thresholds: Array.isArray(rawThresholds) ? rawThresholds : EMPTY_THRESHOLDS,
    noteRequirement: config?.UnitStatusAlertNoteRequirement ?? UnitStatusAlertNoteRequirement.Optional,
    configLoaded: config !== null,
    thresholdsUnsupported: config !== null && !Array.isArray(rawThresholds),
  };
}

export interface UnitAlertsView extends UnitAlertsThresholds {
  /** Every unit with its alert and acknowledgement, in server order (sort with `compareAnnotatedUnits`). */
  annotated: AnnotatedUnit[];
  units: BoardUnit[];
  isLoading: boolean;
  hasError: boolean;
}

/** The department's units annotated with time-in-status alerts and acknowledgements, evaluated against one instant. */
export function useUnitAlerts(): UnitAlertsView {
  const units = useUnitsStore((state) => state.unitInfos);
  const isLoading = useUnitsStore((state) => state.loading.unitInfos === true);
  const hasError = useUnitsStore((state) => !!state.errors.unitInfos);
  const acknowledgements = useUnitStatusAlertsStore((state) => state.acknowledgements);
  const thresholdsView = useUnitAlertThresholds();
  const { thresholds } = thresholdsView;
  const now = useNow(UNIT_ALERT_REEVALUATE_MS, thresholds.length > 0);

  const annotated = useMemo(() => units.map((unit) => annotateUnit(unit, thresholds, acknowledgements, now)), [units, thresholds, acknowledgements, now]);

  return { ...thresholdsView, annotated, units, isLoading, hasError };
}

/** Each unit over its timer (muted ones too) by UnitId, for lists that highlight them in place. */
export function useUnitAlertsByUnit(): ReadonlyMap<string, AnnotatedUnit> {
  const { annotated } = useUnitAlerts();

  return useMemo(() => {
    const byUnit = new Map<string, AnnotatedUnit>();

    for (const entry of annotated) if (entry.alert.level !== 'none') byUnit.set(entry.unit.UnitId, entry);

    return byUnit;
  }, [annotated]);
}
