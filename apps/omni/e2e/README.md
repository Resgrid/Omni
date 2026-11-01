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
  maestro/
    run-maestro.mjs      resolves the app id from the manifest and runs one variant's flows
    shared/              reusable sub-flows (launch, home visible)
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
- Flows that need a signed-in user (login, call list, status change) take credentials from CI secrets through environment variables and a dedicated test department. Never commit credentials.

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

CI (`nightly.yml`) builds `<variant>-dev-sim` with `eas build --local`, starts Metro (`scripts/ci/start-metro.sh`) and runs `scripts/ci/maestro-android.sh` inside `reactivecircus/android-emulator-runner` (API 35, x86_64). `scripts/ci/maestro-ios.sh` does the same on an iOS simulator when the workflow is dispatched with `ios_e2e`.
