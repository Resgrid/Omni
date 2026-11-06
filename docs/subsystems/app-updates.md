# In-app updates (expo-updates OTA)

Plan: D18 (OTA from the first release), §6.2. The build side (fingerprint runtime versions, `updates.url`, the `production` / `staging` / `internal` channels, `eas update` in CI) is in `packages/config-plugins/src/app-config.js` and the release workflow. This note covers what the running app does.

Without it, expo-updates only downloads at launch (`checkAutomatically: ON_LOAD`, `fallbackToCacheTimeout: 0`) and applies on the following cold start, so an MDT tablet (Unit) or a wall display (BigBoard) that stays open for days never picks up an update.

## Where it runs

| Target                       | In-app updates | How new code arrives                                     |
| ---------------------------- | -------------- | -------------------------------------------------------- |
| iOS / Android release builds | Yes            | This service + expo's launch check                       |
| Development builds, Expo Go  | No             | Metro / the dev launcher (expo-updates reports disabled) |
| Web (Docker)                 | No             | Redeploy                                                 |
| Electron                     | No             | The Electron auto-updater                                |

Where it is off, every call is a no-op and Settings hides the section.

## Layering

- `@resgrid/core` (`src/updates/`) owns the service behind a typed `UpdatesModule` interface. It never imports `expo-updates`.
- `apps/omni` is the only package that depends on `expo-updates`. `app-updates.native.ts` passes the real module (`import * as Updates from 'expo-updates'` satisfies the interface, checked by `tsc`); `app-updates.ts` (web/Electron) passes `null`, so expo-updates stays out of the web bundle. Development builds also pass `null`. `shell-registrations.tsx` calls `configureAppUpdates({ module })` before the shell starts.
- `@resgrid/app-shell` (`src/updates/`) registers the init steps, the voice restart guard, the "Update ready" notice and the wall rule.
- `@resgrid/features/settings` shows Settings → App updates.

## When it checks

The check runs `checkForUpdateAsync`, then `fetchUpdateAsync` when the server has something newer (or a roll-back to the embedded update). Only one check runs at a time: callers that arrive during a check share it. It never throws. Failures are logged with their code only (`App update check failed`, a Sentry breadcrumb) and show as "Couldn't check for updates" in Settings.

1. **After sign-in:** the last session init step, `session.updates`, starts a check and returns at once. It is optional and never awaited, so it cannot fail or delay the bootstrap.
2. **On return to the foreground:** at most every 30 minutes (`APP_UPDATE_FOREGROUND_INTERVAL_MS`). Any check counts, so a foreground return shortly after sign-in does not check again. It goes through the shared lifecycle helper (`subscribeAppLifecycle`) and is started by the startup step `startup.updates`, right after Sentry.
3. **On demand:** Settings → App updates → **Check for updates**.

## How it applies

- By default a downloaded update applies on the next cold start (expo's default).
- The shell shows a small, dismissible **Update ready** toast (`ShellUpdateNotice`, next to the sync-attention toast). Tapping it restarts now (`reloadAsync`); restarting stays the member's choice. A dismissed notice does not come back for the same update. Settings also shows **Restart to update**.
- **Wall displays** (`useFormFactor()` = `wall`: wider than 1920 or kiosk mode) also restart by themselves once the update is downloaded and nobody has touched the shell for 5 minutes (`WALL_AUTO_RESTART_IDLE_MS`). The 5 minutes count from the later of the download and the last touch, so the notice is always up for at least that long. Touches are recorded by the shell frame's activity capture (`recordUserActivity`). This uses the form factor, not a manifest capability.
- **No automatic restart during a voice session:** a restart guard in the shell holds the wall display's automatic restart while LiveKit is connected or connecting (`useLiveKitStore` from `@resgrid/voice`); the wall display tries again every 30 seconds. A person who taps restart (the toast or Settings) restarts at once, voice session or not: they chose to. Department audio streams do not hold a restart. More guards for automatic restarts can be added with `registerAppUpdateRestartGuard(id, guard)`.

## Settings → App updates

Registered as built-in section `app-updates` (order 85, between Advanced and About) in `packages/features/src/settings/sections/app-updates-section.tsx`, and visible only where updates are on. It shows the version and build, the update channel, the runtime version (first 12 characters of the fingerprint), the current update (first 8 characters of its id, with its publish date), whether the embedded build or a downloaded update is running, an emergency-launch notice when there is one, the check status, **Check for updates** (spinner, disabled while a check runs) and, once an update is downloaded, **Restart to update**.

## Sentry

`@sentry/react-native`'s default ExpoContext integration already tags every event with `expo.updates.update_id`, `expo.updates.channel` and `expo.updates.runtime_version`, adds an `ota_updates` context, and sends a warning event on an emergency launch. Its ExpoUpdatesListener integration adds breadcrumbs for checks, downloads and restarts. `createSentryOptions` passes `integrations` as an array, which keeps those defaults. A test pins this. On an emergency launch the service also logs a warning (`Emergency launch: …`), which the logger forwards to Sentry as a breadcrumb.

## Testing on a device

Build a release variant on a channel, for example `APP_VARIANT=unit` with the `unit-internal` profile. Publish a JS-only change to that channel. Then open Settings → App updates → **Check for updates**: the status reaches "An update is ready" and **Restart to update** applies it. For the wall rule, run BigBoard in kiosk mode, publish, and leave the display untouched for 5 minutes after the download. Never publish to `production` unless the owner asks (AGENTS.md).

## Translations

The 24 new strings (`settings.app_updates.*`, `shell.update_*`) were drafted by an AI in the nine non-English languages. They are listed in `packages/i18n/review/missing-translations.csv` and need native-speaker review.
