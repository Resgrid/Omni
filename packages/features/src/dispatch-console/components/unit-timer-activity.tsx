import { formatElapsed, type UnitStatusAlertLevel, useUnitAlerts } from '@resgrid/features/unit-status-alerts';
import { useTranslation } from '@resgrid/i18n';
import type React from 'react';
import { useEffect, useRef } from 'react';

import { useConsoleStore } from '../hooks/use-console-store';

const LEVEL_RANK: Record<UnitStatusAlertLevel, number> = { none: 0, warn: 1, alert: 2 };

interface SeenTimer {
  /** The status record (a new status starts a new episode with its own timer). */
  episode: string;
  level: UnitStatusAlertLevel;
}

/**
 * Adds a line to the console's activity log when a unit crosses its status timer (warning, then alert), so the log
 * records when the dispatcher was cued to contact it. Units already over a timer when the console opens are not logged
 * (the Unit timers tab lists them), nor are muted ones. Renders nothing: its own leaf, since the timers tick.
 */
export const UnitTimerActivity: React.FC = () => {
  const { t } = useTranslation();
  const { annotated, units, configLoaded } = useUnitAlerts();
  const seen = useRef<Map<string, SeenTimer> | null>(null);

  useEffect(() => {
    // Seed once there is something to compare against, or the first load would log every unit already over.
    if (!configLoaded || units.length === 0) return;
    const previous = seen.current;
    const next = new Map<string, SeenTimer>();

    for (const { unit, alert, acknowledgementState } of annotated) {
      const episode = String(unit.CurrentUnitStateId ?? unit.CurrentStatusTimestampUtc);
      const before = previous?.get(unit.UnitId);
      const beforeLevel = before && before.episode === episode ? before.level : 'none';

      next.set(unit.UnitId, { episode, level: alert.level });

      if (!previous || acknowledgementState === 'muted' || LEVEL_RANK[alert.level] <= LEVEL_RANK[beforeLevel]) continue;
      useConsoleStore.getState().addActivity({
        type: 'unit',
        action: t(alert.level === 'alert' ? 'dispatch_console.unit_timer_alert' : 'dispatch_console.unit_timer_warning'),
        description: `${unit.Name} · ${t('unitAlerts.inStatusFor', { status: unit.CurrentStatus || t('common.unknown'), elapsed: formatElapsed(alert.secondsInStatus) })}`,
        metadata: { unitId: unit.UnitId },
      });
    }

    seen.current = next;
  }, [annotated, configLoaded, t, units.length]);

  return null;
};
