'use strict';
// Resgrid Omni desktop shell: one main process for all five variants (omni-plan §6.5). The variant comes from
// app-bundle/variant-config.json, written by scripts/build.mjs (or scripts/dev.mjs) from the variant manifest; the window
// runs that variant's web export. Structure from Unit (app:// protocol, single-instance lock, protocol client, menu, push
// receiver, SSO bridges), hardening from Dispatch (CSP, navigation guard, backslash rejection, deep-link queue,
// notification failure handling, page bridges), external links from IC, BigBoard's loopback origin and settings store as a
// per-variant opt-in, and auto-update through a generic feed per variant and channel.
//
// Pure logic lives in ./core and ./main (no electron import, unit-tested); this file only wires it to Electron.

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, Menu, Notification, dialog, ipcMain, nativeTheme, net, protocol, session, shell } = require('electron');

const { buildContentSecurityPolicy } = require('./core/csp');
const { createDeepLinkQueue, findDeepLink, parseDeepLink } = require('./core/deep-links');
const { shouldEnableAutoUpdate } = require('./core/update-feed');
const { isAllowedNavigation, isPermissionAllowed, originOf, safeDevServerUrl, safeExternalUrl } = require('./core/url-guards');
const { migrateLegacyUserData } = require('./core/user-data');
const { bundleOriginFor, loadVariantConfig } = require('./core/variant-config');
const { registerAppProtocol, registerAppScheme } = require('./main/app-protocol');
const { registerDisabledUpdateIpc, startAutoUpdate } = require('./main/auto-update');
const { registerLegacySso } = require('./main/legacy-sso');
const { startLoopbackServer } = require('./main/loopback-server');
const { buildMenuTemplate } = require('./main/menu');
const { createNotifier } = require('./main/notifications');
const { registerPushReceiver } = require('./main/push-receiver');
const { createSettingsStore, registerSettingsIpc } = require('./main/settings-store');
const { registerSsoLoopback } = require('./main/sso-loopback');
const { createTrustedIpc } = require('./main/trusted-ipc');

/** Call alerts (category `calls`, or a push code starting with C) stay on screen until dismissed. */
function isCriticalPush(payload) {
  return payload.category === 'calls' || /^c/i.test(payload.eventCode || '');
}

function fatal(title, error) {
  const message = error && error.message ? error.message : String(error);
  console.error(message);
  try {
    dialog.showErrorBox(title, message);
  } finally {
    app.exit(1);
  }
}

function main() {
  const isDev = !app.isPackaged;
  // Tests and dev.mjs may point at another bundle; a packaged app only ever runs its own.
  const bundleDir = isDev && process.env.RESGRID_DESKTOP_BUNDLE_DIR ? path.resolve(process.env.RESGRID_DESKTOP_BUNDLE_DIR) : path.join(__dirname, '..', 'app-bundle');
  const webRoot = path.join(bundleDir, 'web');
  const iconPath = path.join(bundleDir, 'icon.png');

  let config;
  try {
    config = loadVariantConfig(path.join(bundleDir, 'variant-config.json'));
  } catch (error) {
    fatal('Resgrid', error);
    return;
  }

  // Development: the Expo web dev server, loopback only. Never honoured in a packaged app.
  const devServerUrl = isDev ? safeDevServerUrl(process.env.RESGRID_DESKTOP_DEV_URL) : null;
  if (isDev && process.env.RESGRID_DESKTOP_DEV_URL && !devServerUrl) {
    fatal(config.productName, new Error('RESGRID_DESKTOP_DEV_URL must be an http(s) URL on localhost.'));
    return;
  }
  const devServerOrigin = devServerUrl ? originOf(devServerUrl) : null;

  // Profile folder: the legacy name for continuity (localStorage, push credentials); a separate one in development so a
  // dev run never shares an installed app's profile or single-instance lock (and may be pointed elsewhere entirely).
  const appDataDir = isDev && process.env.RESGRID_DESKTOP_APPDATA_DIR ? path.resolve(process.env.RESGRID_DESKTOP_APPDATA_DIR) : app.getPath('appData');
  const userDataDir = path.join(appDataDir, isDev ? `${config.userDataDir}-dev` : config.userDataDir);
  if (!isDev) {
    const outcome = migrateLegacyUserData({ appDataDir, targetDir: userDataDir, from: config.migrateUserDataFrom });
    if (outcome === 'migrated' || outcome === 'failed') {
      console.warn(`Legacy profile migration: ${outcome}`);
    }
  }
  app.setName(config.productName);
  app.setPath('userData', userDataDir);
  app.setPath('sessionData', userDataDir);

  app.enableSandbox();
  registerAppScheme(protocol);

  // Windows shows a toast only for the AppUserModelID the installer registered, which electron-builder sets to the appId.
  if (process.platform === 'win32') {
    app.setAppUserModelId(config.appId);
  }

  // One instance: on Windows and Linux the OS starts a second instance with the protocol link, which hands it to this
  // one and quits. A second launch from the dock or start menu shows this window.
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  const schemes = config.protocol ? [config.protocol] : [];
  if (config.protocol && (!isDev || process.env.RESGRID_DESKTOP_REGISTER_PROTOCOL === '1')) {
    if (process.defaultApp && process.argv.length >= 2) {
      // Unpackaged (electron .): the OS must start Electron with this app's entry script.
      app.setAsDefaultProtocolClient(config.protocol, process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient(config.protocol);
    }
  }

  let mainWindow = null;
  // The packaged origin is known up front except for BigBoard's loopback fallback port, set once the server is up.
  let appOrigin = devServerOrigin || (config.loopback ? null : bundleOriginFor(config));
  let loopbackServer = null;
  const allowedOrigins = () => [appOrigin].filter(Boolean);

  const trustedIpc = createTrustedIpc(ipcMain, allowedOrigins);

  const sendToPage = (channel, payload) => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) {
      return false;
    }
    mainWindow.webContents.send(channel, payload);
    return true;
  };

  const focusMainWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  };

  const openExternal = (value) => {
    const url = safeExternalUrl(value);
    if (url) {
      shell.openExternal(url).catch((error) => console.warn('Could not open an external link', error && error.message));
    }
  };

  // ── Deep links ─────────────────────────────────────────────────────
  const deepLinks = createDeepLinkQueue({ send: (link) => sendToPage('deep-link', link) });
  trustedIpc.handle('deep-links:subscribe', () => deepLinks.subscribe());

  // Legacy SSO: the provider and the SAML relay return through the OS to <protocol>://auth/callback. That link goes to the
  // waiting sign-in, never to the page; other links are forwarded. Variants without a protocol (BigBoard) use brokered
  // SSO over the loopback listener only.
  const legacySso = config.protocol
    ? registerLegacySso(trustedIpc, {
        scheme: config.protocol,
        openExternal: (url) => shell.openExternal(url),
        // The main process's network stack: system proxy settings, and no Origin header on the provider's token request.
        fetch: (url, init) => net.fetch(url, init),
        focus: focusMainWindow,
      })
    : null;

  const handleIncomingLink = (raw) => {
    const link = parseDeepLink(raw, schemes);
    if (!link || (legacySso && legacySso.handleLink(link))) {
      return;
    }
    deepLinks.push(link);
  };

  // ── Notifications and desktop push ─────────────────────────────────
  const notifier = createNotifier({ Notification, iconPath: fs.existsSync(iconPath) ? iconPath : undefined, appName: config.productName });

  trustedIpc.handle('notifications:isSupported', () => notifier.isSupported());
  trustedIpc.handle('notifications:show', (_event, payload) => {
    const data = payload && typeof payload === 'object' && payload.data !== undefined ? payload.data : null;
    return notifier.show({ title: payload && payload.title, body: payload && payload.body }, () => {
      focusMainWindow();
      sendToPage('notification-clicked', data);
    });
  });

  let createWindow = () => undefined;

  const pushReceiver = registerPushReceiver(trustedIpc, {
    storePath: path.join(userDataDir, 'push-receiver.json'),
    appName: config.productName,
    notify: (payload, onClick) => notifier.show({ title: payload.title, body: payload.body, critical: isCriticalPush(payload) }, onClick),
    isWindowFocused: () => !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused(),
    send: sendToPage,
    focus: () => {
      if (mainWindow) {
        focusMainWindow();
      } else if (app.isReady()) {
        createWindow();
      }
    },
  });

  // Brokered SSO returns to a one-time loopback listener; the provider opens in the member's own browser.
  registerSsoLoopback(trustedIpc, { openExternal: (url) => shell.openExternal(url), focus: focusMainWindow });

  if (config.settingsIpc) {
    registerSettingsIpc(trustedIpc, createSettingsStore(path.join(userDataDir, 'settings.json')));
  }

  // ── App info and window controls ───────────────────────────────────
  trustedIpc.handle('app:get-info', () => ({ variant: config.variant, version: app.getVersion(), channel: config.channel, platform: process.platform }));
  trustedIpc.handle('get-platform', () => process.platform);
  trustedIpc.handle('get-version', () => app.getVersion());
  trustedIpc.on('window:minimize', () => mainWindow && mainWindow.minimize());
  trustedIpc.on('window:toggle-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });
  trustedIpc.on('window:close', () => mainWindow && mainWindow.close());

  // ── OS links ───────────────────────────────────────────────────────
  app.on('second-instance', (_event, argv) => {
    if (!mainWindow && app.isReady()) {
      createWindow();
    } else {
      focusMainWindow();
    }
    const link = findDeepLink(argv, schemes);
    if (link) {
      handleIncomingLink(link);
    }
  });

  // macOS hands this app its protocol's links here (also before ready, on a cold start).
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleIncomingLink(url);
  });

  // Windows/Linux cold start from a link: it is in this instance's own arguments.
  const coldStartLink = findDeepLink(process.argv, schemes);
  if (coldStartLink) {
    handleIncomingLink(coldStartLink);
  }

  // ── Every web contents: no popups, no foreign navigation, no webviews ──
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      openExternal(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, legacyUrl) => {
      const target = event.url || legacyUrl;
      if (!isAllowedNavigation(target, allowedOrigins())) {
        event.preventDefault();
        openExternal(target);
      }
    });
    contents.on('will-redirect', (event, legacyUrl, _isInPlace, legacyIsMainFrame) => {
      const target = event.url || legacyUrl;
      const isMainFrame = event.isMainFrame !== undefined ? event.isMainFrame : legacyIsMainFrame;
      if (isMainFrame && !isAllowedNavigation(target, allowedOrigins())) {
        event.preventDefault();
      }
    });
  });

  createWindow = () => {
    const startUrl = devServerUrl || `${appOrigin}/`;
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 860,
      minWidth: 800,
      minHeight: 600,
      title: config.productName,
      show: false,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#ffffff',
      ...(process.platform !== 'darwin' && fs.existsSync(iconPath) ? { icon: iconPath } : {}),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        spellcheck: true,
        additionalArguments: [`--resgrid-variant=${config.variant}`, `--resgrid-version=${app.getVersion()}`, ...(config.settingsIpc ? ['--resgrid-settings-ipc'] : [])],
      },
    });

    // The window keeps the product name; the page's <title> does not replace it.
    mainWindow.on('page-title-updated', (event) => event.preventDefault());
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    });
    mainWindow.on('closed', () => {
      mainWindow = null;
      deepLinks.reset();
    });
    // A reload or navigation drops the page's subscriptions: links wait until it subscribes again.
    mainWindow.webContents.on('did-start-navigation', (event, _url, legacyIsInPlace, legacyIsMainFrame) => {
      const isMainFrame = event.isMainFrame !== undefined ? event.isMainFrame : legacyIsMainFrame;
      const isSameDocument = event.isSameDocument !== undefined ? event.isSameDocument : legacyIsInPlace;
      if (isMainFrame && !isSameDocument) {
        deepLinks.reset();
      }
    });

    mainWindow.loadURL(startUrl).catch((error) => console.error('Could not load the app', error && error.message));
  };

  app
    .whenReady()
    .then(async () => {
      if (!devServerUrl) {
        if (config.loopback) {
          const csp = buildContentSecurityPolicy({ appOrigins: [`http://${config.loopback.host}:${config.loopback.port}`] });
          const started = await startLoopbackServer(webRoot, { host: config.loopback.host, port: config.loopback.port, csp });
          loopbackServer = started.server;
          appOrigin = started.origin;
        } else {
          registerAppProtocol(protocol, net, { rootDir: webRoot, host: config.bundleHost, csp: buildContentSecurityPolicy({ appOrigins: [appOrigin] }) });
        }
      }

      // CSP on every document from the app's origins (the app:// handler also sets it on its own responses).
      const csp = buildContentSecurityPolicy({ appOrigins: [appOrigin], devServerOrigin });
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const isDocument = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame';
        if (!isDocument || !isAllowedNavigation(details.url, allowedOrigins())) {
          callback({});
          return;
        }
        const responseHeaders = {};
        for (const [name, value] of Object.entries(details.responseHeaders || {})) {
          if (name.toLowerCase() !== 'content-security-policy') {
            responseHeaders[name] = value;
          }
        }
        responseHeaders['Content-Security-Policy'] = [csp];
        callback({ responseHeaders });
      });
      session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
        callback(isPermissionAllowed(permission, (details && details.requestingUrl) || contents.getURL(), allowedOrigins()));
      });
      session.defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) => isPermissionAllowed(permission, requestingOrigin, allowedOrigins()));

      Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate({ platform: process.platform, isPackaged: app.isPackaged })));

      if (shouldEnableAutoUpdate({ feedUrl: config.updateFeedUrl, isPackaged: app.isPackaged, platform: process.platform })) {
        startAutoUpdate({ feedUrl: config.updateFeedUrl, notifyRenderer: sendToPage, trustedIpc });
      } else {
        registerDisabledUpdateIpc(trustedIpc);
      }

      createWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow();
        }
      });
    })
    .catch((error) => fatal(config.productName, error));

  // Settings such as the selected server URL live in localStorage, which Chromium writes lazily: flush before exiting so a
  // change made just before quitting survives the next launch.
  app.on('before-quit', () => {
    pushReceiver.stop();
    try {
      session.defaultSession.flushStorageData();
    } catch (error) {
      console.warn('Could not flush storage before quit', error && error.message);
    }
    if (loopbackServer) {
      loopbackServer.close();
      loopbackServer = null;
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

main();
