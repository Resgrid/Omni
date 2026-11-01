// The main process's wiring (src/main.js) with Electron stood in: per-variant identity (profile folder, AppUserModelID,
// protocol), single-instance lock, IPC only for the app origin, deep links queued until the page subscribes, legacy SSO
// callbacks kept from the page, BigBoard's opt-ins, and a hardened window on app ready.
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadVariant } = require('@resgrid/config-plugins');

const { createVariantConfig } = require('../core/variant-config');

const mockState = {};

const mockReset = (appData) => {
  mockState.appEvents = {};
  mockState.handlers = new Map();
  mockState.listeners = new Map();
  mockState.windows = [];
  mockState.contentsEvents = {};
  mockState.readyResolve = null;
  mockState.ready = new Promise((resolve) => {
    mockState.readyResolve = resolve;
  });
  mockState.app = {
    isPackaged: false,
    on: jest.fn((event, handler) => {
      mockState.appEvents[event] = handler;
    }),
    getPath: jest.fn((name) => (name === 'appData' ? appData : path.join(appData, name))),
    setPath: jest.fn(),
    setName: jest.fn(),
    enableSandbox: jest.fn(),
    setAppUserModelId: jest.fn(),
    requestSingleInstanceLock: jest.fn(() => true),
    setAsDefaultProtocolClient: jest.fn(),
    whenReady: jest.fn(() => mockState.ready),
    isReady: jest.fn(() => false),
    quit: jest.fn(),
    exit: jest.fn(),
    getVersion: jest.fn(() => '8.0.0'),
  };
  mockState.protocol = { registerSchemesAsPrivileged: jest.fn(), handle: jest.fn() };
  mockState.session = {
    defaultSession: {
      webRequest: { onHeadersReceived: jest.fn() },
      setPermissionRequestHandler: jest.fn(),
      setPermissionCheckHandler: jest.fn(),
      flushStorageData: jest.fn(),
    },
  };
  mockState.shell = { openExternal: jest.fn(async () => undefined) };
  mockState.dialog = { showErrorBox: jest.fn() };
};

jest.mock('electron', () => {
  const BrowserWindow = jest.fn((options) => {
    const contents = {
      on: jest.fn((event, handler) => {
        mockState.contentsEvents[event] = handler;
      }),
      send: jest.fn(),
      isLoading: () => false,
      openDevTools: jest.fn(),
    };
    const win = {
      options,
      webContents: contents,
      on: jest.fn(),
      once: jest.fn(),
      loadURL: jest.fn(async () => undefined),
      isDestroyed: () => false,
      isMinimized: () => false,
      isFocused: () => true,
      show: jest.fn(),
      focus: jest.fn(),
    };
    mockState.windows.push(win);
    return win;
  });
  BrowserWindow.getAllWindows = () => mockState.windows;
  return {
    get app() {
      return mockState.app;
    },
    BrowserWindow,
    Menu: { buildFromTemplate: jest.fn((t) => t), setApplicationMenu: jest.fn() },
    Notification: { isSupported: () => false },
    get dialog() {
      return mockState.dialog;
    },
    ipcMain: {
      handle: (channel, handler) => mockState.handlers.set(channel, handler),
      on: (channel, listener) => mockState.listeners.set(channel, listener),
    },
    nativeTheme: { shouldUseDarkColors: false },
    net: { fetch: jest.fn() },
    get protocol() {
      return mockState.protocol;
    },
    get session() {
      return mockState.session;
    },
    get shell() {
      return mockState.shell;
    },
  };
});

const invoke = (channel, frameUrl, ...args) => Promise.resolve().then(() => mockState.handlers.get(channel)({ senderFrame: { url: frameUrl } }, ...args));

describe('main process wiring', () => {
  let tmp;
  let bundleDir;
  const savedEnv = { ...process.env };

  const startMain = (variant) => {
    fs.writeFileSync(path.join(bundleDir, 'variant-config.json'), JSON.stringify(createVariantConfig(loadVariant(variant), { version: '8.0.0' })));
    jest.isolateModules(() => {
      require('../main');
    });
  };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-main-'));
    bundleDir = path.join(tmp, 'bundle');
    fs.mkdirSync(path.join(bundleDir, 'web'), { recursive: true });
    fs.writeFileSync(path.join(bundleDir, 'web', 'index.html'), '<html></html>');
    mockReset(path.join(tmp, 'appdata'));
    process.env.RESGRID_DESKTOP_BUNDLE_DIR = bundleDir;
    process.env.RESGRID_DESKTOP_REGISTER_PROTOCOL = '1';
    delete process.env.RESGRID_DESKTOP_DEV_URL;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    fs.rmSync(tmp, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it("sets Unit's identity, lock and protocol", () => {
    startMain('unit');
    const { app } = mockState;
    expect(app.enableSandbox).toHaveBeenCalled();
    expect(app.setName).toHaveBeenCalledWith('Resgrid Unit');
    expect(app.setPath).toHaveBeenCalledWith('userData', path.join(tmp, 'appdata', 'unit-dev'));
    expect(app.requestSingleInstanceLock).toHaveBeenCalled();
    expect(app.setAsDefaultProtocolClient.mock.calls[0][0]).toBe('resgridunit');
    if (process.platform === 'win32') {
      expect(app.setAppUserModelId).toHaveBeenCalledWith('com.resgrid.unit');
    }
    expect(mockState.protocol.registerSchemesAsPrivileged).toHaveBeenCalled();
    expect([...mockState.handlers.keys()]).toEqual(expect.arrayContaining(['push:start', 'sso:listen', 'legacy-sso:oidc', 'deep-links:subscribe', 'notifications:show', 'app:get-info']));
    expect(mockState.listeners.has('settings:get')).toBe(false);
  });

  it('answers IPC from the app origin only', async () => {
    startMain('unit');
    await expect(invoke('app:get-info', 'app://bundle/')).resolves.toMatchObject({ variant: 'unit', version: '8.0.0', channel: 'production' });
    await expect(invoke('app:get-info', 'https://evil.com/')).rejects.toThrow('Untrusted sender');
  });

  it('queues deep links until the page subscribes and keeps SSO callbacks from it', async () => {
    startMain('unit');
    const preventDefault = jest.fn();
    mockState.appEvents['open-url']({ preventDefault }, 'ResgridUnit://call/5');
    mockState.appEvents['open-url']({ preventDefault }, 'resgridunit://auth/callback?state=forged');
    mockState.appEvents['open-url']({ preventDefault }, 'https://evil.com/');
    mockState.appEvents['second-instance']({}, ['Resgrid Unit.exe', '--flag', 'resgridunit://call/6']);
    expect(preventDefault).toHaveBeenCalledTimes(3);
    await expect(invoke('deep-links:subscribe', 'app://bundle/')).resolves.toEqual(['resgridunit://call/5', 'resgridunit://call/6']);
  });

  it('gives BigBoard its own profile, loopback origin and settings store, and no protocol', async () => {
    startMain('bigboard');
    const { app } = mockState;
    expect(app.setPath).toHaveBeenCalledWith('userData', path.join(tmp, 'appdata', 'resgrid-bigboard-dev'));
    expect(app.setAsDefaultProtocolClient).not.toHaveBeenCalled();
    expect(mockState.handlers.has('legacy-sso:oidc')).toBe(false);
    expect(mockState.handlers.has('sso:listen')).toBe(true);
    expect(mockState.listeners.has('settings:get')).toBe(true);
  });

  it('quits a second instance before wiring anything', () => {
    mockState.app.requestSingleInstanceLock.mockReturnValue(false);
    startMain('dispatch');
    expect(mockState.app.quit).toHaveBeenCalled();
    expect(mockState.handlers.size).toBe(0);
    expect(mockState.app.whenReady).not.toHaveBeenCalled();
  });

  it('stops with an error instead of running without a valid config', () => {
    fs.writeFileSync(path.join(bundleDir, 'variant-config.json'), '{"schemaVersion":1,"variant":"nope"}');
    jest.isolateModules(() => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      require('../main');
    });
    expect(mockState.dialog.showErrorBox).toHaveBeenCalled();
    expect(mockState.app.exit).toHaveBeenCalledWith(1);
    expect(mockState.app.requestSingleInstanceLock).not.toHaveBeenCalled();
  });

  it('opens a hardened window on app:// once ready, with CSP and navigation guards', async () => {
    startMain('dispatch');
    mockState.readyResolve();
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockState.protocol.handle).toHaveBeenCalledWith('app', expect.any(Function));
    expect(mockState.session.defaultSession.webRequest.onHeadersReceived).toHaveBeenCalled();
    const [win] = mockState.windows;
    expect(win.options.webPreferences).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, webviewTag: false });
    expect(win.options.webPreferences.additionalArguments).toContain('--resgrid-variant=dispatch');
    expect(win.loadURL).toHaveBeenCalledWith('app://./');

    // CSP is added to app documents only.
    const onHeaders = mockState.session.defaultSession.webRequest.onHeadersReceived.mock.calls[0][0];
    const appDoc = jest.fn();
    onHeaders({ resourceType: 'mainFrame', url: 'app://./', responseHeaders: { 'content-security-policy': ['x'] } }, appDoc);
    expect(appDoc.mock.calls[0][0].responseHeaders['Content-Security-Policy'][0]).toContain("object-src 'none'");
    expect(appDoc.mock.calls[0][0].responseHeaders['content-security-policy']).toBeUndefined();
    const apiCall = jest.fn();
    onHeaders({ resourceType: 'xhr', url: 'https://api.resgrid.com/api/v4/Calls', responseHeaders: {} }, apiCall);
    expect(apiCall).toHaveBeenCalledWith({});

    // Every web contents: foreign navigation blocked (http(s) goes to the OS browser), popups denied.
    const events = {};
    const contents = { on: jest.fn((event, handler) => (events[event] = handler)), setWindowOpenHandler: jest.fn() };
    mockState.appEvents['web-contents-created']({}, contents);
    const blocked = { preventDefault: jest.fn() };
    events['will-navigate'](blocked, 'https://evil.com/phish');
    expect(blocked.preventDefault).toHaveBeenCalled();
    expect(mockState.shell.openExternal).toHaveBeenCalledWith('https://evil.com/phish');
    const allowed = { preventDefault: jest.fn() };
    events['will-navigate'](allowed, 'app://./calls');
    expect(allowed.preventDefault).not.toHaveBeenCalled();
    const fileNav = { preventDefault: jest.fn() };
    events['will-navigate'](fileNav, 'file:///C:/Windows/win.ini');
    expect(fileNav.preventDefault).toHaveBeenCalled();
    const openHandler = contents.setWindowOpenHandler.mock.calls[0][0];
    expect(openHandler({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' });
    expect(mockState.shell.openExternal).toHaveBeenCalledTimes(1);
    const webview = { preventDefault: jest.fn() };
    events['will-attach-webview'](webview);
    expect(webview.preventDefault).toHaveBeenCalled();

    // Updates are off without a feed, but the page can still ask.
    await expect(invoke('update:get-status', 'app://./')).resolves.toEqual({ enabled: false, downloadedVersion: null });
  });
});
