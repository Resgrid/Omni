import { useWeatherAlertsStore } from '@resgrid/data';
import { useRealtimeEvent } from '@resgrid/realtime';

/**
 * Keeps the alert list live from the id-only eventing pings (`weatherAlertReceived` / `Updated` / `Expired`, Core
 * §8.6). Servers that do not emit them yet still deliver alerts as inbox messages; the list refetches on focus.
 */
export const useWeatherAlertsRealtime = (enabled = true): void => {
  useRealtimeEvent(
    'weatherAlertReceived',
    (id) => {
      if (id) void useWeatherAlertsStore.getState().handleAlertReceived(id);
      else void useWeatherAlertsStore.getState().fetchActiveAlerts({ bypassCache: true });
    },
    enabled
  );
  useRealtimeEvent(
    'weatherAlertUpdated',
    (id) => {
      if (id) void useWeatherAlertsStore.getState().handleAlertUpdated(id);
      else void useWeatherAlertsStore.getState().fetchActiveAlerts({ bypassCache: true });
    },
    enabled
  );
  useRealtimeEvent(
    'weatherAlertExpired',
    (id) => {
      if (id) useWeatherAlertsStore.getState().handleAlertExpired(id);
    },
    enabled
  );
};
