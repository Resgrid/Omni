/**
 * Push service worker for the web edition of all five apps (docs/subsystems/web-push.md). One file for every variant:
 * Expo copies public/ into each export and scripts/web-export.mjs writes the app's name into DEFAULT_TITLE
 * (packages/config-plugins/src/web-service-worker.js); `expo start --web` serves it as it is here.
 *
 * The page mints its FCM web token against this registration (packages/notifications/src/push-notification.web.ts),
 * but Firebase is not loaded here: every push is shown below. Core sends the fields in the FCM webpush block
 * (NovuProvider.SendNotification): data carries title, message, eventCode, type and category.
 *
 * The app does the routing. A click focuses an open window and posts NOTIFICATION_CLICK to it; with no window open,
 * the new one is handed the push once it says CLIENT_READY. Every push is also posted as PUSH_RECEIVED so a window the
 * person is looking at can show its in-app alert.
 *
 * Electron does not use this worker: its main process receives pushes itself (apps/desktop/src/main/push-receiver.js).
 * There is no fetch handler on purpose: this worker never touches the app's requests or caching.
 */

const DEFAULT_TITLE = /* resgrid:app-name */ 'Resgrid';

/** How long a window this worker opened has to say CLIENT_READY before the click that opened it is dropped. */
const HANDOFF_TIMEOUT_MS = 60 * 1000;

// Clicks waiting for the window they opened to finish loading, by client id.
const pendingClicks = new Map();

// Windows that said CLIENT_READY before the openWindow that created them resolved, by client id, with the time.
const earlyReady = new Map();

// FCM carries only strings in data and notification; anything missing reads as empty.
const text = (value) => (value === undefined || value === null ? '' : String(value));

function readPush(event) {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json() || {};
    } catch {
      payload = { notification: { body: event.data.text() } };
    }
  }

  const notification = payload.notification || {};
  const data = payload.data || {};

  return {
    title: text(data.title) || text(notification.title) || text(payload.title) || DEFAULT_TITLE,
    body: text(data.message) || text(notification.body) || text(data.body) || text(payload.body) || text(payload.message),
    eventCode: text(data.eventCode) || text(payload.eventCode),
    type: text(data.type),
    category: text(data.category),
  };
}

/** Calls stay on screen until handled. `CT:` (communication test) is the one C code that is not a call. */
function isCall(push) {
  return push.category === 'calls' || /^c(?!t)/i.test(push.eventCode);
}

function deliverClick(client, data) {
  client.postMessage({ type: 'NOTIFICATION_CLICK', data });
}

/** Hands a click to the window it opened once that window has loaded, keeping this worker alive until then. */
function handOverClick(client, data) {
  if (earlyReady.delete(client.id)) {
    deliverClick(client, data);

    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingClicks.delete(client.id);
      resolve();
    }, HANDOFF_TIMEOUT_MS);

    pendingClicks.set(client.id, {
      data,
      done: () => {
        clearTimeout(timer);
        resolve();
      },
    });
  });
}

self.addEventListener('push', (event) => {
  const push = readPush(event);

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(push.title, {
        body: push.body,
        icon: '/favicon.ico',
        // A tag without renotify replaces silently; renotify without a tag is an error.
        tag: push.eventCode || undefined,
        renotify: !!push.eventCode,
        requireInteraction: isCall(push),
        data: push,
      }),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
        windows.forEach((client) => client.postMessage({ type: 'PUSH_RECEIVED', data: push }));
      }),
    ]).catch((error) => {
      // A rejected waitUntil is dropped without a word: this is the only trace a failed push leaves.
      console.error('Web push: the push could not be handled', { eventCode: push.eventCode, error });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        const client = windows.find((candidate) => candidate.focused) || windows.find((candidate) => 'focus' in candidate);

        if (client) {
          // A browser may refuse the focus; the window still gets the click.
          return client
            .focus()
            .catch(() => client)
            .then((focused) => deliverClick(focused || client, data));
        }

        if (!self.clients.openWindow) {
          return undefined;
        }

        return self.clients.openWindow('/').then((opened) => (opened ? handOverClick(opened, data) : undefined));
      })
      .catch((error) => {
        console.error('Web push: a notification click could not be handled', { eventCode: data.eventCode, error });
      })
  );
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (!event.data || !event.source || event.data.type !== 'CLIENT_READY') {
    return;
  }

  // A window this worker opened has loaded: hand it the click that opened it.
  const pending = pendingClicks.get(event.source.id);

  if (pending) {
    pendingClicks.delete(event.source.id);
    deliverClick(event.source, pending.data);
    pending.done();

    return;
  }

  // Every page says CLIENT_READY when it loads; one opened for a click may say it before openWindow resolves.
  const now = Date.now();
  earlyReady.forEach((readyAt, id) => {
    if (now - readyAt > HANDOFF_TIMEOUT_MS) earlyReady.delete(id);
  });
  earlyReady.set(event.source.id, now);
});
