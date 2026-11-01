---
name: omni-platform-builds
description: Building, versioning and releasing the five Resgrid Omni apps for iOS, Android, web (Docker) and Electron (Windows, macOS, Linux) — EAS profiles per variant, version and versionCode continuity, Electron shell in apps/desktop, web export and Docker runtime env, CI matrix, secrets per GitHub Environment, config plugins and patches. Use when touching eas.json, app.config.ts build settings, CI workflows, Dockerfile/nginx, Electron packaging, release tags, signing, or config plugins.
---

# Platform builds and releases

Status: target design from `docs/architecture/omni-plan.md` §6 (2026-10-31). Each variant ships to six targets: iOS, Android, web (Docker image), Electron win/mac/linux.

## Native (EAS)

- One Expo project (`apps/omni`), **five EAS projects** (credentials, push keys and store bindings stay per app). `app.config.ts` sets `extra.eas.projectId` from the variant manifest.
- `eas.json` profiles are `<variant>-<profile>` (`production`, `production-aab`, `production-apk`, `staging`, `internal`, `development`, `dev-sim`, `simulator`) with `APP_VARIANT`/`APP_ENV` in `env`, `EXPO_NO_DOTENV=1`.
- Always export `APP_VARIANT` when running the CLI so it picks the right project: `APP_VARIANT=unit npx eas-cli build --profile unit-production --platform ios`.
- Native folders are generated (CNG). Never commit `ios/`/`android/`; change native config only through config plugins in `@resgrid/config-plugins`.
- Use a per-variant Metro cache (or `--clear`) — the route root and `EXPO_PUBLIC_*` are inlined at transform time.

## Versions — derived from GitHub Actions, never backwards

- `M` = run number of Omni's `release.yml` (never rename that file — its counter is the source). Per variant, from the manifest: `version = <major>.M`, `versionCode` / iOS `buildNumber` = `<base> + M`, Electron semver `<major>.M.0`.
- Majors and bases (plan Appendix B): Responder **11** / 5100000, Unit **8** / 100000, IC **2** / 100000, Dispatch **2** / 100000, BigBoard **4** / 100000. They sit above every legacy build (legacy: Responder `10.N` / `5080345+N`, Unit `7.N` / `"7"+N`, IC `1.N` / `"1"+N`, Dispatch and BigBoard `1.N` / `N`).
- Versions are computed once in the release `plan` job and passed to build jobs as outputs.
- Tags are namespaced per variant: `responder-v11.x`, `unit-v8.x`, `ic-v2.x`, `dispatch-v2.x`, `bigboard-v4.x`.

## Web

- `APP_VARIANT=<v> npx expo export -p web --output-dir dist/<v>` — the same export feeds Docker and all three Electron jobs.
- `docker/Dockerfile` takes `ARG APP_VARIANT`; images keep their names (`resgridllc/{responder,unit,ic,dispatch,bigboard}`).
- Runtime config: `window.__ENV__` from `env-config.js`, **merged over** build env. The entrypoint also accepts legacy `${PREFIX}_*` names (`RESPOND_`, `UNIT_`, `IC_`, `DISPATCH_`, `BIGBOARD_`) so existing deployments keep working.
- nginx: no-store for `index.html` and `env-config.js`, deny dotfiles, CSP, Referrer-Policy, AASA/assetlinks, `/health`.

## Electron (`apps/desktop`)

- Thin package: electron, electron-builder, push receiver, updater. It loads `dist/<variant>` via the `app://bundle` protocol. Never add RN dependencies here (legacy installers were 387 MB because of that).
- Hardening (keep): CSP via `session.webRequest`, `will-navigate` origin guard, backslash rejection, deep-link queue, single-instance lock, external links opened in the OS browser.
- Per-variant appId, productName, protocol and icons come from the manifest; BigBoard keeps its loopback origin (`127.0.0.1:29317`) or migrates its localStorage.
- Targets: dmg + zip (x64/arm64, hardened runtime, notarized), NSIS + portable (signed), AppImage/deb/rpm. Auto-update channel per variant.
- Electron runs the **web** bundle; there is no Metro `electron` platform. Desktop-only behaviour goes through the preload bridges (`__ELECTRON__`, notifications, deep links, settings).

## CI build chain (GitHub Actions — plan §6.6)

- `ci.yml` (PR/merge queue): lint, type-check, translation parity, dependency-cruiser, Jest shards, API contract tests, per-variant `expo config` snapshot + route contract + web export smoke.
- `release.yml` (master → `internal`, tag `<variant>-v*` → `production`, or dispatch): **plan** (versions, matrix, fingerprints) → per variant **web** export, **android** (one AAB build; APK via `bundletool --mode=universal`), **ios** (one App Store IPA; ad-hoc IPA via `fastlane resign`) — native jobs run only when the variant/platform fingerprint changed, otherwise **ota** (`eas update`) → **docker** and **electron** (win/mac/linux) from the web artifact → **release** (GitHub Release `<variant>-v<version>` with every emit + `SHA256SUMS`, Firebase App Distribution, Changerawr, Electron update feed) → optional **store-submit** behind an approval environment.
- `nightly.yml`: dev-client/simulator builds and e2e; `ota.yml`: manual JS-only updates.
- Rules: build each thing once (never rebuild the web app inside Docker or Electron jobs; never build dev clients on the release path); `fail-fast: false`; per-job timeouts; retries on network steps; release concurrency queues, PR concurrency cancels; signing material only in `$RUNNER_TEMP`, removed in an `always()` step.
- Electron updates use a generic feed per variant (`updates/<variant>/<channel>/`), not electron-updater's GitHub provider (five apps share one repo's releases).
- Secrets: one GitHub Environment per variant with identical secret names inside each (`EAS_PROJECT_ID`, `GOOGLE_SERVICES_JSON_BASE64`, `GRADLE_PROPERTIES`, MMKV key secret, signing material, Sentry DSN for that variant's own project…), plus `store-<variant>` environments for submission. Never prefix-hack names in workflows.

## Config plugins and patches

- One copy of each plugin in `@resgrid/config-plugins`; a variant opts in through its manifest. Notables: Live Activities (team id from env, never hardcoded), `withRestrictedBootReceivers` (all variants; Android 15 boot-receiver crash), `withoutBackgroundLocation` (IC posture), icon badge, MediaButton/InCallAudio native modules, notification sounds.
- Patches via pnpm `patchedDependencies`, one copy each (`@gluestack-ui/core`, `react-native-webview`). Document why each patch exists next to it.
- Upgrades: use the `expo-upgrade` skill; one PR bumps the catalog and is verified by the full variant matrix.
