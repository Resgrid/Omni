'use strict';
// Native notifications for desktop push and the page's notification bridge. The Notification class is injected (no
// electron import), so this module is unit-tested.
//
// Notifications are held until clicked, closed or failed: one that is garbage collected loses its click handler (Unit),
// and on Windows a notification the OS refused never clicks or closes, so `failed` releases it too (Dispatch).

/**
 * @param {{ Notification: any, iconPath?: string, appName: string, log?: { warn: Function } }} options
 */
function createNotifier({ Notification, iconPath, appName, log = console }) {
  const active = new Set();

  const isSupported = () => {
    try {
      return Boolean(Notification && Notification.isSupported());
    } catch {
      return false;
    }
  };

  /**
   * @param {{ title?: unknown, body?: unknown, critical?: boolean }} payload
   * @param {() => void} [onClick]
   * @returns {boolean} false when nothing was shown (no native notifications on this system)
   */
  const show = (payload, onClick) => {
    if (!isSupported()) {
      return false;
    }
    const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
    try {
      const critical = payload && payload.critical === true;
      const notification = new Notification({
        title: text(payload && payload.title, 256) || appName,
        body: text(payload && payload.body, 1024),
        silent: false,
        ...(iconPath ? { icon: iconPath } : {}),
        urgency: critical ? 'critical' : 'normal',
        timeoutType: critical ? 'never' : 'default',
      });
      const release = () => active.delete(notification);
      active.add(notification);
      notification.on('click', () => {
        release();
        if (onClick) {
          onClick();
        }
      });
      notification.on('close', release);
      notification.on('failed', release);
      notification.show();
      return true;
    } catch (error) {
      log.warn('Desktop notification could not be shown', error && error.message);
      return false;
    }
  };

  return {
    isSupported,
    show,
    get activeCount() {
      return active.size;
    },
  };
}

module.exports = { createNotifier };
