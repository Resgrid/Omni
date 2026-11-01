'use strict';
// Auto-update through electron-updater's generic provider, one feed per variant and channel (see core/update-feed.js).
// Updates download in the background and install on quit; the page is told when one is ready (`update:downloaded`) so it
// can offer a translated "restart now" prompt that calls `update:install`. The updater is injected (electron-updater is
// required lazily, only when updates are enabled), so this module is unit-tested.

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/**
 * @param {{
 *   feedUrl: string,
 *   createUpdater?: () => any,
 *   notifyRenderer: (channel: string, payload: object) => void,
 *   trustedIpc: { handle: Function },
 *   log?: { info: Function, warn: Function },
 *   intervalMs?: number,
 *   setIntervalImpl?: typeof setInterval,
 * }} options
 */
function startAutoUpdate({ feedUrl, createUpdater, notifyRenderer, trustedIpc, log = console, intervalMs = CHECK_INTERVAL_MS, setIntervalImpl = setInterval }) {
  const updater = createUpdater ? createUpdater() : require('electron-updater').autoUpdater;

  updater.setFeedURL({ provider: 'generic', url: feedUrl });
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowDowngrade = false;
  updater.allowPrerelease = false;
  // electron-updater logs through this; keep it to warnings (no request URLs with tokens are involved, but stay quiet).
  updater.logger = { info: () => undefined, debug: () => undefined, warn: (m) => log.warn('auto-update:', String(m)), error: (m) => log.warn('auto-update:', String(m)) };

  let downloadedVersion = null;

  updater.on('error', (error) => {
    // Offline, feed not published yet, signature mismatch: never fatal, try again at the next interval.
    log.warn('auto-update: check failed', error && error.message ? error.message : String(error));
  });
  updater.on('update-available', (info) => notifyRenderer('update:available', { version: info && info.version }));
  updater.on('update-downloaded', (info) => {
    downloadedVersion = info && info.version ? info.version : null;
    notifyRenderer('update:downloaded', { version: downloadedVersion });
  });

  const check = () => {
    Promise.resolve()
      .then(() => updater.checkForUpdates())
      .catch((error) => log.warn('auto-update: check failed', error && error.message ? error.message : String(error)));
  };

  trustedIpc.handle('update:get-status', () => ({ enabled: true, downloadedVersion }));
  trustedIpc.handle('update:install', () => {
    if (!downloadedVersion) {
      return false;
    }
    setImmediate(() => updater.quitAndInstall(false, true));
    return true;
  });

  check();
  const timer = setIntervalImpl(check, intervalMs);
  if (timer && typeof timer.unref === 'function') {
    timer.unref();
  }

  return { updater, check, stop: () => clearInterval(timer) };
}

/** Handlers when updates are off, so the page can ask without special-casing. */
function registerDisabledUpdateIpc(trustedIpc) {
  trustedIpc.handle('update:get-status', () => ({ enabled: false, downloadedVersion: null }));
  trustedIpc.handle('update:install', () => false);
}

module.exports = { CHECK_INTERVAL_MS, registerDisabledUpdateIpc, startAutoUpdate };
