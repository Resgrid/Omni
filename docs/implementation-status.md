# Implementation status

Living tracker for executing [`architecture/omni-plan.md`](architecture/omni-plan.md). Update it in the same change as the work. Legend: ✅ done · 🟡 in progress · ⬜ not started.

## Phase 0 — foundation and spikes

| Item | Status | Notes |
|---|---|---|
| pnpm workspace, catalog (one version per dependency), hoisted linker | ✅ | `pnpm-workspace.yaml`, `.npmrc`; catalog bootstrapped from legacy Unit pins minus React Query, rnmapbox, mapbox-gl, gorhom, flash-message (`scripts/bootstrap/`) |
| Root tooling: TypeScript 6 paths, ESLint 9 flat config, Prettier, lefthook, commitlint (`RO-Txxx`), dependency-cruiser layer rules | ✅ | `pnpm check-all` |
| Jest presets (node / react-native) and root multi-project config | ✅ | `tooling/jest-preset` |
| `@resgrid/config`: manifest schema (zod), capabilities, runtime accessors, versioning | ✅ | tests: manifests, runtime |
| Variant manifests for all five apps | ✅ | `apps/omni/variants/<id>/variant.json` — identities, storage ids, Omni majors/bases |
| `@resgrid/config-plugins`: `createAppConfig`, client env (legacy prefixes), versioning, baseline Expo plugins | ✅ | snapshot test per variant |
| `apps/omni` Expo project, per-variant route roots, assets, Metro per-variant cache, web stubs | ✅ | `expo config` resolves for all five |
| Spike S1 — expo-router root per variant + Metro monorepo | ✅ | BigBoard web export builds; bundle contains only its own manifest |
| `eas.json` generation (40 profiles, OTA channels) | ✅ | `pnpm eas:generate` / `eas:check` |
| Release planning script (versions + build matrix) | ✅ | `scripts/release-plan.mjs` |
| Spike S2 — per-variant native-module exclusion | ⬜ | needs a native prebuild per variant |
| Spike S3 — EAS projects / version continuity in CI | ⬜ | |
| Spike S4 — storage-identity upgrade test | ⬜ | device test |
| Spike S5 — MapLibre RN on Expo 57 incl. local PMTiles | ⬜ | |
| Spike S6 — desktop shell packaging, signing, auto-update | 🟡 | `apps/desktop` built: BigBoard Windows NSIS 86 MB (legacy 387 MB); mac/linux packaging and signing/notarization not yet exercised |
| Spike S7 — durable web storage (SQLite OPFS vs IndexedDB) | ⬜ | |
| CI workflows (`ci.yml`, `release.yml`, `nightly.yml`, `ota.yml`) | ✅ | Written and validated locally; not yet run on GitHub. Secrets: `docs/build/ci-secrets.md`. Fingerprint stabilized (`apps/omni/fingerprint.config.js`) so OTA can apply |
| Docker image (nginx runtime, legacy env names) | ✅ | Built and run for BigBoard; health, env-config escaping, cache headers verified |

## Phase 1 — platform core

| Package | Status | Baseline (plan §7) |
|---|---|---|
| `@resgrid/models` | ✅ | ~370 files / ~820 types, checked against Core Swagger; 19 tests |
| `@resgrid/api` | ✅ | 425 endpoint functions in 42 domains; injected-auth HTTP client; durable-cache seam; contract test vs QA Swagger (all 425 pass); 534 tests. Auth flows (token/MFA/passkeys/SSO) go to `@resgrid/auth` |
| `@resgrid/core` | ✅ | 159 tests. Deviations: trailing-debounce lifecycle; native Sentry keeps SDK release naming |
| `@resgrid/i18n` | ✅ | 46 tests. Keys in ≥2 apps → common (1998); app wording overrides kept per variant; review CSVs in `packages/i18n/review/` |
| `@resgrid/offline` | ✅ | 249 tests (memory + real SQLite engines). Open: unsent changes on logout (owner decision); legacy queue import; BlobStore; web durability waits for S7 |
| `@resgrid/ui` | ✅ | 172 tests. HtmlRenderer hardened (native origin whitelist, web sandbox); gluestack/webview patches via pnpm |
| `@resgrid/auth` | ✅ | 246 tests. Legacy session blobs restore for every variant; logout only on token-endpoint invalid_grant; client_id retry fallback until Core registers the apps |
| `@resgrid/realtime` | ✅ | 90 tests. Fresh token per reconnect, exhausted-hub recovery, re-join after reconnect, capability-driven event sets, watchdog |
| `@resgrid/notifications` | ✅ | 290 tests. Every server channel id created with a modern sound; all iOS categories; event-code parser; Novu per-variant subscribers |
| `@resgrid/location` | ✅ | 163 tests. Task defined at entry for background variants; coalesced offline fixes |
| `@resgrid/voice` | ✅ | 191 tests. LiveKit with room-switch race fix, CallKeep/BT/headset/desktop PTT gated by capability |

| `@resgrid/data` | ✅ | 149 tests. Domain stores with per-variant hydration; offline writes incl. offline call creation and all 26 IC event types; routes RD10–RD13 fixed |

## UI acceptance tests

| Item | Status | Notes |
|---|---|---|
| Playwright web boot tests per variant | ✅ | `pnpm e2e:web`; BigBoard and Dispatch 3/3 each locally |
| Playwright web sign-in acceptance | ✅ | `e2e/web/sign-in.spec.ts`: the real auth-ui sign-in form renders (not the shell fallback) and an empty form validates without any auth/API request; BigBoard and Dispatch 2/2 each |
| Playwright Electron smoke | ✅ | 1/1 against the BigBoard Windows build |
| Maestro native flows per variant | 🟡 | written, dry-run only; run nightly on Android emulator |

## Open questions raised during implementation

1. **Unsent changes on logout** — `@resgrid/offline` keeps them encrypted and owner-scoped (never sent for another user, dropped after 7 days); plan §8.9 says logout leaves no records. Keep or discard on logout?
2. **Legacy `http://` server URLs** — R/I/B builds may have stored an http URL; Omni ignores it (default server, user signs in again). Accept, or add a migration prompt?
3. **Status destination helpers** — strict by default, `{ lenient: true }` reproduces Unit. Which default?
4. **Core work needed** — register the five OAuth client ids as OpenIddict applications; honour idempotency keys on SaveCall/notes/messages; emit weather alert and checkInUpdated events.
5. **Legacy MMKV encryption keys in production** — the upgrade path must open the legacy encrypted MMKV stores, but the app shell refuses to read the keys from public `extra` in production builds (`packages/app-shell/src/runtime/legacy-keys.ts`), so production has no key source yet. Recommendation: the legacy keys are already public in the legacy repos' source, so embed them for a one-time migration and then rekey to a SecureStore key. Alternative: a config plugin plus a small native module.

## Phase 2 — app shell

| Item | Status | Notes |
|---|---|---|
| `@resgrid/app-shell` | ✅ | 117 tests. Startup orchestration, ShellGate (onboarding, sign-in, maintenance, personal/shared lock, app access), providers, deep links, nav model per form factor, settings route registry; screens and overlays come from features through `registerShellScreens`/`registerShellOverlay` (`apps/omni/shell-registrations.tsx`) |
| Per-variant root layouts and `(app)` route groups + `nav.ts` | ✅ | All five variants call `configureAppShell`; home routes are placeholders until Phase 4 |

## Phase 3 — shared feature modules

| Module | Status | Notes |
|---|---|---|
| `@resgrid/maps` | 🟡 | 64 tests. MapLibre wrapper (native + `maplibre-gl` web), style resolution with Mapbox fallback, attribution, markers/layers. Not yet mounted (`MapProvider`) or wired into feature map slots; offline packs (P8b) not started |
| auth-ui | ✅ | 59 tests. Sign-in (MFA, SSO, server picker, shared device), onboarding, maintenance, locks, access denied, recovery codes |
| settings | ✅ | 37 tests. Incl. Advanced → Storage & sync (pending/stuck items, clear local data) |
| calls, check-in, video-feeds, protocols, notes | ✅ | 72 / 8 / 6 / 4 / 3 tests |
| units, personnel, status, roles, contacts, POIs | ✅ | personnel 10, status 31, roles 4, contacts 9, POIs 4 |
| weather alerts, chat, notifications inbox, data protection | ✅ | 7 / 12 / 9 / 9 tests |
| records, operations/deployments, checklists | ⬜ | |
| Feature translation keys | ✅ | 456 keys merged into all 10 languages (`add-keys.ts --features`); English placeholders listed in `packages/i18n/review/missing-translations.csv` |

Known integration follow-ups:

- Mount `MapProvider`, `StatusProvider`, `NavigationHandoffProvider`, `ChatIdentityProvider` and call `configureSettings` in the app shell; register the background-location bootstrap in `apps/omni/index.ts`.
- Per-variant route files for the feature screens (only the gate and home routes exist) and route-contract tests.
- `@resgrid/api` idempotency header option; shared Jest setup for features (folders import their own `test-setup` today); one nav-entry type (calls uses `route/titleKey`, the rest match the shell's `NavEntry`); a lower-layer home for `useHref`/shell context so features need not reach upward.
- Electron CSP `worker-src` and tile hosts; copy the maplibre-gl worker and set `webWorkerUrl`.
- Data stores for field policy, templates and dispatch picker lists.
- Web bundle is 12 MB minified for every variant — look at code splitting (lucide, livekit, maplibre-gl) before the web/Electron release.

## Phases 4–6

⬜ Not started — see plan §11.1.
