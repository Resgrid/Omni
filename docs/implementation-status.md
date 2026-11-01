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
| Playwright web boot tests per variant | ✅ | `pnpm e2e:web`; all five web exports |
| Playwright web sign-in acceptance | ✅ | `e2e/web/sign-in.spec.ts`: the real auth-ui sign-in form renders (not the shell fallback) and an empty form validates without any auth/API request |
| Playwright routes and maps | ✅ | `e2e/web/routes-and-maps.spec.ts`: signed-out deep links land on sign-in, public `/login`, and the maplibre-gl worker loads under both the nginx and Electron CSPs. 60/60 across all five variants |
| Playwright Electron smoke | ✅ | 1/1 against the BigBoard Windows build |
| Maestro native flows per variant | 🟡 | written, dry-run only; run nightly on Android emulator |

## Open questions raised during implementation

1. **Unsent changes on logout** — `@resgrid/offline` keeps them encrypted and owner-scoped (never sent for another user, dropped after 7 days); plan §8.9 says logout leaves no records. Keep or discard on logout?
2. **Legacy `http://` server URLs** — R/I/B builds may have stored an http URL; Omni ignores it (default server, user signs in again). Accept, or add a migration prompt?
3. **Status destination helpers** — strict by default, `{ lenient: true }` reproduces Unit. Which default?
4. **Core work needed** — register the five OAuth client ids as OpenIddict applications; honour idempotency keys on SaveCall/notes/messages; emit weather alert and checkInUpdated events; merge the `archived-calls` branch (`GetCallYears`, `GetArchivedCalls`, and add `SaveArchivedCall`) into `develop` for Dispatch's archived calls; the offline map manifest (`Mapping/GetOfflineManifest`, MapLibre plan §19 — the client contract Omni expects is in `packages/maps/src/offline`).
5. **Legacy MMKV encryption keys in production** — the upgrade path must open the legacy encrypted MMKV stores, but the app shell refuses to read the keys from public `extra` in production builds (`packages/app-shell/src/runtime/legacy-keys.ts`), so production has no key source yet. Recommendation: the legacy keys are already public in the legacy repos' source, so embed them for a one-time migration and then rekey to a SecureStore key. Alternative: a config plugin plus a small native module.

## Phase 2 — app shell

| Item | Status | Notes |
|---|---|---|
| `@resgrid/app-shell` | ✅ | Startup orchestration, ShellGate (onboarding, sign-in, maintenance, personal/shared lock, app access), providers, deep links, nav model per form factor, settings route registry, active unit/call store (legacy `activeUnitId`/`activeCallId` keys). Features plug in through slots registered in `apps/omni/shell-registrations.tsx`: gate screens, overlays, providers (`registerShellProvider`), sidebar content, header actions, banner |
| Per-variant routes and nav | ✅ | Every feature route is a one-line re-export under `apps/omni/variants/<v>/app/`; nav built with `featureNav()` from each feature's `nav.ts`, gated by capability, module and feature flag |
| Route-contract tests | ✅ | `packages/app-shell/src/testing/__tests__/variant-routes.test.ts` (data-driven from each variant's route tree, manifest, nav and the shipped features' route builders): every nav href and builder resolves, every route file re-exports something real, no route without its capability/module |
| Background location bootstrap | ✅ | `apps/omni/background-location-entry.ts`, imported before expo-router where `extra.location.background` is set |

## Phase 3 — shared feature modules

| Module | Status | Notes |
|---|---|---|
| `@resgrid/maps` | ✅ | MapLibre wrapper (native + `maplibre-gl` web), style resolution with Mapbox fallback, attribution, markers/layers; `MapProvider` mounted by the shell; maplibre-gl worker copied into the web export (`apps/omni/metro/maplibre-worker.js`) |
| Offline map packs (MapLibre P8b) | 🟡 | `@resgrid/maps` offline pack manager (manifest, Range-resumed downloads, SHA-256 check, atomic install, Wi-Fi-only, size guards, retention, wipe on logout/switch) + `features/offline-maps` screen at Settings → Offline maps (iOS/Android). Needs Core's offline manifest (plan §19). Not done: background transfers, glyph zips, backup exclusion, native hashing |
| auth-ui | ✅ | 59 tests. Sign-in (MFA, SSO, server picker, shared device), onboarding, maintenance, locks, access denied, recovery codes |
| settings | ✅ | 37 tests. Incl. Advanced → Storage & sync (pending/stuck items, clear local data) |
| calls, check-in, video-feeds, protocols, notes | ✅ | 72 / 8 / 6 / 4 / 3 tests |
| units, personnel, status, roles, contacts, POIs | ✅ | personnel 10, status 31, roles 4, contacts 9, POIs 4 |
| weather alerts, chat, notifications inbox, data protection | ✅ | 7 / 12 / 9 / 9 tests |
| records, operations/deployments, checklists | ✅ | 61 tests. Records (field records, deployments, connectors, call Records tab; protected-grant drafts kept in memory only), operations (time report, expenses, usage, F-42), checklists (run sheet, due-checks card; run saves through the encrypted outbox, online-only on web) |
| Chat assistant (`/chatbot`) | ✅ | Responder, Unit, IC, Dispatch. Core replies arrive as `chatMessageReceived` to channel groups only, so the assistant and every conversation now join their channel (`JoinChannel`) and rejoin after a reconnect |
| Shared main map (`/map`) | ✅ | Calls, units, personnel, POIs, own location, department layers, legend, pin details; first tab and home for Unit and IC, menu entry for Responder, Dispatch and BigBoard. Not ported: Unit active-route overlay, map weather banner, map-lock setting; custom-map region layers wait for a GeoJSON fetch in data |
| Feature translation keys | ✅ | 1,550 keys merged into all 10 languages (`add-keys.ts --features`); ~570 per language backfilled from the legacy apps' own translations; the rest are English placeholders listed in `packages/i18n/review/missing-translations.csv` |

Known integration follow-ups:

- `@resgrid/api` idempotency header option; shared Jest setup for features (folders import their own `test-setup` today); one nav-entry type across features (the shell's `featureNav()` adapts three shapes today); a lower-layer home for `useHref`/shell context so features need not reach upward.
- Data stores for field policy, templates and dispatch picker lists.
- `ConfirmDialog` exists in three features — move it to `@resgrid/ui`.
- Web bundle is 15–16 MB minified per variant — code splitting (lucide, livekit, maplibre-gl, per-route lazy screens) before the web/Electron release.

## Phase 4 — variant modules (code complete; device parity and store releases pending)

| Variant | Module | Status | Notes |
|---|---|---|---|
| BigBoard | dashboard | ✅ | 97 tests. Custom grid (gesture-handler + reanimated), all 14 widget types, configure screen, legacy layout/settings migration (v1/v2 layouts, v0 widget settings), unit status timer alerts (new data store), OpenWeather client in `dashboard/integrations`. Dragging/resizing not yet exercised on a device |
| IC | incident-command | ✅ | 86 tests. Command board (lanes, accountability/PAR, needs, objectives, timers), incidents, command log, command map, resource map, call tab; tiers view (R/U) / assist (D) / command (I); AI assistant behind `Ai.Assistant`. Dispatch's assist writes now go through the outbox. Not ported: map drawing, attachments, need entities/history, reopen, command info edits, action plan, message-commander, voice log, drag-and-drop (tap-to-move) |
| Dispatch | dispatch-console, runcards, call-queues, awaiting-resources | ✅ | 98 tests. Console (panels, multi-select, ticker, PTT, map, 1/2/3 columns) as home; pending/scheduled/archived queues; awaiting resources (host, banner, call tab); run-card recommendation in call create + call tab. Open-Meteo widget dropped (no third-party calls). `GetCallYears`/`GetArchivedCalls` exist only on Core's `archived-calls` branch, so archived calls fail against `develop` until it merges; no `SaveArchivedCall` |
| Unit | unit-status, unit-routes, inventory | ✅ | 104 tests. Status sidebar + Electron MDT console (`/console`), shared-session card; 9 route screens (server directions instead of the legacy direct Mapbox call); inventory counts offline through the outbox |
| Responder | member-home, staffing, calendar, certifications, approve-sign-in | ✅ | 59 tests. `/home` nested tabs, staffing via outbox, calendar (Today/Upcoming/Month), certifications, pending sign-in approval watcher |
| Responder | shifts, messages, work-orders | ✅ | 83 tests. Shifts incl. trades and supervisor approvals; messages (compose via outbox, Core response types); work orders (report offline via outbox, gated by `Maintenance.WorkOrders`) |
| Unit | in-app turn-by-turn navigation (`@resgrid/navigation`) | ⬜ | MapLibre P4, waits for the server routing phase |

Per-variant exit criteria still open (plan §11.1 P4): parity checklist on devices, offline acceptance, upgrade test from the legacy store build (spike S4), internal beta.

Gaps found while porting (none block a build):

- Calendar: no department time-zone source, so items show the server's local times as sent; the calendar store never requests checklist items.
- Call list ignores `?filter=mine` (Responder home "calls I'm on" tile opens the full list).
- Home status buttons keep the legacy rule hiding built-in statuses 4–7 by id; check against the BaseType rule.
- Photos are not resized/HEIC-converted (expo-image-manipulator not a dependency); adding shifts to the device calendar needs expo-calendar in features.
- Status sheet cannot preselect a destination POI.

## Phases 5–6

⬜ Not started — see plan §11.1.
