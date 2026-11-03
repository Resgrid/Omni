# UI acceptance tests

End-to-end checks that run the **built** apps, as opposed to the Jest suites in each package (omni-plan §12).

| Suite      | Runs against                                                           | Tool                   | Where it runs in CI                                                |
| ---------- | ---------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------ |
| `web/`     | `apps/omni/dist/<variant>` (web export) served by a tiny static server | Playwright (Chromium)  | `ci.yml`, per variant, on every PR                                 |
| `desktop/` | The unpacked Electron build from `apps/desktop`                        | Playwright `_electron` | `release.yml`, Linux Electron leg (non-blocking for now)           |
| `maestro/` | A dev-client build on an Android emulator or iOS simulator             | Maestro                | `nightly.yml`, one variant per night (rotates), or chosen variants |

```
e2e/
  playwright.config.ts   projects web-<variant> and desktop-<variant>
  pages/                 page objects shared by web and desktop (both run the web bundle)
  support/               variant manifests, static server, fixtures (console-error guard, Electron launcher)
  web/*.spec.ts          web flows
  desktop/*.spec.ts      Electron flows
  qa/                    release regression checks against seeded QA departments (web), shared with qa-desktop/ (Electron)
  qa-regression.ts       `pnpm qa:regression <variant>`: QA stack, then web, Electron, iOS and Android phone + tablet
  maestro/
    run-maestro.mjs      resolves the app id from the manifest and runs one variant's flows (or --flows)
    shared/              reusable sub-flows (launch, home visible)
    qa/                  QA sub-flows (sign-in, open a screen) the regression run's generated flows call
    <variant>/*.yaml     that variant's flows
```

## Web and desktop (Playwright)

Until `@playwright/test` is a root devDependency, `scripts/ci/run-playwright.mjs` installs the pinned version outside the repository and runs it. Once the dependency is added, the same command uses the workspace copy.

```bash
# once: a browser for the web suite
node scripts/ci/run-playwright.mjs install chromium

# export one variant and test it
APP_VARIANT=unit pnpm --filter @resgrid/omni web:export
E2E_VARIANT=unit node scripts/ci/run-playwright.mjs test -c apps/omni/e2e/playwright.config.ts --project web-unit

# every exported variant (default when E2E_VARIANT is unset)
node scripts/ci/run-playwright.mjs test -c apps/omni/e2e/playwright.config.ts

# desktop: build an unpacked app, then run its project (skipped when no build is found)
pnpm --filter @resgrid/desktop build --variant bigboard --dir
node scripts/ci/run-playwright.mjs test -c apps/omni/e2e/playwright.config.ts --project desktop-bigboard
```

- `E2E_VARIANT` picks the web projects: comma-separated, or `all`.
- `E2E_DESKTOP_EXECUTABLE` points at a specific Electron executable. `E2E_DESKTOP_DIR` sets the folder to search. Otherwise the suite looks in `apps/desktop/release/<variant>` and `apps/desktop/out`.
- Every web and desktop test fails when the page logs `console.error`, throws an uncaught exception, or gets a 4xx/5xx for one of the export's own files. If a known error has to be tolerated, set `allowedConsoleErrors` for that test with `test.use({ allowedConsoleErrors: [/pattern/] })` and explain why next to it.
- Reports go to `e2e/playwright-report`, traces and screenshots of failures to `e2e/test-results`, and CI JUnit to `e2e/results` (all git-ignored).

### Adding flows

- Put a screen's locators and actions in a page object under `pages/`. Specs stay short and the web and desktop suites share them. Locate elements by the `testID`s the components already carry (React Native Web renders them as `data-testid`).
- Gate a flow on the variant's capabilities, never on its id. Use `test.skip(!manifest.capabilities.calls.dispatch, 'no dispatch in this app')` (extend `VariantManifest` in `support/variants.ts` with the fields you read).
- Flows that need a signed-in user (login, call list, status change) belong in `qa/`: they sign in to the seeded QA departments through `support/qa-fixtures.ts` (see the release regression suite below). Never commit credentials.

## Release regression suite (`qa/`, seeded QA departments)

Every screen of an app, signed in to each of the seeded QA departments from Core's `Docker/qa-departments` (base statuses, custom statuses, flags on, flags off, ADP, SSO optional and required, MFA, terminology, restricted permissions, modules off, empty, large, incident command, dispatch center), on the web, in Electron, and on iOS and Android phones and tablets. Run it before a release.

### One command

```bash
pnpm qa:regression unit                        # or pnpm qa:unit / qa:responder / qa:ic / qa:dispatch / qa:bigboard
pnpm qa:regression unit --platforms web,electron --scenarios base,flags-on,flags-off
pnpm qa:stack down                             # stop the QA stack when you are done (it is kept between runs)
```

`e2e/qa-regression.ts` does, in order:

1. **QA stack**: `qa-stack.py up` in the Core checkout (`--core`, `QA_CORE_DIR`, default `../Core`): Core built from that checkout, a fresh database migrated by Core, the departments seeded and verified. An already-seeded stack is kept. `--stack reuse` skips rebuilding Core; `--stack skip` uses a running stack as it is.
2. **web**: exports the app into the run folder and runs the `qa-<variant>` Playwright project (Chromium).
3. **electron**: the same checks in the desktop shell (`qa-desktop-<variant>`): `apps/desktop`'s main process, preload, `app://` protocol and CSP serving that export, unpackaged with its own empty profile per test (a packaged build would sign the installed app on this machine in to the QA server). The staged export gets an `env-config.js` naming the QA API, as the Docker image writes one.
4. **ios**: builds the development client (`scripts/run-native.mjs`) for an iPhone and an iPad simulator, starts Metro on `:8091` pointed at the QA stack's http door, and runs a generated Maestro flow per department: clean launch, sign-in, then every signed-in screen by deep link (`<app scheme>://<route>`) with a screenshot of each. The phone runs in portrait, the tablet in landscape; Responder and Unit tablets must show their permanent landscape sidebar, phones must not.
5. **android**: the same on a phone and a tablet emulator. The tablet AVD (`Resgrid_QA_Tablet`, Pixel Tablet profile) is created from the phone AVD's system image when it does not exist; the emulators reach Metro and the stack through `adb reverse`, and the tablet is turned to landscape.

Everything lands in `apps/omni/e2e/qa-output/<variant>/<run>/` (git-ignored): `summary.json`, Playwright and Maestro JUnit reports, traces, screenshots, the generated flows, and `metro.log` (console errors from the native apps are counted in the summary). The command exits 1 when any leg fails.

Needs Docker and Python 3 for the stack, Maestro (`brew install mobile-dev-inc/tap/maestro`) plus Xcode simulators for iOS and the Android SDK (emulator, platform-tools, cmdline-tools) for Android; it checks for each requested platform before starting. Options: `--ios-phone`, `--ios-tablet`, `--android-phone`, `--android-tablet` pick devices; `--keep-devices` leaves the simulators and emulators it booted running; `--workers`, `--metro-port`, `--settle-ms`. A full run of all departments on four devices takes hours; `--scenarios` narrows it. The native builds use the shared `apps/omni/ios` and `apps/omni/android` projects, which `run-native.mjs` prebuilds again when they were made for another app.

Native development builds talk to the stack over `http://localhost:5450`/`5451` (the apps allow plain http only to localhost in a development build): the stack's gateway presents those requests to Core as its https origin, so tokens have one issuer whichever door they came through, and rewrites the https URLs in Core's answers to the http doors. No certificate has to be installed on a device.

### The Playwright projects by hand

```bash
# in ../Core: an isolated Core stack built from that checkout, migrated, seeded and verified
python3 Docker/qa-departments/stack/qa-stack.py up

# here: every exported app against every department (or narrow with E2E_VARIANT / E2E_QA_SCENARIOS)
E2E_QA_MANIFEST=../Core/Docker/qa-departments/stack/private/out/qa-departments.json E2E_WEB_PORT=19300 E2E_VARIANT=all \
  node scripts/ci/run-playwright.mjs test -c apps/omni/e2e/playwright.config.ts --project 'qa-*'
```

- `qa-<variant>` and `qa-desktop-<variant>` projects exist only when `E2E_QA_MANIFEST` is set. The manifest holds the departments, the sign-in personas (with TOTP secrets for MFA-enrolled ones), ids of named records and the state each feature flag should evaluate to. It contains test credentials: keep it out of the repository.
- The app reads `BASE_API_URL` from `window.__ENV__`, so the production export points at the QA API (`apiUrl` in the manifest, or `E2E_QA_API_URL`) without a rebuild. The local stack's certificate is self-signed; the qa projects accept it (Electron through `--ignore-certificate-errors`).
- `E2E_WEB_PORT` (19300 for the local stack) serves the export on that port plus one per worker, the origins the QA API allows (CORS), with Electron's `app://bundle`, `app://.` and BigBoard's loopback origin. A shared QA server needs the same origins on its `ApiConfig.CorsAllowedOrigins`.
- `E2E_WEB_EXPORT_ROOT` tests exports kept outside `apps/omni/dist` (a release build, or a copy a parallel `web:export` cannot replace); `WEB_EXPORT_DIR` makes `web:export` write one there.
- `E2E_QA_SETTLE_MS` (default 1500) is how long each screen gets for its first requests.

Each department runs, for its admin (and the member in `restricted`), on the web and in Electron:

1. **Every screen renders**: each route file of the app's `(app)` group is opened (dynamic routes with the department's own call, unit or member; routes without a record are listed as skipped). A screen fails on a console error, an uncaught exception, a failed start-up, an unmatched route, or a Core response the app should never get.
2. **Flags reach the app**: `FeatureToggles/GetAll` as the app received it matches the state the seed predicted for that department.
3. **Flag-gated navigation**: entries gated on flags (`support/flag-gated-nav.json`, kept equal to each app's `nav.ts` by `packages/app-shell/src/__tests__/qa-flag-gated-nav.test.ts`) show in flags-on and are absent in flags-off.

Plus: password sign-in is refused in the SSO-only department, and an unenrolled member is sent to MFA enrollment where MFA is required.

Core answers are judged by `apiGuard`: any 5xx fails, and a 4xx fails unless `support/qa-expected-refusals.ts` explains it as a by-design refusal (with its reason). Keep that list short. MFA personas sign in with a fresh TOTP step each (`withTotpTime`): Core refuses a replayed step and counts the refusal toward the account lockout; after an interrupted run, `qa-stack.py unlock` clears lockouts on the local stack.

## Native (Maestro)

Install Maestro (https://maestro.mobile.dev), start an emulator or simulator, install a build, then:

```bash
# dev-client build (<variant>-dev-sim): start Metro first so the flows can open the bundle
APP_VARIANT=unit npx expo start --dev-client --port 8081      # in apps/omni
adb reverse tcp:8081 tcp:8081                                  # Android emulator only
node apps/omni/e2e/maestro/run-maestro.mjs --variant unit --platform android --dev-client-url http://localhost:8081

# a build with an embedded bundle (e.g. a production APK): no Metro, no suffix
node apps/omni/e2e/maestro/run-maestro.mjs --variant unit --platform android --app-env production

# print the resolved app id and command without running
node apps/omni/e2e/maestro/run-maestro.mjs --variant responder --platform ios --dry-run
```

- **The app id always comes from the variant manifest:** the iOS bundle id or the Android package, plus `.<APP_ENV>` outside production and internal. Dev-client and simulator builds are therefore `.development` (for example `com.resgrid.unit.development`). Responder's ids differ per platform (`com.wavetech.Resgrid` on iOS, `wtdt.resgrid.andriod` on Android, typo intended). Flows never hard-code an app id. The legacy repos shipped a stale `com.obytes.development`.
- The runner passes `APP_ID`, `APP_NAME`, `APP_VARIANT`, `DEV_CLIENT_URL` and `DEV_CLIENT_LINK` (`exp+<slug>://expo-development-client/?url=…`) as Maestro `-e` variables. To call `maestro test` by hand, pass the same variables, with `DEV_CLIENT_URL=none` for builds with an embedded bundle.
- Results: JUnit and screenshots under `e2e/maestro-output/<variant>`.
- Add a variant-only flow (status change, call detail, offline queue) as `maestro/<variant>/<flow>.yaml`. Shared steps go in `maestro/shared/`. React Native `testID`s are resource ids on Android and accessibility identifiers on iOS, so `id:` selectors work on both.

CI (`nightly.yml`) builds `<variant>-dev-sim` with `eas build --local`, starts Metro (`scripts/ci/start-metro.sh`) and runs `scripts/ci/maestro-android.sh` inside `reactivecircus/android-emulator-runner` (API 35, x86_64). CI builds no iOS dev builds; on a Mac, build `<variant>-dev-sim` for iOS, start Metro and run `scripts/ci/maestro-ios.sh` with `APP_TARBALL` pointing at the build. Both scripts need `APP_VARIANT`, the variant the build was made for:

```bash
# from the repo root; the same variant for the build, Metro and Maestro
export APP_VARIANT=unit
(cd apps/omni && APP_ENV=development eas build --local --platform ios --profile unit-dev-sim --output ../../dist/unit-dev-sim-ios.tar.gz)
bash scripts/ci/start-metro.sh ios /tmp/metro.log
APP_TARBALL=dist/unit-dev-sim-ios.tar.gz bash scripts/ci/maestro-ios.sh
```
