'use strict';
// Preload for the app window. Runs sandboxed with context isolation, so it can require only `electron` and must stay
// self-contained. It exposes the desktop bridges the web bundle looks for (there is no Metro `electron` platform; the
// web code detects these at runtime):
//
//   window.__ELECTRON__            true inside the desktop app (Dispatch)
//   window.electronNotifications   native OS notifications (Dispatch)
//   window.electronDeepLinks       links on the app's protocol, queued until the page subscribes (Dispatch, + pull)
//   window.electronAPI             platform info, desktop push, brokered + legacy SSO, window controls, updates (Unit/IC/
//                                  Dispatch names), and BigBoard's settings store when the variant opts in
//
// Every channel is answered by the main process only for the app's own origin (src/main/trusted-ipc.js).

const { contextBridge, ipcRenderer } = require('electron');

const readArg = (name) => {
  const prefix = `--resgrid-${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
};
const hasFlag = (name) => process.argv.includes(`--resgrid-${name}`);

const variant = readArg('variant');
const appVersion = readArg('version');

/** Subscribes to a main→page channel; returns the unsubscribe function. */
const subscribe = (channel, callback) => {
  if (typeof callback !== 'function') {
    return () => undefined;
  }
  const listener = (_event, payload) => {
    try {
      callback(payload);
    } catch (error) {
      console.error(`Error in ${channel} callback`, error);
    }
  };
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('__ELECTRON__', true);

contextBridge.exposeInMainWorld('electronNotifications', {
  /** @param {{ title: string, body: string, data?: unknown }} payload @returns {Promise<boolean>} shown */
  show: (payload) => ipcRenderer.invoke('notifications:show', payload),
  /** @returns {Promise<boolean>} */
  isSupported: () => ipcRenderer.invoke('notifications:isSupported'),
  /** A notification shown through `show` was clicked; receives its `data`. */
  onNotificationClicked: (callback) => subscribe('notification-clicked', callback),
});

contextBridge.exposeInMainWorld('electronDeepLinks', {
  /**
   * Receives every link on the app's protocol, starting with those that arrived before the page subscribed (cold start,
   * or while it was loading). Returns the unsubscribe function.
   * @param {(url: string) => void} callback
   */
  onDeepLink: (callback) => {
    const unsubscribe = subscribe('deep-link', callback);
    ipcRenderer
      .invoke('deep-links:subscribe')
      .then((pending) => {
        for (const link of Array.isArray(pending) ? pending : []) {
          try {
            callback(link);
          } catch (error) {
            console.error('Error in deep-link callback', error);
          }
        }
      })
      .catch((error) => console.error('Could not subscribe to deep links', error));
    return unsubscribe;
  },
});

// BigBoard only (variant-config `settingsIpc`): settings persisted by the main process so they survive an origin change.
// This window is the only writer, so reads after the first come from memory rather than a synchronous IPC round trip.
const settingsCache = new Map();
const settingsApi = hasFlag('settings-ipc')
  ? {
      getSetting: (key) => {
        if (!settingsCache.has(key)) {
          settingsCache.set(key, ipcRenderer.sendSync('settings:get', key));
        }
        return settingsCache.get(key);
      },
      setSetting: (key, value) => {
        // Cached even if the write fails, so this session still uses the value the user just chose.
        settingsCache.set(key, value);
        return ipcRenderer.sendSync('settings:set', key, value);
      },
    }
  : {};

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  variant,
  appVersion,
  versions: { chrome: process.versions.chrome, electron: process.versions.electron },
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),

  // Notifications (Unit's names for the same bridge as electronNotifications).
  showNotification: (options) => ipcRenderer.invoke('notifications:show', options),
  onNotificationClicked: (callback) => subscribe('notification-clicked', callback),

  // Desktop push: the main process holds the FCM connection; the page registers its token with Core like a browser token.
  pushStart: (firebaseConfig) => ipcRenderer.invoke('push:start', firebaseConfig),
  pushStop: (forget) => ipcRenderer.invoke('push:stop', forget),
  pushTakePendingClick: () => ipcRenderer.invoke('push:take-pending-click'),
  onPushReceived: (callback) => subscribe('push:received', callback),
  onPushNotificationClick: (callback) => subscribe('push:notification-click', callback),

  // Brokered SSO: a one-time loopback listener receives the broker's return.
  ssoListen: () => ipcRenderer.invoke('sso:listen'),
  ssoOpen: (id, authorizeUrl) => ipcRenderer.invoke('sso:open', id, authorizeUrl),
  ssoCancel: (id) => ipcRenderer.invoke('sso:cancel', id),

  // Legacy SSO (variants with a protocol): the provider returns to <protocol>://auth/callback through the OS.
  legacySsoOidc: (authority, clientId, reauthenticate) => ipcRenderer.invoke('legacy-sso:oidc', authority, clientId, reauthenticate),
  legacySsoSaml: (signInUrl) => ipcRenderer.invoke('legacy-sso:saml', signInUrl),
  legacySsoCancel: () => ipcRenderer.invoke('legacy-sso:cancel'),

  // Auto-update: the page may offer "restart to update" once a download finished; otherwise it installs on quit.
  getUpdateStatus: () => ipcRenderer.invoke('update:get-status'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateAvailable: (callback) => subscribe('update:available', callback),
  onUpdateDownloaded: (callback) => subscribe('update:downloaded', callback),

  // Window controls (Unit's and BigBoard's names).
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),

  ...settingsApi,
});
