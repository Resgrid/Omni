// Main-process bridges with injected Electron pieces: trusted IPC, notifications, BigBoard's settings store, the app://
// protocol handler, auto-update and the menu.
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createAppProtocolHandler, registerAppScheme } = require('../app-protocol');
const { registerDisabledUpdateIpc, startAutoUpdate } = require('../auto-update');
const { buildMenuTemplate } = require('../menu');
const { createNotifier } = require('../notifications');
const { createSettingsStore, MAX_SETTING_LENGTH, registerSettingsIpc } = require('../settings-store');
const { createTrustedIpc } = require('../trusted-ipc');

class FakeIpcMain {
  constructor() {
    this.handlers = new Map();
    this.listeners = new Map();
  }
  handle(channel, handler) {
    this.handlers.set(channel, handler);
  }
  on(channel, listener) {
    this.listeners.set(channel, listener);
  }
  invoke(channel, frameUrl, ...args) {
    return Promise.resolve().then(() => this.handlers.get(channel)({ senderFrame: frameUrl === null ? null : { url: frameUrl } }, ...args));
  }
  sendSync(channel, frameUrl, ...args) {
    const event = { senderFrame: { url: frameUrl }, returnValue: undefined };
    this.listeners.get(channel)(event, ...args);
    return event.returnValue;
  }
}

const quietLog = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };

describe('createTrustedIpc', () => {
  it("answers only the app's own origin", async () => {
    const ipc = new FakeIpcMain();
    const trusted = createTrustedIpc(ipc, () => ['app://bundle'], quietLog);
    trusted.handle('ping', (_event, value) => `pong ${value}`);
    trusted.on('sync', (event) => {
      event.returnValue = 'ok';
    });

    await expect(ipc.invoke('ping', 'app://bundle/calls', 1)).resolves.toBe('pong 1');
    await expect(ipc.invoke('ping', 'https://evil.com/', 1)).rejects.toThrow('Untrusted sender');
    await expect(ipc.invoke('ping', 'app://bundle.evil/', 1)).rejects.toThrow('Untrusted sender');
    await expect(ipc.invoke('ping', null, 1)).rejects.toThrow('Untrusted sender');
    expect(ipc.sendSync('sync', 'app://bundle/')).toBe('ok');
    expect(ipc.sendSync('sync', 'http://127.0.0.1:29317/')).toBeNull();
  });

  it('reads the allowed origins per message (loopback port known late)', async () => {
    const ipc = new FakeIpcMain();
    let origins = [];
    createTrustedIpc(ipc, () => origins, quietLog).handle('ping', () => 'pong');
    await expect(ipc.invoke('ping', 'http://127.0.0.1:29317/')).rejects.toThrow();
    origins = ['http://127.0.0.1:29317'];
    await expect(ipc.invoke('ping', 'http://127.0.0.1:29317/')).resolves.toBe('pong');
  });
});

describe('createNotifier', () => {
  class FakeNotification {
    static supported = true;
    static created = [];
    static isSupported() {
      return FakeNotification.supported;
    }
    constructor(options) {
      this.options = options;
      this.handlers = {};
      FakeNotification.created.push(this);
    }
    on(event, handler) {
      this.handlers[event] = handler;
    }
    show() {
      this.shown = true;
    }
  }

  beforeEach(() => {
    FakeNotification.supported = true;
    FakeNotification.created = [];
  });

  it('shows, holds and releases notifications (click, close, failed)', () => {
    const notifier = createNotifier({ Notification: FakeNotification, iconPath: '/icon.png', appName: 'Resgrid Unit', log: quietLog });
    const onClick = jest.fn();
    expect(notifier.show({ title: 'Call', body: 'Structure fire', critical: true }, onClick)).toBe(true);
    expect(notifier.show({ body: 'x'.repeat(5000) })).toBe(true);
    expect(notifier.show({})).toBe(true);
    const [call, long, empty] = FakeNotification.created;
    expect(call.options).toMatchObject({ title: 'Call', body: 'Structure fire', urgency: 'critical', timeoutType: 'never', icon: '/icon.png' });
    expect(long.options.body).toHaveLength(1024);
    expect(empty.options.title).toBe('Resgrid Unit');
    expect(notifier.activeCount).toBe(3);
    call.handlers.click();
    long.handlers.close();
    empty.handlers.failed();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(notifier.activeCount).toBe(0);
  });

  it('reports false when the system has no native notifications', () => {
    FakeNotification.supported = false;
    const notifier = createNotifier({ Notification: FakeNotification, appName: 'Resgrid Unit', log: quietLog });
    expect(notifier.isSupported()).toBe(false);
    expect(notifier.show({ title: 'x' })).toBe(false);
  });
});

describe('settings store (BigBoard)', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-settings-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('persists allowed keys only, through trusted IPC', () => {
    const ipc = new FakeIpcMain();
    const trusted = createTrustedIpc(ipc, () => ['http://127.0.0.1:29317'], quietLog);
    const file = path.join(dir, 'nested', 'settings.json');
    registerSettingsIpc(trusted, createSettingsStore(file), quietLog);

    const app = 'http://127.0.0.1:29317/';
    expect(ipc.sendSync('settings:get', app, 'baseUrl')).toBeNull();
    expect(ipc.sendSync('settings:set', app, 'baseUrl', 'https://api.example.com')).toBe(true);
    expect(ipc.sendSync('settings:get', app, 'baseUrl')).toBe('https://api.example.com');
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ baseUrl: 'https://api.example.com' });

    expect(ipc.sendSync('settings:set', app, 'token', 'secret')).toBe(false);
    expect(ipc.sendSync('settings:set', app, 'baseUrl', 'x'.repeat(MAX_SETTING_LENGTH + 1))).toBe(false);
    expect(ipc.sendSync('settings:set', 'https://evil.com/', 'baseUrl', 'https://evil.com')).toBeNull();
    expect(ipc.sendSync('settings:get', app, 'baseUrl')).toBe('https://api.example.com');

    expect(ipc.sendSync('settings:set', app, 'baseUrl', null)).toBe(true);
    expect(ipc.sendSync('settings:get', app, 'baseUrl')).toBeNull();
  });

  it('treats a corrupt file as empty', () => {
    const file = path.join(dir, 'settings.json');
    fs.writeFileSync(file, '[1,2');
    expect(createSettingsStore(file).get('baseUrl')).toBeNull();
  });
});

describe('app:// protocol handler', () => {
  let root;
  const net = { fetch: jest.fn(async (url) => new Response(`body of ${url.split('/').pop()}`, { status: 200, headers: { 'Content-Type': url.endsWith('.html') ? 'text/html' : 'text/javascript' } })) };

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-app-protocol-'));
    fs.writeFileSync(path.join(root, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(root, 'main.js'), '1');
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  const handler = (host = 'bundle') => createAppProtocolHandler(net, { rootDir: root, host, csp: "default-src 'self'" });

  it('serves the export with CSP on HTML and plain responses for assets', async () => {
    const html = await handler()({ url: 'app://bundle/' });
    expect(html.status).toBe(200);
    expect(html.headers.get('Content-Security-Policy')).toBe("default-src 'self'");
    expect(await html.text()).toBe('body of index.html');

    const route = await handler()({ url: 'app://bundle/calls/12' });
    expect(await route.text()).toBe('body of index.html');

    const js = await handler()({ url: 'app://bundle/main.js' });
    expect(js.headers.get('Content-Security-Policy')).toBeNull();
    expect(await js.text()).toBe('body of main.js');
  });

  it("refuses other hosts, traversal and backslashes; serves Dispatch's app://. host", async () => {
    expect((await handler()({ url: 'app://other/index.html' })).status).toBe(404);
    expect((await handler()({ url: 'app://bundle/..%5c..%5cwin.ini' })).status).toBe(403);
    expect((await handler()({ url: 'app://bundle/missing.js' })).status).toBe(404);
    expect((await handler('.')({ url: 'app://./index.html' })).status).toBe(200);
  });

  it('registers app:// as a privileged standard scheme', () => {
    const protocol = { registerSchemesAsPrivileged: jest.fn() };
    registerAppScheme(protocol);
    expect(protocol.registerSchemesAsPrivileged).toHaveBeenCalledWith([{ scheme: 'app', privileges: expect.objectContaining({ standard: true, secure: true, supportFetchAPI: true }) }]);
  });
});

describe('auto-update', () => {
  const fakeUpdater = () => {
    const handlers = {};
    return {
      handlers,
      setFeedURL: jest.fn(),
      on: jest.fn((event, handler) => {
        handlers[event] = handler;
      }),
      checkForUpdates: jest.fn(async () => null),
      quitAndInstall: jest.fn(),
    };
  };

  it('uses the generic feed, reports downloads and installs on request', async () => {
    const updater = fakeUpdater();
    const ipc = new FakeIpcMain();
    const trusted = createTrustedIpc(ipc, () => ['app://bundle'], quietLog);
    const notifyRenderer = jest.fn();
    const setIntervalImpl = jest.fn(() => ({ unref: jest.fn() }));
    startAutoUpdate({ feedUrl: 'https://dl.example.com/updates/unit/production/', createUpdater: () => updater, notifyRenderer, trustedIpc: trusted, log: quietLog, setIntervalImpl });

    expect(updater.setFeedURL).toHaveBeenCalledWith({ provider: 'generic', url: 'https://dl.example.com/updates/unit/production/' });
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.allowDowngrade).toBe(false);
    await Promise.resolve();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(setIntervalImpl).toHaveBeenCalledWith(expect.any(Function), 4 * 60 * 60 * 1000);

    await expect(ipc.invoke('update:install', 'app://bundle/')).resolves.toBe(false);
    updater.handlers['update-downloaded']({ version: '8.13.0' });
    expect(notifyRenderer).toHaveBeenCalledWith('update:downloaded', { version: '8.13.0' });
    await expect(ipc.invoke('update:get-status', 'app://bundle/')).resolves.toEqual({ enabled: true, downloadedVersion: '8.13.0' });
    await expect(ipc.invoke('update:install', 'app://bundle/')).resolves.toBe(true);
    await new Promise((resolve) => setImmediate(resolve));
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('never throws on a failed check', async () => {
    const updater = fakeUpdater();
    updater.checkForUpdates = jest.fn(async () => {
      throw new Error('offline');
    });
    const trusted = createTrustedIpc(new FakeIpcMain(), () => ['app://bundle'], quietLog);
    startAutoUpdate({ feedUrl: 'https://dl.example.com/updates/unit/production/', createUpdater: () => updater, notifyRenderer: jest.fn(), trustedIpc: trusted, log: quietLog, setIntervalImpl: () => null });
    updater.handlers.error(new Error('404'));
    await new Promise((resolve) => setImmediate(resolve));
    expect(quietLog.warn).toHaveBeenCalledWith('auto-update: check failed', 'offline');
  });

  it('answers status when updates are off', async () => {
    const ipc = new FakeIpcMain();
    registerDisabledUpdateIpc(createTrustedIpc(ipc, () => ['app://bundle'], quietLog));
    await expect(ipc.invoke('update:get-status', 'app://bundle/')).resolves.toEqual({ enabled: false, downloadedVersion: null });
  });
});

describe('buildMenuTemplate', () => {
  it('uses roles only, with developer tools only when unpackaged', () => {
    const packaged = buildMenuTemplate({ platform: 'win32', isPackaged: true });
    expect(packaged.map((item) => item.role)).toEqual(['fileMenu', 'editMenu', 'viewMenu', 'windowMenu']);
    expect(JSON.stringify(packaged)).not.toContain('toggleDevTools');
    expect(JSON.stringify(packaged)).not.toContain('label');
    const dev = buildMenuTemplate({ platform: 'darwin', isPackaged: false });
    expect(dev[0].role).toBe('appMenu');
    expect(JSON.stringify(dev)).toContain('toggleDevTools');
  });
});
