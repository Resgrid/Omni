import { expect, test } from '../support/web-fixtures';

// Web push in a real browser (docs/subsystems/web-push.md): the export serves the shared push service worker with the
// app's name stamped in, the app registers it the way push-notification.web.ts does, and a push Core sends through FCM
// becomes a notification and a PUSH_RECEIVED message to the page. Getting a token needs Core's Firebase web app, so it is
// left to the manual check in that doc; the DevTools protocol delivers the push here instead of FCM. Clicks are covered by
// apps/omni/__tests__/service-worker.test.ts (no protocol command clicks a notification).

/** Core's FCM webpush block for a call dispatch (NovuProvider.SendNotification), as the browser receives it. */
const callPush = {
  notification: { title: 'Priority 1 Call', body: 'Structure fire at 1 Main St', tag: 'C1234', renotify: true, requireInteraction: true },
  data: { title: 'Priority 1 Call', message: 'Structure fire at 1 Main St', eventCode: 'C1234', type: '', category: 'calls' },
};

declare global {
  interface Window {
    /** Event codes of the PUSH_RECEIVED messages the page got from the worker (this test's listener). */
    rgPushReceived?: string[];
  }
}

/** What the worker passed to showNotification, as this test records it. */
interface ShownNotification {
  title: string;
  body: string;
  icon: string;
  tag: string;
  renotify: boolean;
  requireInteraction: boolean;
  eventCode: string;
}

test.describe('web push', () => {
  test("serves the push service worker under this app's name", async ({ request, manifest }) => {
    const response = await request.get('/service-worker.js');

    expect(response.ok(), '/service-worker.js is served').toBe(true);
    expect(response.headers()['content-type']).toMatch(/javascript/);
    expect(await response.text()).toContain(`const DEFAULT_TITLE = ${JSON.stringify(manifest.identity.name)};`);
  });

  test('shows a push Core sends and hands it to the open page', async ({ page, context, baseURL }) => {
    await page.goto('/');

    // The same registration push-notification.web.ts makes before it asks Firebase for a token.
    const scope = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });

      await navigator.serviceWorker.ready;
      const received: string[] = [];

      navigator.serviceWorker.addEventListener('message', (event: MessageEvent<{ type?: string; data?: { eventCode?: string } }>) => {
        if (event.data?.type === 'PUSH_RECEIVED') received.push(event.data.data?.eventCode ?? '');
      });
      window.rgPushReceived = received;

      return registration.scope;
    });

    expect(scope).toBe(`${baseURL}/`);

    const worker = context.serviceWorkers().find((candidate) => candidate.url() === `${baseURL}/service-worker.js`) ?? (await context.waitForEvent('serviceworker'));

    // Headless Chromium denies notification permission whatever is granted, so the worker's showNotification call is
    // recorded instead of read back from the browser. Everything before it is the browser's own push delivery.
    await worker.evaluate(`(() => {
      self.rgShown = [];
      self.registration.showNotification = async (title, options) => {
        self.rgShown.push({ title, body: options.body, icon: options.icon, tag: options.tag, renotify: options.renotify, requireInteraction: options.requireInteraction, eventCode: options.data.eventCode });
      };
    })()`);

    const cdp = await context.newCDPSession(page);

    const registrationId = new Promise<string>((resolve) => {
      cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
        const match = registrations.find((registration) => registration.scopeURL === scope && !registration.isDeleted);

        if (match) resolve(match.registrationId);
      });
    });

    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.deliverPushMessage', { origin: baseURL ?? '', registrationId: await registrationId, data: JSON.stringify(callPush) });

    await expect
      .poll(() => worker.evaluate<ShownNotification[]>('self.rgShown'))
      .toEqual([{ title: 'Priority 1 Call', body: 'Structure fire at 1 Main St', icon: '/favicon.ico', tag: 'C1234', renotify: true, requireInteraction: true, eventCode: 'C1234' }]);
    await expect.poll(() => page.evaluate(() => window.rgPushReceived)).toEqual(['C1234']);
  });
});
