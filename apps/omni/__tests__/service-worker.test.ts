// The web push service worker (public/service-worker.js, docs/subsystems/web-push.md), run against a fake service worker
// scope: it shows Core's pushes, tells open windows about them, and hands a click to the app, including to a window it
// had to open. The page side is tested in packages/notifications (push-notification.web.test.ts).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { stampServiceWorker } = require('@resgrid/config-plugins');

const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'service-worker.js'), 'utf8');

interface WorkerPush {
  title: string;
  body: string;
  eventCode: string;
  type: string;
  category: string;
}

interface FakeWindow {
  id: string;
  focused: boolean;
  focus: jest.Mock<Promise<FakeWindow | null>, []>;
  postMessage: jest.Mock<void, [{ type: string; data: WorkerPush }]>;
}

/** What FCM delivers to a browser for one push. */
interface FcmWebPush {
  notification?: { title?: string; body?: string; tag?: string; renotify?: boolean; requireInteraction?: boolean };
  data?: { title?: string; message?: string; eventCode?: string; type?: string; category?: string };
  from?: string;
}

interface PushData {
  json: () => FcmWebPush | null;
  text: () => string;
}

interface ShownOptions {
  body: string;
  icon: string;
  tag?: string;
  renotify: boolean;
  requireInteraction: boolean;
  data: WorkerPush;
}

/** The window the next openWindow call resolves with, or a hold until the test resolves it. */
interface OpenWindowControl {
  next: FakeWindow | null;
  hold: boolean;
  resolve?: (client: FakeWindow | null) => void;
}

interface WorkerEvent {
  data?: PushData | { type: string } | null;
  source?: FakeWindow;
  notification?: { data: WorkerPush | null; close: jest.Mock };
  waitUntil?: (work: Promise<void>) => void;
}

const fakeWindow = (id: string, focused = false): FakeWindow => {
  const client: FakeWindow = { id, focused, focus: jest.fn(async () => client), postMessage: jest.fn() };

  return client;
};

const pushData = (payload: FcmWebPush | null): PushData => ({ json: () => payload, text: () => JSON.stringify(payload) });

/** Core's FCM webpush block for one push (NovuProvider.SendNotification). */
const corePush = (eventCode: string, category: string, title = 'Priority 1 Call', message = 'Structure fire at 1 Main St'): PushData =>
  pushData({
    notification: { title, body: message, tag: eventCode, renotify: true, requireInteraction: category === 'calls' },
    data: { title, message, eventCode, type: '', category },
    from: '343968022249',
  });

function loadWorker(source = SOURCE) {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const windows: FakeWindow[] = [];
  const opened: OpenWindowControl = { next: null, hold: false };
  const showNotification = jest.fn(async (_title: string, _options: ShownOptions) => undefined);
  const consoleError = jest.fn();

  const scope = {
    addEventListener: (type: string, listener: (event: WorkerEvent) => void) => listeners.set(type, listener),
    skipWaiting: jest.fn(),
    registration: { showNotification },
    clients: {
      matchAll: jest.fn(async () => windows),
      claim: jest.fn(async () => undefined),
      openWindow: jest.fn(
        (_url: string) =>
          new Promise<FakeWindow | null>((resolve) => {
            if (opened.hold) opened.resolve = resolve;
            else resolve(opened.next);
          })
      ),
    },
  };

  vm.runInNewContext(source, {
    self: scope,
    console: { error: consoleError },
    setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
  });

  /** Dispatches one event; resolves with its waitUntil work (or at once when it has none). */
  const dispatch = (type: string, event: WorkerEvent): Promise<void> => {
    let work: Promise<void> = Promise.resolve();
    const listener = listeners.get(type);

    if (!listener) throw new Error(`the worker has no ${type} listener`);
    listener({ ...event, waitUntil: (promise) => (work = promise) });

    return work;
  };

  const click = (data: WorkerPush | null) => {
    const close = jest.fn();

    return { close, done: dispatch('notificationclick', { notification: { data, close } }) };
  };

  return { listeners, windows, opened, scope, showNotification, consoleError, dispatch, click };
}

const unitCall: WorkerPush = { title: 'Priority 1 Call', body: 'Structure fire at 1 Main St', eventCode: 'C1234', type: '', category: 'calls' };

afterEach(() => {
  jest.useRealTimers();
});

describe('push', () => {
  it("shows Core's push with its own title, body and event code, and tells every open window", async () => {
    const worker = loadWorker();
    const windows = [fakeWindow('a'), fakeWindow('b')];

    worker.windows.push(...windows);
    await worker.dispatch('push', { data: corePush('C1234', 'calls') });

    expect(worker.showNotification).toHaveBeenCalledWith('Priority 1 Call', {
      body: 'Structure fire at 1 Main St',
      icon: '/favicon.ico',
      tag: 'C1234',
      renotify: true,
      requireInteraction: true,
      data: unitCall,
    });
    expect(worker.scope.clients.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true });
    windows.forEach((client) => expect(client.postMessage).toHaveBeenCalledWith({ type: 'PUSH_RECEIVED', data: unitCall }));
  });

  it.each([
    ['a call by category', 'C77', 'calls', true],
    ['a legacy call code without a category', 'c77', '', true],
    ['the communication test', 'CT:abc', '', false],
    ['a call closed', 'NC:77', 'notifications', false],
    ['an inbox message', 'M55', 'messages', false],
    ['a chat', 't:9', 'chats', false],
  ])('keeps only calls on screen until handled: %s', async (_name, eventCode, category, sticky) => {
    const worker = loadWorker();

    await worker.dispatch('push', { data: corePush(eventCode, category) });

    expect(worker.showNotification).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ requireInteraction: sticky, tag: eventCode }));
  });

  it("falls back to the notification block, then to the app's name", async () => {
    const worker = loadWorker(stampServiceWorker(SOURCE, 'Resgrid Unit'));

    await worker.dispatch('push', { data: pushData({ notification: { title: 'From FCM', body: 'Body only here' } }) });
    await worker.dispatch('push', { data: pushData({ data: { message: 'No title anywhere', eventCode: 'M1' } }) });

    expect(worker.showNotification).toHaveBeenNthCalledWith(1, 'From FCM', expect.objectContaining({ body: 'Body only here' }));
    expect(worker.showNotification).toHaveBeenNthCalledWith(2, 'Resgrid Unit', expect.objectContaining({ body: 'No title anywhere', tag: 'M1' }));
  });

  it('shows a push that is not JSON as its text, untagged, and an empty one with the default title', async () => {
    const worker = loadWorker();

    const plain: PushData = {
      json: () => {
        throw new SyntaxError('not JSON');
      },
      text: () => 'Plain text push',
    };

    await worker.dispatch('push', { data: plain });
    await worker.dispatch('push', { data: null });

    expect(worker.showNotification).toHaveBeenNthCalledWith(1, 'Resgrid', expect.objectContaining({ body: 'Plain text push', tag: undefined, renotify: false }));
    expect(worker.showNotification).toHaveBeenNthCalledWith(2, 'Resgrid', expect.objectContaining({ body: '', tag: undefined, renotify: false }));
  });

  it('logs a push it could not show, since a rejected waitUntil leaves no trace', async () => {
    const worker = loadWorker();

    worker.showNotification.mockRejectedValueOnce(new TypeError('permission revoked'));

    await expect(worker.dispatch('push', { data: corePush('C1', 'calls') })).resolves.toBeUndefined();
    expect(worker.consoleError).toHaveBeenCalledWith('Web push: the push could not be handled', expect.objectContaining({ eventCode: 'C1' }));
  });
});

describe('notification click', () => {
  it('closes the notification, focuses the window the person is on and hands it the click', async () => {
    const worker = loadWorker();
    const other = fakeWindow('other');
    const current = fakeWindow('current', true);

    worker.windows.push(other, current);
    const { close, done } = worker.click(unitCall);

    await done;

    expect(close).toHaveBeenCalled();
    expect(current.focus).toHaveBeenCalled();
    expect(current.postMessage).toHaveBeenCalledWith({ type: 'NOTIFICATION_CLICK', data: unitCall });
    expect(other.postMessage).not.toHaveBeenCalled();
    expect(worker.scope.clients.openWindow).not.toHaveBeenCalled();
  });

  it('still hands the click over when the browser refuses the focus', async () => {
    const worker = loadWorker();
    const client = fakeWindow('a');

    client.focus.mockRejectedValueOnce(new Error('Not allowed to focus a window.'));
    worker.windows.push(client);
    await worker.click(unitCall).done;

    expect(client.postMessage).toHaveBeenCalledWith({ type: 'NOTIFICATION_CLICK', data: unitCall });
  });

  it('opens the app with no window open and hands it the click once it says CLIENT_READY', async () => {
    const worker = loadWorker();
    const opened = fakeWindow('new');

    worker.opened.next = opened;
    let settled = false;
    const { done } = worker.click(unitCall);

    void done.then(() => (settled = true));
    await new Promise((resolve) => setImmediate(resolve));

    expect(worker.scope.clients.openWindow).toHaveBeenCalledWith('/');
    expect(opened.postMessage).not.toHaveBeenCalled();
    // The worker stays alive (waitUntil pending) until the page can take the click.
    expect(settled).toBe(false);

    await worker.dispatch('message', { data: { type: 'CLIENT_READY' }, source: opened });
    await done;

    expect(opened.postMessage).toHaveBeenCalledTimes(1);
    expect(opened.postMessage).toHaveBeenCalledWith({ type: 'NOTIFICATION_CLICK', data: unitCall });
  });

  it('hands the click over at once when the new window said CLIENT_READY before openWindow resolved', async () => {
    const worker = loadWorker();
    const opened = fakeWindow('fast');

    worker.opened.hold = true;
    const { done } = worker.click(unitCall);

    await new Promise((resolve) => setImmediate(resolve));
    await worker.dispatch('message', { data: { type: 'CLIENT_READY' }, source: opened });
    expect(opened.postMessage).not.toHaveBeenCalled();

    worker.opened.resolve?.(opened);
    await done;

    expect(opened.postMessage).toHaveBeenCalledWith({ type: 'NOTIFICATION_CLICK', data: unitCall });
  });

  it('gives up on a window that never says CLIENT_READY, and gives a later page nothing', async () => {
    jest.useFakeTimers();
    const worker = loadWorker();
    const opened = fakeWindow('slow');

    worker.opened.next = opened;
    const { done } = worker.click(unitCall);

    await jest.advanceTimersByTimeAsync(60_000);
    await done;
    await worker.dispatch('message', { data: { type: 'CLIENT_READY' }, source: opened });

    expect(opened.postMessage).not.toHaveBeenCalled();
  });

  it('gives a page that loaded on its own nothing when it says CLIENT_READY', async () => {
    const worker = loadWorker();
    const page = fakeWindow('page');

    await worker.dispatch('message', { data: { type: 'CLIENT_READY' }, source: page });

    expect(page.postMessage).not.toHaveBeenCalled();
  });
});

describe('lifecycle', () => {
  it('takes over at once, and leaves the app’s requests alone (no fetch handler)', async () => {
    const worker = loadWorker();

    await worker.dispatch('install', {});
    await worker.dispatch('activate', {});

    expect(worker.scope.skipWaiting).toHaveBeenCalled();
    expect(worker.scope.clients.claim).toHaveBeenCalled();
    expect(worker.listeners.has('fetch')).toBe(false);
  });
});
