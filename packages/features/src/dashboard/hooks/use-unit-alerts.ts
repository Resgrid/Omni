import { useUnitsStore, useUnitStatusAlertsStore } from '@resgrid/data';
import type { UnitStatusThresholdData } from '@resgrid/models';
import { useMemo } from 'react';

import { type AnnotatedUnit, annotateUnit, type BoardUnit, UnitStatusAlertNoteRequirement } from '../lib/unit-status-alerts';
import { useDashboardConfigStore } from './use-department-config';
import { useNow } from './use-now';

/** A unit crosses its threshold through the passage of time, so the board re-evaluates on a timer. */
export const UNIT_ALERT_REEVALUATE_MS = 15000;

const EMPTY_THRESHOLDS: readonly UnitStatusThresholdData[] = [];

export interface UnitAlertsView {
  /** Every unit with its alert and acknowledgement, in server order (sort with `compareAnnotatedUnits`). */
  annotated: AnnotatedUnit[];
  units: BoardUnit[];
  thresholds: readonly UnitStatusThresholdData[];
  noteRequirement: number;
  /** Config has loaded (thresholds are known). */
  configLoaded: boolean;
  /** Config loaded but the server sent no threshold list at all (an older server): timers are unknown, not "none". */
  thresholdsUnsupported: boolean;
  isLoading: boolean;
  hasError: boolean;
}

/** The department's units annotated with time-in-status alerts and acknowledgements, evaluated against one instant. */
export function useUnitAlerts(): UnitAlertsView {
  const units = useUnitsStore((state) => state.unitInfos) as BoardUnit[];
  const isLoading = useUnitsStore((state) => state.loading.unitInfos === true);
  const hasError = useUnitsStore((state) => !!state.errors.unitInfos);
  const config = useDashboardConfigStore((state) => state.config);
  const acknowledgements = useUnitStatusAlertsStore((state) => state.acknowledgements);
  const rawThresholds = config?.UnitStatusThresholds;
  const thresholds = Array.isArray(rawThresholds) ? rawThresholds : EMPTY_THRESHOLDS;
  const now = useNow(UNIT_ALERT_REEVALUATE_MS, thresholds.length > 0);

  const annotated = useMemo(() => units.map((unit) => annotateUnit(unit, thresholds, acknowledgements, now)), [units, thresholds, acknowledgements, now]);

  return {
    annotated,
    units,
    thresholds,
    noteRequirement: config?.UnitStatusAlertNoteRequirement ?? UnitStatusAlertNoteRequirement.Optional,
    configLoaded: config !== null,
    thresholdsUnsupported: config !== null && !Array.isArray(rawThresholds),
    isLoading,
    hasError,
  };
}
