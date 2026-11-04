import { useStatusContext } from '@resgrid/features/status';
import { useUnitStatusTimerSchedule } from '@resgrid/features/unit-status-alerts';
import { useTranslation } from '@resgrid/i18n';
import { hasStatusTimerNotifications, type LocalNotificationSet, syncLocalNotifications, useExactAlarmAccess } from '@resgrid/notifications';
import type React from 'react';
import { useEffect, useMemo } from 'react';

import { unitTimerNotifications } from '../lib/status-timer-text';

/** What the device should have scheduled; `known: false` until the timers and the roster row load. */
type DesiredNotifications = { known: false } | { known: true; set: LocalNotificationSet | null };

const ActiveUnitTimerNotifications: React.FC<{ unitId: string | null }> = ({ unitId }) => {
  const { t } = useTranslation();
  const view = useUnitStatusTimerSchedule(unitId);
  const { access: exactAlarms } = useExactAlarmAccess();

  const desired = useMemo((): DesiredNotifications => {
    if (!view.known) return { known: false };

    if (!view.schedule || !view.unit) return { known: true, set: null };
    const names = { unit: view.unit.Name, status: view.unit.CurrentStatus || t('common.unknown') };

    return { known: true, set: { scope: view.unit.UnitId, episode: view.schedule.episode, notifications: unitTimerNotifications(t, view.schedule, names) } };
  }, [t, view]);

  useEffect(() => {
    // Until the inputs load, whatever was scheduled before (an earlier launch, say) stays as it is. Exact alarms allowed
    // (Android, read again on every return to the foreground): what was scheduled late is scheduled again on time.
    if (desired.known && exactAlarms !== null) void syncLocalNotifications('statusTimer', desired.set);
  }, [desired, exactAlarms]);

  return null;
};

/**
 * Tells the crew about the unit's own status timer while the app is in the background or the screen is off: the device
 * shows a notification when the timer warns and when it fires, the same moments dispatch's board flags the unit. In the
 * foreground they stay quiet (the strip under the app bar shows the timer). Rescheduled whenever the status, a queued
 * status, dispatch's mute or the department's timers change; cancelled once the status ends, without an active unit, and
 * at sign-out. A tap opens the status console. Renders nothing; only in apps with the unit status console (iOS and
 * Android: web and Electron schedule nothing).
 */
export const StatusTimerNotifications: React.FC = () => {
  const { activeUnitId } = useStatusContext();

  return hasStatusTimerNotifications() ? <ActiveUnitTimerNotifications unitId={activeUnitId} /> : null;
};
