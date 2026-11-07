# Web push

Browser notifications for the web edition of all five apps (Responder, Unit, IC, Dispatch, BigBoard), and the same Firebase setup for the Electron desktop apps. The phones use native push (expo-notifications + notifee) and are not covered here.

## How it works

1. Core hands out a Firebase web app in `Config/GetConfig` (`WebPushApiKey`, `WebPushAuthDomain`, `WebPushProjectId`, `WebPushMessagingSenderId`, `WebPushAppId`, `WebPushVapidKey`), and only once all of them are set. Without them the apps never ask for permission and register nothing.
2. After sign-in, the first click anywhere on the page opens the browser's permission prompt (browsers only allow it from a click). Dismissed, it asks again after 7 days. Denied, the person must re-allow notifications in the browser's site settings.
3. With permission, the page (`packages/notifications/src/push-notification.web.ts`) registers `/service-worker.js` at scope `/`, gets an FCM token from the Firebase JS SDK with the VAPID key, and registers it with Core as Platform 3:

   | App                           | Novu subscriber           | Endpoint                                       |
   | ----------------------------- | ------------------------- | ---------------------------------------------- |
   | Responder, Dispatch, BigBoard | `{code}_User_{userId}`    | `Devices/RegisterDevice`                       |
   | Unit                          | `{code}_Unit_{unitId}`    | `Devices/RegisterUnitDevice` (with `UnitId`)   |
   | IC                            | `{code}_IC_User_{userId}` | `Devices/RegisterDevice` (with `Source: 'IC'`) |

   Core adds the token to the subscriber's channel on the Novu web FCM integration (`resgrid-web-fcm`), next to that subscriber's other browsers (at most `WebPushConfig.MaxTokensPerSubscriber`, default 10). The token is re-registered daily, and moves when the person signs in to another department or Unit switches units.

4. Core sends every push with an FCM `webpush` block. The service worker (`apps/omni/public/service-worker.js`) shows it: calls stay on screen until handled, everything else can be dismissed. It also tells every open window (`PUSH_RECEIVED`), and a window the person is looking at shows the in-app alert with its sound.
5. A click focuses an open window, or opens one, and hands it the push (`NOTIFICATION_CLICK`). The app routes it the way a tap on a phone notification is routed (call, chat, message, …).
6. Sign-out takes the token off Core (`Devices/UnRegisterWebPush`) and deletes it at FCM.

The service worker is one file for all five apps. Expo copies `public/` into every export, and `scripts/web-export.mjs` writes the app's name into the copy (`packages/config-plugins/src/web-service-worker.js`) as the title of a push that arrives without one. The export fails if the worker is missing. It has no `fetch` handler, so it never touches the app's requests or caching.

The desktop apps do not use the service worker: Electron's main process holds its own FCM connection (`apps/desktop/src/main/push-receiver.js`) with the same Firebase web app and registers its token the same way.

## Setup

Once per Core environment (production, QA, each self-hosted install). As of 2026-11-07, `api.resgrid.com` and `qaapi.resgrid.dev` send every `WebPush*` field empty, so web push is off on both.

### 1. Firebase

Use the Firebase project whose service account the Novu integration in step 2 will use.

1. **Web app.** Firebase console → Project settings → General → Your apps → Add app → Web. Copy `apiKey`, `authDomain`, `projectId`, `messagingSenderId` and `appId` from the config it shows.
2. **VAPID key.** Project settings → Cloud Messaging → Web configuration → Web Push certificates → Generate key pair. Copy the public key (the long string beginning with `B`).
3. **APIs.** In Google Cloud console for the project, make sure **Firebase Cloud Messaging API** (V1), **FCM Registration API** and **Firebase Installations API** are enabled.
4. **API key restrictions.** Google Cloud console → APIs & Services → Credentials → the web app's browser key. Restrict it by API (the three above), **not** by HTTP referrer: the desktop apps register from Electron's main process, which sends no referrer, so a referrer-restricted key breaks desktop push. These values are public client identifiers, not secrets.
5. **Service account key.** Project settings → Service accounts → Generate new private key. Keep the JSON for step 2 (this one **is** a secret).

### 2. Novu

In the Novu environment Core uses (`ChatConfig.NovuEnvironmentId`): Integrations → Add a provider → Push → Firebase Cloud Messaging.

- **Identifier:** `resgrid-web-fcm`. Core looks it up by this name (`ChatConfig.NovuResponderWebFcmProviderId`, `NovuUnitWebFcmProviderId`, `NovuICWebFcmProviderId`). Change those settings too if you use another identifier.
- **Service account:** the JSON from step 1.5. It must belong to the same Firebase project as the web app, or FCM rejects every token.
- Keep it **active**. It stays separate from the native FCM integrations: a native registration replaces its channel's whole token list, while web tokens are added beside the subscriber's other browsers.

### 3. Core

Set the six values on the API service (`Resgrid.Web.Services`), either in `ResgridConfig.json`:

```json
{
  "WebPushConfig.FirebaseApiKey": "AIza...",
  "WebPushConfig.FirebaseAuthDomain": "<project>.firebaseapp.com",
  "WebPushConfig.FirebaseProjectId": "<project>",
  "WebPushConfig.FirebaseMessagingSenderId": "123456789012",
  "WebPushConfig.FirebaseAppId": "1:123456789012:web:abc123",
  "WebPushConfig.FirebaseVapidKey": "B..."
}
```

or as environment variables (`RESGRID__WebPushConfig__FirebaseApiKey`, `RESGRID__WebPushConfig__FirebaseAuthDomain`, …). Restart the service, then check that the fields come back filled:

```bash
curl -s "https://<api-host>/api/v4/Config/GetConfig?key=" | grep -o '"WebPush[A-Za-z]*":"[^"]*"'
```

### 4. Web hosting

- Deploy web images exported after this change: each must serve `/service-worker.js` at the site root. The bundled nginx config already serves it with `Cache-Control: no-cache`.
- Serve the app over **HTTPS** (browsers allow service workers and push only in a secure context; `http://localhost` works for development) and at the **root of its own host**. Each app has its own origin, so the five workers never share a scope.
- A reverse proxy or CDN in front must pass `/service-worker.js` through and must not cache it for long, or browsers keep an old worker.
- The default CSP allows what push needs. A custom `CONTENT_SECURITY_POLICY` must keep `worker-src 'self'` and allow `https://firebaseinstallations.googleapis.com` and `https://fcmregistrations.googleapis.com` in `connect-src`.

## Checking it works

1. Open the app over HTTPS, sign in, click anywhere and allow notifications.
2. DevTools → Application → Service workers: `/service-worker.js` is activated and running.
3. DevTools → Network: `Devices/RegisterDevice` (Unit: `RegisterUnitDevice`) went out with `Platform: 3` and succeeded.
4. In Novu, the subscriber (`{code}_User_{userId}` and so on) has an FCM credential on `resgrid-web-fcm` holding the token.
5. Put the tab in the background and dispatch a call to that person (Unit: that unit). The notification appears and stays until clicked. Clicking it brings the tab forward and opens the call. With the tab in front, the in-app alert also shows and plays its sound.
6. Sign out: `Devices/UnRegisterWebPush` goes out.

## Troubleshooting

| Symptom                                                                | Cause                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Never asked for permission                                             | `GetConfig` sends no `WebPush*` values; the page is not HTTPS; permission was denied before (site settings); iOS/iPadOS Safari (below).                                                                                              |
| Console: `Failed to register a ServiceWorker … (404)`                  | The deployed image predates the shared worker, or a proxy does not pass `/service-worker.js`.                                                                                                                                        |
| 403 from `firebaseinstallations.googleapis.com` or `fcmregistrations…` | The API key is restricted by referrer, or one of the APIs in step 1.3 is off.                                                                                                                                                        |
| Registration succeeds but nothing arrives                              | Core logs `Novu has no integration with identifier 'resgrid-web-fcm'`; the integration uses a service account from another Firebase project; Firebase Cloud Messaging API (V1) is off; the browser blocks notifications at OS level. |
| Pushes keep arriving after sign-out                                    | The sign-out could not reach Core or FCM. The next sign-in on that browser rotates the token; Core also drops the oldest tokens past the cap.                                                                                        |

## Browser support

Chrome, Edge, Firefox and Opera on desktop and Android, and Safari 16.4+ on macOS. On iOS and iPadOS, Safari allows push only for web apps added to the home screen, which needs a web app manifest the export does not have yet, so people on iPhone and iPad should use the native apps.

## Tests

- `apps/omni/__tests__/service-worker.test.ts`: the worker against a fake service worker scope (showing pushes, calls staying on screen, clicks with and without an open window).
- `packages/config-plugins/__tests__/web-service-worker.test.js`: each app's name stamped into its export.
- `apps/omni/e2e/web/web-push.spec.ts`: for every app, Chromium registers the exported worker and a push delivered through the DevTools protocol reaches it and the page (`pnpm check-all` runs it).
- `packages/notifications/src/__tests__/push-notification.web.test.ts`: the page side (permission, token, registration, sign-out).
- `apps/desktop/src/main/__tests__/push-receiver.test.ts`: the desktop receiver.

Not covered automatically: a real FCM token and delivery, which need the setup above. Run the checks in "Checking it works" once per environment.
