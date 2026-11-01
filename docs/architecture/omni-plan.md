# Resgrid Omni — Monorepo Consolidation Plan

> **Version:** 1.1
> **Date:** 2026-10-31 (v1.1 the same day: owner decisions recorded in §15, CI build chain §6.6, storage maintenance §8.2a)
> **Status:** Proposal — not executed. Owner decisions are final (§15); spikes in P0 validate the technical path, not the choices.
> **Scope:** merge the five Resgrid client apps — Responder, Unit, IC, Dispatch, BigBoard — into one codebase, **Resgrid Omni** (`G:\Resgrid\Omni`, `github.com/Resgrid/Omni`), that still ships five discrete apps, each for iOS, Android, web and Electron (Windows, macOS, Linux). Includes offline-first durable operations for every app and the app side of the MapLibre plan (with offline maps).
> **Owner asks (2026-10-31):**
> 1. One shared Expo (prebuild/CNG) React Native application, maintained and upgraded once (Expo SDK, React Native, dependencies, config plugins), producing five apps with UX specialized for each app's users.
> 2. Take the best, most complete implementation of every piece of common logic so there is one baseline going forward.
> 3. Every app gets offline-first, durable operations and storage (IC has the most of this today).
> 4. Pick up the MapLibre plan and implement it in Omni, including offline maps and offline department map data on mobile.
>
> **Related:** [`maplibre-mapping-routing-navigation-plan.md`](../../../int-Coordination/docs/architecture/maplibre-mapping-routing-navigation-plan.md) (v1.1: §19 offline maps, §20 Omni alignment), [`offline-first-architecture.md`](../../../int-Coordination/docs/architecture/offline-first-architecture.md), [`mobile-feature-exposure.md`](../../../int-Coordination/docs/architecture/mobile-feature-exposure.md), [`identifier-allocation-registry.md`](../../../int-Coordination/docs/architecture/identifier-allocation-registry.md). Paths are relative to `G:\Resgrid\Omni\docs\architecture`.

---

## Table of Contents

1. [Summary](#1-summary)
2. [Goals, non-goals, success criteria](#2-goals-non-goals-success-criteria)
3. [Current state (surveyed 2026-10-31)](#3-current-state-surveyed-2026-10-31)
4. [Key decisions](#4-key-decisions)
5. [Target architecture](#5-target-architecture)
6. [Build, release and CI](#6-build-release-and-ci)
7. [The baseline: which implementation wins, per module](#7-the-baseline-which-implementation-wins-per-module)
8. [Offline-first and durable operations for every app](#8-offline-first-and-durable-operations-for-every-app)
9. [Maps: MapLibre and offline maps in Omni](#9-maps-maplibre-and-offline-maps-in-omni)
10. [Defects surfaced by the survey](#10-defects-surfaced-by-the-survey)
11. [Migration and cutover](#11-migration-and-cutover)
12. [Testing strategy](#12-testing-strategy)
13. [Agent tooling](#13-agent-tooling)
14. [Risks and open questions](#14-risks-and-open-questions)
15. [Decisions needed from the owner](#15-decisions-needed-from-the-owner)
16. [Appendices](#16-appendices)

---

## 1. Summary

The five apps are one scaffold forked four times (Unit → Responder, Unit → Dispatch → BigBoard, Unit → IC). All five already sit on **Expo SDK 57.0.25, React Native 0.86.3, React 19.2.3**, expo-router, zustand + MMKV, gluestack-ui v5 and NativeWind 5 preview — so the merge is a consolidation, not a rewrite. The cost of staying split is measured:

- **~46 %** of commit churn since August re-applies a change already made in another repo; **61–74 of the last 100 commits** in Responder, Unit, IC and Dispatch have a near-twin elsewhere. The 2026-10-31 "Login Fixes" landed in all five repos within 13 minutes (~6,245 inserted lines for one feature).
- Shared files land identical and then drift through per-repo review fixes: of 459 source paths present in all five repos, **only 199 are still identical**. The location-history panel went from 1 to 4 versions in six days.
- The drift hides real defects: wrong API routes in some apps, security fixes present in only one app, three different offline queues, five different SignalR lifecycles (§10).

Omni is **one Expo project** (`apps/omni`) that builds a selected **variant** (`APP_VARIANT=responder|unit|ic|dispatch|bigboard`), plus a thin **Electron shell** (`apps/desktop`) that packages each variant's web export. Everything else lives in layered workspace packages: platform core, API and models, auth, offline/durable storage, realtime, notifications, location, voice, maps, UI, app shell and feature modules. A variant is a manifest (identity, storage identity, capabilities, native modules, navigation shell, offline scope) plus its own expo-router route tree of thin files that mount shared screens.

## 2. Goals, non-goals, success criteria

### 2.1 Goals

1. **One codebase, five apps.** One Expo project, one lockfile, one set of config plugins and patches, one Expo/RN upgrade per SDK — producing five store listings with today's bundle identifiers.
2. **Six targets per app:** iOS, Android, web (Docker image), Electron Windows/macOS/Linux — 30 build outputs from one repo. Responder gains web Docker and Electron; BigBoard gains Electron in CI.
3. **One baseline per module**, chosen from the five implementations (§7), with the bugs each app fixed folded in for all.
4. **Specialization by configuration first:** capabilities, form factor and navigation shell per variant; separate screens only for each app's home and its signature modules.
5. **Offline-first everywhere:** durable storage, an ordered idempotent outbox, shift-start hydration and reconnect sync for all five variants, each with its own data scope (§8).
6. **MapLibre from day one** in Omni's map module, with offline base maps and offline department map data (§9, MapLibre plan §19–§20).
7. **Seamless upgrade for existing users:** installing the Omni build over today's store build keeps the user signed in with their settings (§5.3.3, §11.3).

### 2.2 Non-goals (v1)

- A single "super app" binary that switches roles at runtime. Each variant stays a separate store listing.
- Rewriting working code for style. Merges take the best existing implementation and adapt it.
- Server-side redesign beyond what offline-first, MapLibre and contract testing need (§8.6, §7.2).
- Changing Core's wire contract. Typos on the wire (`GetMayLayers`, `GetAllCallPriorites`, `ImgagesCount`) stay; Omni wraps them.

### 2.3 Success criteria

- Each variant passes its parity checklist (Appendix A route inventory + signature features) on iOS, Android, web and Electron.
- Upgrade test: legacy store build → Omni build, on iOS and Android, keeps session, server URL, language, theme and queued offline actions.
- An Expo SDK bump is one PR touching the catalog, `apps/omni` and the affected packages, verified by the CI matrix for all five variants.
- Jest, type-check, lint, translation parity, API contract tests and per-variant route contract tests run on every PR.
- Airplane-mode acceptance (§8.9, MapLibre §19.12) passes for Unit, IC and Responder; Dispatch and BigBoard keep rendering their last data through a network loss.

## 3. Current state (surveyed 2026-10-31)

Evidence: six parallel surveys of the five repos (build/platform, core infrastructure, realtime/offline, UI, data layer, history/docs), plus agent memories and int-Coordination docs. Raw outputs are listed in Appendix C.

### 3.1 The apps

| | Responder | Unit | IC | Dispatch | BigBoard |
|---|---|---|---|---|---|
| User / purpose | Member: status, staffing, calls, shifts, calendar | Apparatus crew: AVL, PTT, routes, inventory | Incident commander: ICS board, PAR, timers | Dispatcher CAD console | Station wall display, widget dashboard |
| Form factor | Phone | Vehicle tablet / laptop (MDT) | Tablet first, desktop | Desktop/web first | Wall TV, tablet |
| Bundle / package | `com.wavetech.Resgrid` / `wtdt.resgrid.andriod` (legacy typo — keep) | `com.resgrid.unit` | `com.resgrid.command` | `com.resgrid.dispatch` | `com.resgrid.bigboard` |
| Ships today | iOS, Android | iOS, Android, web, Docker, Electron | same as Unit | same as Unit | iOS, Android, web, Docker (Electron folder, no CI job) |
| Signature | Approve sign-in (push MFA), work orders, certifications, shifts, iOS check-in widget | Routes + directions, inventory counts, LiveKit PTT, background AVL, CallKit | Command board, command/resource maps, PAR, AI assistant | Console, pending/scheduled/archived calls, run cards, server geocoding | Draggable widget grid |
| Commits / since | 327 / Jul 2025 | 530 / 2024 | 118 / Jun 2026 (Unit snapshot) | 254 / RN since Nov 2025 | 243 / RN since Dec 2025 |
| Ticket prefix | RR | RU | RC / RIC | RD | BB (cross-app: RG) |

### 3.2 What already matches

- Same framework versions; same scaffold (`src/{api,app,components,hooks,lib,models,services,stores,translations}`); 10 languages; strict TypeScript; gluestack + lucide; zustand + MMKV.
- **All five are already pure CNG** — `/ios` and `/android` are gitignored and untracked everywhere. No ejected native code to merge.
- Identical across all five: 54 UI primitives, 156 of 298 v4 models, `login-errors.ts`, `sso-return.tsx` (4 apps), `lib/mfa/*` and passkeys (4 apps), two patches (`@gluestack-ui/core`, `react-native-webview`).

### 3.3 What drifted (numbers)

| Area | State |
|---|---|
| `src/` files | R 1,162 · U 1,103 · I 1,065 · D 1,169 · B 676. Of shared paths: 199 identical in all 5, 260 in all 5 with 2–5 versions; 1,042 unique to one app. |
| Dependencies | 139 shared deps, 67 match exactly. Unit/IC pin exact versions; others use `~`/`^`. Spreads: Novu 2.6 vs 3.11, mapbox-gl 2.15/3.15/3.18, Sentry 7.11 (B) vs 8.20, Electron 33 (B) vs 40, tailwind-variants 3.1 (R) vs 0.2.1. |
| Translations | Keys per language: R 2,539 · U 2,080 · I 2,385 · D 2,268 · B 895. 4,965 distinct keys: 526 in all five, 2,937 in only one app; 71 keys with different English text; 2,355 key/language pairs translated differently where English matches. |
| Offline | Three outbox implementations (R; U/I/B; D). IC ≈55–60 % of the offline-first design, Unit ≈40 % with the best drainer, others bounded to RMS drafts. No map offline packs anywhere. |
| CI | One 484–760-line `react-native-cicd.yml` per repo, hand-edited variants. **Jest never runs in CI** (~1,400 test files). No store submission, no signing/notarization or auto-update for Electron, no OTA. Lint-staged/commitlint configured but no hook installed. |
| Agent docs | Unit/IC `CLAUDE.md` complete (IC's says Expo 54 — stale); Responder short and stale; Dispatch/BigBoard only a dual-graph policy. Skills copied in `.claude`, `.agent`, `.agents`, `.opencode`. |

### 3.4 In-flight work

All five working trees are clean (2026-10-31 12:00), `develop` = `origin/develop`, each `develop` one commit ahead of `master` (the Login Fixes). No side branch holds work to keep. Ignored local files a merge won't carry: Responder `google-services.json`; Dispatch `.env.development`, `.mcp.json`. Dispatch depends on unmerged Core worktrees (`archived-calls`, `poi-capabilities`, `required-call-custom-fields`, `login-error-codes`) — §11.5.

## 4. Key decisions

| # | Decision | Why |
|---|---|---|
| D1 | **One Expo project** (`apps/omni`) builds every variant, selected by `APP_VARIANT` × `APP_ENV` — **owner decision 2026-10-31.** Spikes S1–S3 (§11.1) work out the mechanics (route roots, per-variant native-module exclusion, five EAS projects); if a mechanic fails, solve it inside the single project before considering per-variant packages. | One `package.json` means one Expo upgrade, one plugin list, one patch set. |
| D2 | **Five EAS projects stay** (existing project IDs, credentials, push keys, store bindings). `app.config.ts` sets `extra.eas.projectId` from the variant. | Store listings, APNs/FCM keys and credentials are bound per project; moving them risks the listings. |
| D3 | **Variant manifest is the single source of per-app truth** (`apps/omni/variants/<v>/variant.json`, validated by the zod schema in `@resgrid/config`; `variant.ts` loads it at runtime): identity, storage identity, auth/push identity, capabilities, native modules + permissions, navigation shell, offline scope, versioning. `app.config.ts`, env, Electron, Docker and the CI matrix all read it. | Today the same facts are hand-copied into app.config, eas.json, env.js, Electron config, Dockerfiles and CI per repo — the main source of drift. |
| D4 | **Specialize in this order:** capability → form factor → platform file at the leaf → variant-only screen (home + signature modules only). | Keeps shared screens shared; Dispatch's duplicated `.web` screens (~6.3k lines) are the cautionary example. |
| D5 | **Each variant has its own expo-router tree** (`variants/<v>/app`, set through the expo-router `root` option) of thin route files that mount shared screens; canonical paths across variants; typed route contract + per-variant test. | Route sets genuinely differ per app; thin files keep them cheap. The contract test catches links to routes a variant lacks (Dispatch/BigBoard push `/messages/:id` today). |
| D6 | **pnpm 10 workspaces, `node-linker=hoisted`, catalogs, `patchedDependencies`** (owner-confirmed). No Turborepo/Nx initially (add Turborepo later if CI time demands). | Five lockfiles must be re-resolved into one anyway; catalogs stop version drift. Hoisted is required by notifee's relative Maven path, the U/I zustand Metro paths, a phantom `@expo/config-plugins` import and the CallKeep git dependency. Expo auto-configures Metro for monorepos since SDK 52. |
| D7 | **Data access stays zustand stores → API functions → cached endpoints**, behind the offline layer. **React Query is dropped** (`@tanstack/react-query`, `react-query-kit`, `@dev-plugins/react-query`) — owner decision; the one `call-sidebar.tsx` use per app moves to the calls store. | One pattern, already used everywhere; the offline-first design is built on persisted stores. |
| D8 | **Storage identity is frozen per variant.** Each variant keeps today's MMKV instance ids and encryption keys (and extra instances), declared in its manifest, then re-keys once into a SecureStore-generated key. | Changing them signs every user out and wipes settings on upgrade. BigBoard and Unit both use `ResgridUnit` — fine per device, must stay per variant. |
| D9 | **Offline-first is a platform layer (`@resgrid/offline`), not a feature.** Durable storage + outbox + hydration + sync orchestrator implemented once, from IC's design progress, Unit's drainer and Responder's scoping/encryption; every variant registers handlers and a scope (§8). | The owner's requirement; three outboxes today. |
| D10 | **Maps are MapLibre-only in Omni** (`@resgrid/maps`), born on the MapLibre wrapper API; against servers without the MapLibre fields the client derives a style from today's config (MapLibre plan §8.3). Legacy repos stay on rnmapbox (MapLibre D18). | Porting rnmapbox code into Omni and then porting again would double the work. |
| D11 | **Electron is a separate thin package** (`apps/desktop`: electron, electron-builder, push receiver, updater) that packages `dist/<variant>` from the web export. Add code signing, notarization and auto-update. | Today's installers bundle the whole RN dependency list (IC: 387 MB installer, 993 MB `app.asar`); target ≈100 MB. |
| D12 | **Contract testing against Core's Swagger** (`/swagger/v4/swagger.json`, already built in-process by Core's `SwaggerDocumentTests`): types via openapi-typescript and a test that checks each hand-written endpoint's method, path and parameters. Hand-written models stay for the merge. | The survey found eight route/parameter mismatches that such a test catches (§10.2). Full codegen waits for Core non-null annotations and enum names. |
| D13 | **Versioning stays derived from GitHub Actions** (owner): `version = <major>.<release run_number>`, `versionCode / buildNumber = <base> + <release run_number>`, with a new major and a base per variant that put every Omni build above every legacy build (Appendix B), namespaced tags (`unit-v8.x`). The release workflow file is never renamed (its run counter is the source). | `github.run_number` restarts at 1 in the new repo; Unit's `"7"+N` would fall from 7652 to 71 and Play rejects it; IC, Dispatch and BigBoard all tag `1.N` today. |
| D14 | **Secrets per variant in GitHub Environments** with identical names inside each environment. | ~40 secrets per repo share names with different values (`EAS_PROJECT_ID`, `SCHEME`, `GRADLE_PROPERTIES`, `CREDENTIALS_JSON_BASE64`, Firebase app IDs). |
| D15 | **Legacy repos freeze to critical fixes** once Phase 1 starts; security hotfixes found here (§10.1) land in the legacy repos now; each legacy repo is archived after its variant replaces the store listing. | Prevents a sixth line of drift while Omni is built. |
| D16 | **Omni targets Core `develop` only.** Server features that live only on Core worktree branches are not ported until they reach `develop`. | Owner direction; keeps Omni on one server baseline. |
| D17 | **Modern notification sounds only.** The toggle and the legacy sound set are removed; every server sound type maps to a modern sound (§7.6). | Owner decision. |
| D18 | **OTA from the first Omni release** (`expo-updates`, fingerprint runtime versions, channels per EAS project) — moved from P6 into P1. | Owner decision; JS-only fixes ship in minutes instead of a store review. |

## 5. Target architecture

### 5.1 Repository layout

```
Omni/
  apps/
    omni/                          # THE Expo project — iOS, Android, web
      app.config.ts                # createAppConfig(variant, env) from variants/<v>/variant.json
      eas.json                     # <variant>-<env> profiles; APP_VARIANT/APP_ENV in env
      index.ts                     # entry: registers background tasks, then expo-router/entry
      metro.config.js              # shared preset + per-variant cache dir + web stubs
      babel.config.js  tsconfig.json  global.css  global.web.css
      react-native.config.js       # per-variant autolinking exclusions (generated from the manifest)
      variants/
        responder/  variant.json  variant.ts  app/ (route tree)  assets/  theme.css
        unit/  ic/  dispatch/  bigboard/
    desktop/                       # Electron shell; packages apps/omni web export per variant
      src/main/  src/preload/  push-receiver.ts  updater.ts  electron-builder.config.ts
  packages/                        # source-only TS workspace packages (no build step)
    config/          @resgrid/config          variant types, capabilities, env, identity
    core/            @resgrid/core            platform, logging, Sentry, analytics, dates, single-flight, lifecycle, router helpers
    models/          @resgrid/models          v4 models + pure helpers
    api/             @resgrid/api             HTTP client factory, cached endpoints, endpoints/<domain>, contract tests
    offline/         @resgrid/offline         durable storage, reset registry, outbox, sync orchestrator, hydration
    auth/            @resgrid/auth            session, refresh engine, MFA, SSO, passkeys, shared session, lock, rights, data-protection grants
    data/            @resgrid/data            domain stores; feature flags; terminology
    realtime/        @resgrid/realtime        SignalR service/store/hooks, live locations
    notifications/   @resgrid/notifications   push (native/web/Electron), notifee channels, Novu inbox, deep-link resolver
    location/        @resgrid/location        transmitter (person|unit), background task, transmission gate
    voice/           @resgrid/voice           LiveKit, CallKeep, Bluetooth/headset PTT, audio routing
    maps/            @resgrid/maps            MapLibre wrapper, map-provider, layers/markers, offline packs
    navigation/      @resgrid/navigation      turn-by-turn engine (MapLibre plan §9)
    i18n/            @resgrid/i18n            i18next setup, `common` + per-variant namespaces, 10 languages
    ui/              @resgrid/ui              gluestack primitives, tokens, overlays, toast, layout hooks, HtmlRenderer
    app-shell/       @resgrid/app-shell       root providers, createAppShell, ShellGate, nav registry, route contract, init steps
    features/        @resgrid/features        features/<domain>/{screens,components,hooks,routes.ts,nav.ts}
    config-plugins/  @resgrid/config-plugins  Expo config plugins (one copy each)
  tooling/  eslint-config/  tsconfig/  jest-preset/
  docker/  Dockerfile  nginx.conf  entrypoint.sh
  docs/  architecture/  build/  subsystems/
  scripts/  .github/workflows/  .claude/skills/  AGENTS.md  CLAUDE.md
```

`@resgrid/features` is one package with one folder per domain (shared: calls, contacts, chat, notes, protocols, records, operations, checklists, weather-alerts, notifications, settings, status, roles, units, personnel, check-in, video-feeds, data-protection, auth-ui, shared-session, audio, pois, maps, incident-command; variant modules: dashboard, dispatch-console, runcards, call-queues, awaiting-resources, unit-status, unit-routes, inventory, member-home, calendar, shifts, messages, staffing, work-orders, certifications). Folders import each other only through their public `index.ts`.

### 5.2 Layering and dependency rules

```
L0  config · models
L1  core · i18n
L2  api · offline
L3  auth · realtime · notifications · location · voice · maps (logic)
L4  data
L5  ui                       (depends only on L0–L1)
L6  features · navigation
L7  app-shell
L8  apps/omni variants (routes, manifests) · apps/desktop
```

- A package imports only from lower layers. Enforced by dependency-cruiser in CI.
- `api` never imports stores or UI: token, refresh, base URL and lock state are injected into the client factory (today `client.tsx`, `callFiles` and `chat` import the auth store).
- `data` never imports components, routes, hooks, features, i18n or React Native UI APIs (today 9 stores call `translate()`, Unit/IC's LiveKit store calls `Alert`/`Linking`, and three stores import component types).
- Native modules are imported only by L1–L3 platform packages behind interfaces with `.native.ts` / `.web.ts` (and Electron bridge) implementations, so excluded modules can be stubbed per variant.

### 5.3 Variant system

#### 5.3.1 Manifest (`variants/<v>/variant.json`)

> Implementation note (Phase 0): the manifest is JSON so Expo's config loader, CI scripts, Electron and Docker can read it without a TypeScript transform. `variant.ts` parses it with the zod schema at runtime; build-time code reads it through `@resgrid/config-plugins` (CommonJS). The example below shows the shape in TypeScript notation.

```ts
export default defineVariant({
  id: 'unit',
  displayName: 'Resgrid Unit',
  identity: {
    slug: 'resgrid-unit', easProjectId: '6beb03e6-f639-4f35-bef7-5cfb5f173218',
    ios: { bundleIdentifier: 'com.resgrid.unit', associatedDomains: ['webcredentials:unit.resgrid.com', 'webcredentials:unit-eu-central.resgrid.com'] },
    android: { package: 'com.resgrid.unit' },
    schemes: ['ResgridUnit'], ssoReturnScheme: 'resgridunit',
    electron: { appId: 'com.resgrid.unit', productName: 'Resgrid Unit', protocol: 'resgridunit' },
    web: { dockerImage: 'resgridllc/unit', legacyEnvPrefix: 'UNIT_' },
    sentryProject: 'unit',
  },
  storage: { mmkvId: 'ResgridUnit', keySecret: 'UNIT_MMKV_KEY', extraInstances: ['checklists-ciphertext-v1'] }, // frozen (D8)
  auth: { clientId: 'Unit', appAccessRight: null, sharedDevice: true, personalLock: false, logoutOn: 'auth-rejection-only' },
  push: { subject: 'unit', novuSubscriber: 'unit', channels: 'full', desktopPush: true },
  capabilities: { /* §5.3.2 */ },
  native: { modules: [/* §6.3 */], permissions: { /* … */ }, backgroundModes: ['location', 'audio', 'voip', 'remote-notification', 'bluetooth-central'] },
  shell: { kind: 'tabs', sidebar: { tablet: 'permanent-landscape', phone: 'drawer' }, sidebarContent: 'unit-status', nav: [/* registry */] },
  offline: { scope: 'unit', cacheTtl: 'long', mapPacks: 'unit' },
  versioning: { tagPrefix: 'unit-v', major: 8, buildNumberBase: 100000 }, // version 8.<run>, versionCode 100000 + <run> (D13, Appendix B)
});
```

The legacy encryption keys move out of source into build secrets (`keySecret`) at the same time; their values do not change.

#### 5.3.2 Capabilities

One typed capability map, read with `useCapability()` in UI and `getCapability()` in services and in `app.config.ts` (so a capability can also add a config plugin or permission). Initial set, from the surveys:

| Group | Capabilities |
|---|---|
| Calls | `calls.create: none\|quick\|full`, `calls.dispatch`, `calls.close`, `calls.queues` (pending/scheduled/archived), `calls.runCards` |
| Status | `status.subject: personnel\|unit`, `status.onBehalf`, `staffing` |
| Incident command | `incidentCommand: view\|assist\|command` |
| Check-in / PAR | `checkIn.self`, `checkIn.others`, `checkIn.actions` (notification action, Live Activity) |
| Media | `videoFeeds: view\|manage` |
| Weather | `weatherAlerts.admin` |
| Voice | `voicePtt`, `callKeep`, `bluetoothPtt`, `headsetButtonPtt`, `desktopPtt` |
| Location | `backgroundLocation`, `locationTransmission: person\|unit\|none`, `geoHubDefault` |
| Push | `pushSubject: user\|unit\|icUser\|none`, `novuSubscriber`, `desktopPush`, `liveActivity`, `approveSignIns` |
| Auth / session | `mfa`, `passkeys`, `brokeredSso`, `sharedDevice`, `personalLock`, `neverLogoutOnTransientError` |
| Realtime | `chatHub`, `hubWatchdog` (always-on screens) |
| Maps | `maps.layers`, `maps.customIndoor`, `navigation.inApp` |
| Offline | `offline.scope`, `offline.handlers` (per §8.5) |
| Platform | `webEdition`, `electron`, `onboarding`, `maintenanceMode` |

Department feature flags (`Chat.System`, `Records.Field.*`, `Checklists.System`, `Maintenance.WorkOrders`, `Dispatch.RunCards*`, `Navigation.InApp`, `Maps.Offline`) still gate at runtime on top of capabilities, through the existing feature-flag store.

#### 5.3.3 Identity that must not change

Bundle IDs and Android packages (including `wtdt.resgrid.andriod`), URL schemes, SSO return schemes, passkey associated domains, App Group (`group.com.wavetech.resgrid.shared`, Responder), MMKV ids and keys, persisted store names, Electron appIds and protocols, BigBoard's Electron loopback origin `127.0.0.1:29317` (or a migration of its localStorage), Docker image names and legacy runtime env names (`${PREFIX}_*`), Novu subscriber id formats, push `Source` values, `RESGRID_CLIENT` ids. Full table: Appendix B.

#### 5.3.4 Routes

`app.config.ts` passes `['expo-router', { root: 'variants/<v>/app' }]`. Route files are one-liners:

```ts
// variants/dispatch/app/call/[id].tsx
export { default } from '@resgrid/features/calls/screens/call-detail';
```

Canonical paths for every variant: `/call/[id]`, `/call/[id]/edit`, `/call/new`, `/weather-alerts/[id]` (replaces `/weather-alert/[id]` and `/weather-alert-detail`), `/poi/[id]`, `/chat/[channelId]`, `/records/*`, `/settings/account-security`, `/map` (the department map, `features/map`; `?callId=`/`unitId`/`userId`/`poiId` focus a pin), `/maps/*` (custom/indoor maps), `[...missing]` (U/I/D/B misspell it `[...messing]`). Features build links through `useHref()` builders; the variant declares which routes exist; links to absent routes are hidden; a per-variant test asserts every emitted href resolves.

### 5.4 App shell and form factors

`@resgrid/app-shell` provides:

- **Root providers** (one order for all): GestureHandlerRootView → KeyboardProvider → SafeAreaProvider → API/offline providers → GluestackUIProvider → ThemeProvider → overlay hosts (toast, push modal, LiveKit sheet) — dropping `react-native-flash-message` and `@gorhom/bottom-sheet`.
- **`createAppShell(variant)`**: `shell.kind` `drawer-slot` (Responder, Dispatch, BigBoard) or `tabs` (Unit, IC); sidebar mode per form factor (`drawer`, `permanent-landscape`, `toggle-panel`); sidebar content (`menu` or Unit's `unit-status` console); header style and actions; a **nav registry** (placement tab/sidebar/hidden, feature flag, terminology key, icon) that generates `Tabs.Screen` lists and fails on unregistered routes.
- **ShellContext** (menu open/close, permanent sidebar, form factor, header actions) replacing BigBoard's `DrawerContext` and pathname checks.
- **ShellGate**: onboarding → login → maintenance → personal lock → app-access right (`CanLoginToCommandApp`, `CanLoginToDispatchApp`) → shared-device lock; loading overlay keeps the navigator mounted.
- **Init step registry** (signed-in bootstrap): parallel config/calls/rights → flags + terminology → realtime hubs (`allSettled`) → per-variant steps (location, voice/CallKeep, offline hydration, weather, map packs), with generation guard, 30 s timeout and retry backoff.
- **`useFormFactor()`** in `@resgrid/ui`: phone (shortest side < 600), tablet (≥ 600, `isLandscapeBoard`), desktop (web/Electron ≥ 1024), wall (> 1920 or kiosk flag), plus `isElectron`/`isDesktop`. Replaces Dispatch's 1/2/3-column logic, IC's board layout hook, Responder/Unit permanent sidebars and BigBoard's grid config.

### 5.5 Data access pattern

Stores call API functions; the API client applies auth, timeouts, the cached-endpoint policy and offline behaviour; persisted stores are the primary offline read source; the cache is the stale fallback (§8). Cache TTLs are per-variant policy (IC caches 1–2 days today, others 15 min–6 h). View state (filters, selection, sort) lives in features, not domain stores.

## 6. Build, release and CI

### 6.1 Tooling

- pnpm 10 workspaces, hoisted linker, `catalog:` versions for every shared dependency, `patchedDependencies` (one copy each of the gluestack and webview patches; IC's rnmapbox patch is not needed under D10; drop the mmkv 3.1.0 and app-icon-badge patches after verification).
- ESLint 8 → flat config in `tooling/eslint-config` with Responder's rule set on Unit/IC's newer plugin versions, Unit's ban on React Native `Modal`, i18n key-order/identity lint, ternary-not-`&&` in JSX, dependency-cruiser layer rules.
- Prettier unchanged. Git hooks actually installed (lefthook or husky) for lint-staged and commitlint. Commit format: `RO-Txxx Summary` (owner decision); commitlint accepts it, and a missing ticket number is allowed while work is unticketed.
- Jest preset from Responder's setup + BigBoard's preset merge + IC's gesture-handler setup; coverage only in CI.

### 6.2 Expo and EAS

- `eas.json` from Unit's (production, production-aab, production-apk, staging, internal, development, dev-sim, simulator), expanded to `<variant>-<profile>` with `APP_VARIANT` in `env`; `EXPO_NO_DOTENV=1`; local CLI use runs `APP_VARIANT=<v> npx eas-cli build --profile <v>-production` so the CLI resolves the right project.
- Per-variant Metro cache directory (route root and `EXPO_PUBLIC_*` are inlined at transform time).
- `.easignore` templates today exclude `/apps` — rewrite for the monorepo.
- **OTA (decided, D18):** `expo-updates` in every variant from the first Omni release, `runtimeVersion: { policy: 'fingerprint' }`, channels `production`, `staging`, `internal` in each of the five EAS projects. Web redeploys and Electron auto-updates cover the other targets.
- Store upload: binaries are always attached to the GitHub Release for manual download/upload; an optional approval-gated `eas submit` job uploads to TestFlight / Play internal (§6.6).

### 6.3 Native modules and permissions per variant

From actual imports (not package.json — all five list the same scaffold):

| Module | R | U | I | D | B |
|---|---|---|---|---|---|
| SignalR, NetInfo, MMKV | ✓ | ✓ | ✓ | ✓ | ✓ |
| expo-notifications + notifee | ✓ | ✓ | ✓ | ✓ (notifee: voice foreground service) | push registration unfinished today; enabled in Omni |
| Firebase messaging (native) / Firebase JS + push receiver (web/Electron) | ✓ / web | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ (Electron new) |
| expo-location background + expo-task-manager | ✓ | ✓ | foreground only | — | foreground only |
| LiveKit RN + WebRTC | ✓ | ✓ | ✓ | livekit-client (web) | — |
| CallKeep | ✓ | ✓ | ✓ | — | — |
| ble-manager / Web Bluetooth | ✓ | ✓ | ✓ | ✓ | — |
| Live Activity (widget extension) | ✓ (check-in) | ✓ (check-in) | — | — | — |
| expo-calendar, react-native-calendars | ✓ | — | — | — | — |
| expo-secure-store, expo-video, react-native-passkey | ✓ | ✓ | ✓ | passkey only | — |
| MediaButton / InCallAudio native modules | ✓ | ✓ | ✓ | — | — |
| MapLibre RN | ✓ | ✓ | ✓ | ✓ | ✓ |

- Background location only where code uses it: Dispatch and BigBoard declare it today with no task registered — an App Review/Play exposure (§10.1).
- IC keeps its foreground-only posture (`withoutBackgroundLocation`, blocked permissions). `withRestrictedBootReceivers` (Android 15 boot-receiver crash) applies to every variant.
- Responder's production `usesCleartextTraffic=true` is removed.
- Exclusion mechanics (spike S2): generated `react-native.config.js` for community modules, `expo.autolinking.exclude` for Expo modules, Metro stubs for JS imports of excluded modules. iOS purpose strings and Android permissions come only from the variant's config plugins.

### 6.4 Web

One `expo export -p web` per variant produces `dist/<variant>`, used by both the Docker image and the Electron jobs. One `docker/Dockerfile` (Unit's multi-stage with `BUILDPLATFORM`, `ARG APP_VARIANT`) + Dispatch's nginx caching rules (no-store for `index.html`/`env-config.js`, dotfile deny, Referrer-Policy) + Unit/IC's CSP, AASA/assetlinks and `/health`. Runtime env: Dispatch's merge of `window.__ENV__` over build env (Unit/IC replace it — a bug); the entrypoint also reads the legacy `${PREFIX}_*` names so existing deployments keep working. Images keep their names; Responder gains `resgridllc/responder`.

### 6.5 Electron (`apps/desktop`)

- Structure from Unit (`app://bundle` protocol, single-instance lock, protocol client, menu), hardening from Dispatch (CSP via `session.webRequest`, `will-navigate` origin guard, backslash rejection, deep-link queue, notification failure handler, `__ELECTRON__`/notifications/deep-link bridges), push receiver from Unit (generation guard against sign-out races, fallback when native notifications are unavailable), external links from IC, BigBoard's settings IPC as an opt-in capability.
- Packaging from Unit/IC's `electron-builder.config.js` (dmg + zip x64/arm64 hardened runtime, NSIS + portable, AppImage/deb/rpm), per-variant appId/productName/protocol/icons from the manifest.
- New: Windows code signing, macOS notarization, `electron-updater` auto-update channel per variant, local offline map pack serving (MapLibre §19.6).
- `services/push-notification.electron.ts` in U/I is dead (Metro has no `electron` platform); Electron runs the web bundle with bridges.

### 6.6 CI build chain (GitHub Actions)

Omni keeps GitHub Actions for every build output ("emit"). Goal: every variant's installable and store-ready files, as fast and as reliably as possible, attached to a GitHub Release you can download from or push to the stores.

#### 6.6.1 Today (measured from the last successful master runs: Unit #646, IC #182)

| Job | Unit | IC | What it does |
|---|---|---|---|
| test | 1 min | 1 min | `check-all` (lint, type-check, translations); no Jest |
| build-mobile (android) | **102 min** | **93 min** | Three full native builds **in series** in one job: dev-client APK (32–36 min), production APK (30–33), production AAB (27–29) |
| build-mobile (ios) | **53 min** | **68 min** | Three full Xcode builds in series: development, ad-hoc, production IPAs (16–23 min each) |
| build-web | 3 min | 2 min | `expo export`, uploaded as an artifact (not reused by Docker or Electron) |
| build-docker | 11 min | 6 min | Rebuilds the web app **inside** the image; arm64 under QEMU |
| build-electron win / mac / linux | 17 / 31 / 10 min | 16 / 24 / 13 min | Each OS job reinstalls all RN dependencies and **rebuilds the web app**, then packages; no signing, notarization or update feed |
| release-electron | 6 min | 3 min | Collects installers into the GitHub Release |

Wall clock ≈ 100 min per app, bounded by Android. Six native builds per app per master push, of which two (dev clients) are developer tools. Every master push of every repo pays this, so five apps ≈ 30 native builds per round of identical changes.

What to keep from Unit/IC: the job split (mobile/web/docker/electron/release), signing material decoded to `$RUNNER_TEMP` and removed in an `always()` step, `credentials.json` pruned to the platform, Gradle worker cap, disk cleanup on Android runners, node_modules cache keyed on lockfile + patches, Firebase App Distribution for testers, Changerawr notes, GitHub Release with assets.

#### 6.6.2 Principles

1. **Build once, package many times.** One web export per variant feeds Docker and all three Electron OS jobs. One Android release build (AAB) yields the sideload APK through `bundletool build-apks --mode=universal` (seconds, same keystore). One iOS release build yields the App Store IPA; the ad-hoc IPA is the same app re-signed with the ad-hoc profile (`fastlane resign`, seconds; same distribution certificate and entitlements).
2. **Native only when native changed.** `@expo/fingerprint` per variant × platform is compared with the fingerprint recorded on that variant's last release. Unchanged → no native build: publish an OTA update to the channel (`eas update`) and point the release at the previous binaries. Changed → native build.
3. **Developer builds off the release path.** Dev-client APK/IPA and simulator builds run nightly and on demand, not on every release.
4. **Version once.** A plan job computes every variant's version, versionCode/buildNumber, Electron semver and Docker tags (D13) and passes them as outputs; build jobs never compute versions.
5. **Test once.** PRs run the full suite; branch protection requires up-to-date branches (or the merge queue), so the master commit is the tested commit. Release runs only fast sanity checks (`expo config` per variant, type-check).
6. **Fan out wide, fail independently.** Matrix over variant × target with `fail-fast: false`, per-job `timeout-minutes`, retry wrapper on network-bound steps (pod install, Gradle and npm downloads), concurrency group per variant that queues releases (never cancels them) and cancels superseded PR runs.
7. **Cache precisely.** pnpm store (lockfile key); Gradle via `gradle/actions/setup-gradle` (build cache + configuration cache); CocoaPods (`Podfile.lock` per variant); `~/.eas-build-local`; electron-builder/Electron download caches; Docker buildx `type=gha`. Spike S3 measures ccache and React Native's prebuilt iOS core before adopting them.
8. **Durable outputs.** Intermediate artifacts kept 7 days; every deliverable is a GitHub Release asset (permanent) with a `SHA256SUMS` file; release jobs are idempotent (`allowUpdates`), so a re-run of a failed job completes the same release.

#### 6.6.3 Workflows

| Workflow | Trigger | Content | Target time |
|---|---|---|---|
| `ci.yml` | PR, merge queue | install → in parallel: lint, type-check, translation parity, dependency-cruiser, Jest (4 shards), API contract tests → per variant: `expo config` snapshot, route contract, web export smoke | < 12 min |
| `release.yml` | push to `master` (channel `internal`), tag `<variant>-v*` (channel `production`), manual dispatch (variants, targets, channel, force-native) | Stages below | ≈ 30 min native / ≈ 10 min JS-only, all five variants |
| `ota.yml` | manual dispatch | JS-only update for chosen variants/channel; refuses if the fingerprint differs from the installed runtime | ≈ 5 min |
| `nightly.yml` | schedule + dispatch | Dev-client and simulator builds for all variants, Maestro e2e on Android emulator / iOS simulator, cache warming | — |

#### 6.6.4 `release.yml` stages

```
Stage 0  plan (ubuntu, ~1 min)
         versions for all variants · variant × target matrix · fingerprints vs last release → native or OTA per variant/platform
Stage 1  per variant, in parallel
         web      (ubuntu, ~3 min)        expo export -p web → artifact web-<v>
         android  (ubuntu, ~20–30 min)    if native: prebuild → Gradle bundleRelease → AAB → bundletool universal APK (signed)
         ios      (macos-26, ~20–25 min)  if native: prebuild → pods (cached) → release build → App Store IPA → re-sign → ad-hoc IPA
         ota      (ubuntu, ~3 min)        if not native: eas update --channel <channel> per platform
Stage 2  needs web-<v>
         docker   (ubuntu, ~2 min)        COPY dist into the nginx runtime image (no app build inside Docker) → amd64 + arm64 → Docker Hub + GHCR
         electron (windows / macos / ubuntu, ~5–10 min each)  apps/desktop only (no RN install) + web-<v> → signed NSIS + portable, notarized dmg + zip (x64/arm64), AppImage + deb + rpm
Stage 3  release per variant (ubuntu, ~3 min)
         GitHub Release <variant>-v<version> (prerelease for internal) with all assets + SHA256SUMS + fingerprints
         Firebase App Distribution (APK + ad-hoc IPA → testers) · Changerawr notes
         Electron update feed: latest*.yml per variant/channel to object storage (generic provider)
Stage 4  store-submit (optional, environment store-<variant> with required reviewer)
         eas submit: App Store IPA → TestFlight/App Store Connect; AAB → Play internal track
```

Release assets per variant (example Unit 8.12): `ResgridUnit-8.12-android.aab`, `-android.apk`, `-ios-appstore.ipa`, `-ios-adhoc.ipa`, `-windows-setup.exe`, `-windows-portable.exe`, `-macos-arm64.dmg`, `-macos-x64.dmg`, `-macos.zip`, `-linux.AppImage`, `-linux.deb`, `-linux.rpm`, `-web.zip`, `SHA256SUMS`, `fingerprints.json`. Docker images `resgridllc/unit:8.12` and `:latest` (production channel only).

#### 6.6.5 Notes

- **Electron updates use a generic feed per variant** (object storage path `updates/<variant>/<channel>/`), not electron-updater's GitHub provider: five apps share one repo's releases, so "latest release" would point at another app.
- **Native build tool:** keep `eas build --local` (existing credentials flow) for the one release build per platform; bundletool and `fastlane resign` produce the second artifact. Direct Gradle/xcodebuild with ccache is the S3 alternative if EAS local cannot use the caches.
- **Runner concurrency:** five variants put up to ten jobs on macOS runners (iOS + Electron mac) at once. GitHub plans cap concurrent macOS jobs (5 on Team), so macOS work queues; iOS jobs get priority, Electron mac jobs follow. Larger runners or a self-hosted Mac are options if queueing dominates.
- **Expected effect:** 2 native builds per variant per release instead of 6; no native builds for JS-only releases; web built once instead of five times per variant; wall clock ≈ 30 min for all five apps versus ≈ 100 min per app today.
- **Secrets:** one GitHub Environment per variant (`responder`, `unit`, `ic`, `dispatch`, `bigboard`) with the same secret names in each (D14), plus `store-<variant>` environments for the approval-gated submit job.

## 7. The baseline: which implementation wins, per module

Notation: R/U/I/D/B. "A + B's X" = take A, merge X from B. Every row also takes the tests from the winning app(s).

### 7.1 Platform core

| Module | Baseline |
|---|---|
| `env.js` | B (merges runtime env, filters placeholders) + D (`IS_MOBILE_APP` boolean, false on web). Key names unified (`MAPBOX_PUBKEY` → removed with MapLibre; `COUNTLY_SERVER_URL`). |
| `platform.ts` | U/I + D. |
| Logger | I (sanitizes before console output) + R's no-ANSI transport (SentryCrash rejects control characters). Never log usernames (D, R do today). |
| Sentry | D init (DSN guard, release, environment) + R `beforeBreadcrumb`, hang/watchdog tracking + U/I `beforeSendTransaction` and noise filters. Per-variant project (D and B send to `unit` today). |
| Analytics | U Countly service (retry-count reset fix) + R `initializeWithEnv`/`setUserProperties`/`endSession` + D/B web wrapper. Delete dead Aptabase service. |
| Storage wrapper | U corrupt-value handling + D/B guarded zustand storage; web: B (no origin-wide `clearAll`). |
| Logout reset | R `registerStoreReset` registry + D `teardownSignedInSession`; preserve list adds language, theme, keep-alive (logout wipes them in R/U/I today) and BigBoard widget layouts. IC's legacy-key sweep adopted. |
| Lifecycle | D (memoized, debounced, forces "active" on web so hidden tabs don't drop hubs). |
| Router helpers | I's `lib/navigation.ts` (`registerNavigationReadyCheck`, `routerPushWithRetry` with `waitUntil`). |
| Utilities | D/B `single-flight`; consolidated UTC parsers (`parseApiUtcDate`, `parseUtcMs`, `safeFormatTimestamp`); U/I keep-alive logging + D/B web skip. |
| Maintenance / onboarding | B maintenance screen (full i18n) for all; onboarding content per variant. |

### 7.2 API, models, contract

| Module | Baseline |
|---|---|
| HTTP client | D structure (skips requests with no session, replays with a fresh token when the request's token is stale, one refresh engine) + 15 s timeout (D/B have none) + client and data-protection headers (B lacks) + shared-session 401 handling (U/I/D). |
| Cached endpoints | U (empty-payload guard, `forceRefresh`, scope guard, prune to 200) + I stale fallback offline; I's `clear()` that keeps `api_cache_scope` (others delete their own scope key). |
| QueryClient defaults (if kept) | U (staleTime 30 s, retry 2, no refetch on focus). |
| Models | Union of additive drift (~45 of 69 drifting files); reconcile conflicts against Core (§10.2): weather alerts (D matches Core), check-in models, `CallProtocolsResultData.Id`, `CallResultData.State: number`, `GroupResultData.TypeId: string`, video-feed coordinates, unit status numerics, shifts (`ShiftDayResultData`, R), incident command (I mirrors Core). Responder's duplicate `videoFeeds/*` removed. |
| Endpoints | Calls D (superset), call files R (token only to own host), check-in I, incident command I + D template/report endpoints, units R/U + D/B force refresh, personnel R (deduplicated; `satuses` → `statuses`), contacts U/D/B, dispatch D (+ nearest units), mapping I (indoor/custom, path params) + R (legend, POIs) + D (GeoJSON), chat I + D call filter, calendar/shifts/messaging R, weather D + I error class, config R + D anonymous system config, inbox U, records (identical). |
| Naming | kebab-case for `api/` and stores; `models/v4` keeps Core's camelCase folders. Renames: Appendix D. |
| Contract | Core CI publishes `swagger.json` → openapi-typescript types → contract test per hand-written endpoint (D12). |

### 7.3 Auth and security

| Module | Baseline |
|---|---|
| Auth API | U (no username in logs) + D error sanitizer (`oauthErrorId`, `rejectionReason`) + password-verifier helpers; 15 s timeout. |
| Token refresh | D engine (5 s → 60 s backoff, discards results after session change, half-lifetime floor, no import cycle) + U rule: log out only on 400/401 from the token endpoint. Fixes R (logs out on 500, hardcoded 3600 s lifetime, no proactive timer), I (any 5xx; refresh outside the store; raw base64 JWT decode) and B (any failure — fatal for a wall display). |
| Auth store | U skeleton (`restoreSession` from token `exp` with skew, whitelist persistence, single-flight logout, Sentry user) + D engine and dedicated auth storage + R cache scope stamped at load + D clear-state-first logout. |
| MFA | `lib/mfa` (identical R/U/I/D); `login-mfa` merged from U (unknown refusal → restart transaction), R (guard when `signIn` throws; sheet spinner try/finally) and D (`abandoned` check). Approver API and screens from R (`approveSignIns` capability). BigBoard gains MFA and passkeys. |
| SSO | OIDC D (scheme constant, web path, null-safe discovery, desktop id-token exchange) + R `isValidSsoUrl`/`departmentToken` + U/I shared-device ephemeral sign-in with the scheme from the manifest (U/I hardcode `resgridunit`). SAML R. Discovery U + R, with a timeout. BigBoard's legacy department-code SSO retired. |
| Login screens | R (`replace` navigation, `describeLoginFailure`, language picker) + U shared-device entry, `shift_ended`, password toggle. D `index.web.tsx` becomes the web layout of the same screen. |
| Server URL | D `lib/server-url.ts` + sheet (https only, http only to localhost; hosted fallback) + R order (sign out before switching) + U side effects (clear cache, invalidate config). |
| Rights / security store | U (keeps rights offline, clears cache on department change) + R generation guard and memo hook. |
| Feature flags, terminology | U stores + R reset registration; flags fetched after rights (U fetches in parallel → keyed without department). |
| Data protection | D (session generation, grant expiry timer) + U shared-lock generation + I `useProtectedGrantRefresh`. |
| Shared session | U controller (re-checks after unlock) + I store (lock generation bump). Capability: Unit, IC, Dispatch. |
| Personal lock | D (salted SHA-256 verifier), persisted lock state (today a kill skips the lock). Capability: Dispatch. |

### 7.4 Domain data stores

| Domain | Baseline |
|---|---|
| Calls | Union: D per-slice loading/errors + U/I call dispatches and POI form data + R call-extras prefetch + I persistence; cache policy per variant (D bypasses for live console). |
| Call detail / files / video feeds | D store (audio, delete, reschedule); R files API; U shape + D race guard for video feeds; action names unified. |
| Check-in timers | D store + R global overdue count. |
| Incident command | I `stores/command/*` (+ I's duplicate `api/command/*` folded in); U resource-view store for view tier. |
| Units / roles / unit status | I data shape (R filter UI state split out); U roles; U unit-status sheet logic. |
| Personnel / statuses | R/D; personnel filter renamed `getPersonnelFilterOptions`. |
| Contacts | R/U/I/D; preplans D. |
| POIs / maps | D POIs + R detail cache; I custom/indoor maps. |
| Chat | I + D call filter; one `getChannels` signature. |
| Calendar, shifts, messages | R (shifts +771 lines vs others). |
| Weather alerts | D + U filter/sort + R severe-alert selectors; D admin slice behind `weatherAlerts.admin`. |
| Records | Identical; U race guards + R sign-out reset; origin client from the manifest. |
| Toast | I/D options-object API (R's positional form migrated). |

### 7.5 Realtime

- **Service:** D `signalr.service.ts` (visibility handling skipped on Electron, `withServerTimeout(60000)`, abort controllers, `connection.off` cleanup, connected check in `invoke`, hub state events) + token read at call time (D reuses the connect-time token on reconnect) + U geo-hub auth without query-string token (confirm server support) + R recovery of hubs that exhausted retries when NetInfo returns, intentional-disconnect tracking, typed `invoke<T>` + U stop-on-empty-refresh and 10-retry linear backoff capped at 60 s. Emit loop wrapped per listener (R lacks try/catch); all hub arguments forwarded (B forwards only the first).
- **Store:** R structure (safe handlers subscribed once, rejoin generation counters, outage tracking) + per-variant event sets (D `unitActiveRolesUpdated`, `checkInUpdated`, `outstandingRequirementsUpdated`; B `unitStatusAlertUpdated`; R/U `checklistUpdated`; I coalesced board refresh + debounced `/Sync/Bundle`) + B's hub watchdog (`hubWatchdog` capability for always-on screens).
- **Live locations:** D `lib/live-locations.ts` + `use-map-live-locations.ts` (five APIs today).

### 7.6 Notifications

- **Native push:** U `push-notification.ts` (notifee channels `calls`, `0`–`3`, `notif`, `message`, `c1`–`c25`, modern/classic sounds, iOS categories, check-in action, 200-entry cold-start dedupe, unit token cleanup, sign-out with the outgoing session's token) + R deep-link table (`W:`, `M:`, `NA:`, `NWO:`, `CT:`, `NC:`), queued registration and re-registration on resume, cold-start handling before channel setup + I persisted registration with `Source` from the manifest. `isSafeRouteId` everywhere (B lacks it).
- **Web/Electron push:** U `push-notification.web.ts` (Firebase JS + service worker, per-step timeouts, Electron push receiver) + D desktop toasts for SignalR events.
- **Novu:** 3.11 for all (R/D/B on 2.6.6). Subscriber id and HMAC per manifest: `{code}_User_{id}` + `NovuSubscriberHash` (R, D, B — B passes no hash today), `{code}_Unit_{unitId}` + `GetUnitSubscriberHash` (U), `{code}_IC_User_{id}` + `NovuICSubscriberHash` (I).
- **Inbox UI:** R (FlashList, safe route ids) + U inbox reference; per-variant deep-link resolver tied to the route contract.
- **Sounds (D17):** modern sounds only — the toggle and the classic sound files are removed. Android channel ids stay exactly what the server sends (`calls`, every `PushSoundTypes` value incl. `4`, `5`, `7`–`26`, `c1`–`c25`, `notif`, `message`), each created with the modern sound for that type's meaning, so a department still on classic server settings also gets modern sounds and no type targets a missing channel (§10.2a). iOS categories `calls`, `messages`, `notifications`, `chats` are all registered.

### 7.7 Location

One transmitter with a person or unit target: R background-task registration from `index.ts` (survives an OS relaunch; Unit defines the task in a route-loaded module and drops fixes after relaunch) + U transmission gate, automotive mode, re-registration on option change, offline queueing, browser geolocation on web. Realtime-geolocation default per variant (R off, U on). Background capability only in R/U.

### 7.8 Voice and PTT

LiveKit store from U (Android routing via InCallAudioModule, room-switch race fix, reconnect) + R headset-button PTT (AirPods/AVRCP), microphone toggle, CallKeep mute sync. Bluetooth PTT: D module split (native/web/factory) + U device logic (Aina, Inrico, HYS). Desktop console PTT: D `use-ptt.ts`. CallKeep for R/U/I. BigBoard's never-mounted voice stack and the dead `features/livekit-call` in D/B are dropped.

### 7.9 UI system

| Item | Baseline |
|---|---|
| Styling | NativeWind 5 (migrate preview.4 → RC with the `nativewind-preview-to-rc` skill), Tailwind 4 CSS config, `global.css` R/U/I/D (dark via media query; no className on the native root View — B's breaks ScrollView pan), `global.web.css` D, tokens U/I + D focus-visible + B marquee keyframes, dark primary scale reversed (D and B don't today). `@source` for `packages/**` in the app CSS. |
| Primitives | Native R; web U `toDomProps` + R `numberOfLines` line-clamp + accessibility → aria; R focus-aware status bar, keyboard-avoiding view (keyboard-controller + `BottomAnchoredKeyboardView`), drawer, utils, button/progress/textarea; I safe-area-view; U actionsheet (backdrop arming); bottom sheet U + I; I SideDrawer; U NativeModal; lucide icon union; shared-tabs R + U; flat-list U/I/B (delete D's shadowing `ui/flat-list.tsx`). |
| Barrel | One `@resgrid/ui` export surface with R semantics (today the same import is gluestack `Pressable` in R and RN `Pressable` elsewhere). |
| HtmlRenderer | U's (`.web` iframe without `allow-same-origin`, http/https/mailto links only) everywhere — replaces R/D/B inline WebViews and IC's unsafe web version. `sanitize-html` stays pinned at exactly 2.17.0. |
| Toast | I store API + U modal hosts + I toast UI. |
| Theme helpers | `useThemeColors()` for maps/SVG/WebView/navigation; per-variant accent via `variants/<v>/theme.css`. |
| `tailwind-variants` | ^3.1 + tailwind-merge ^3 (do not force gluestack's nested copies). |

### 7.10 Shared features

| Feature | Baseline |
|---|---|
| Call card / list | R (dispatch ticker, assignment context) + U/I timer props; `density` prop (`compact`/`comfortable`/`wall`) so BigBoard widgets reuse rows. |
| Call create/edit | D superset (templates, contact picker, linked calls, protocol selector, UDF, run-card recommendation, server geocoding, coordinate entry, scheduling) + U location fields, destination POI selector, location search; `calls.create` quick/full. |
| Call detail | Tab registry: shared tabs (Info, Protocols, Dispatched, Activity, Location history, Check-in, Video feeds, Incident command, Records, Site info, protected reveal) + IC unit readiness/command sheets + D alarm level, escalate, response code, outstanding requirements + U status-for-call. |
| Close call / menus / modals | R + D; notes/images/files modals R UI + U NativeModal. |
| Contacts | U/I (tap-to-act, coordinates → directions) + R additions + D files/preplan panels. |
| Chat | R composer + I message actions + D new-conversation sheet. |
| Notes, protocols | U/I (HtmlRenderer) + R extras. |
| Records, operations | Mostly identical; I list item, attachments, time report. |
| Checklists | R (+ due-checks card). |
| Weather alerts | R components + U/I detail map and severity tabs + D admin sheets/settings + B widget. |
| Status | One StatusPicker: U status sheet (destinations, status flow, hold-to-confirm) + R personnel status and staffing sheets + D on-behalf sheets; `status.subject`, `status.onBehalf`. |
| Roles | U. |
| Units / personnel | R lists/cards/filters + D detail pages + U unit-type icon. |
| Check-in / PAR | R check-in target + D sheet + U timer card. |
| Video feeds | D (form, player) + U format utils. |
| Incident command | I canonical; tiers `view` (R/U), `assist` (D), `command` (I). |
| Settings | Section registry: R items (Bluetooth, server URL, login info, audio device, navigation app) + U unit selection + U/D sounds; per-variant sections. |
| Navigation hand-off | R/U/I 10-app hand-off (`lib/navigation.ts` + `storage/navigation-app.ts`) for all variants. |
| Maps | MapLibre plan §8.1 wrapper in `@resgrid/maps`; component baselines: pin marker I + U active state + D memo, map pins R, pin detail U, legend R, pickers R + D web, static map I (then server static maps), POI set R, layers sheet I, Unit location marker/full-screen/camera U, Dispatch legend/focus banner D. |

### 7.11 Variant-specific modules

| Variant | Modules (folder under `@resgrid/features`) |
|---|---|
| Responder | `member-home` (status/staffing home, nested tabs, due checks), `calendar`, `shifts` (incl. trades), `messages`, `staffing`, `work-orders`, `certifications`, approve-sign-in, web edition, headset PTT |
| Unit | `unit-status` (status console sidebar, hold-to-confirm, roles), `unit-routes` (9 screens), `inventory` (counts), custom/indoor maps, shared vehicle session, Electron MDT, in-app navigation (MapLibre P4) |
| IC | `incident-command` (command board, lanes, accountability/PAR, needs, objectives, timers, voice, AI assistant, command map/log, resource map, incidents), offline queue screen (generalized for all), command-app access |
| Dispatch | `dispatch-console` (panels, actions, multi-select, ticker, PTT, 1/2/3-column layouts), `runcards`, `call-queues` (pending/scheduled/archived), `awaiting-resources`, weather admin, IC assist, personal lock |
| BigBoard | `dashboard` (custom grid on gesture-handler + reanimated, 14 widget types, widget settings stores, configure screen; the draggable-grid packages are unused and dropped), OpenWeather client under `dashboard/integrations` |

### 7.12 i18n

- `@resgrid/i18n` with U/I locale detection (all device locales), R's translate-cache clear on change, D's guarded web storage; 10 languages; `ar` RTL.
- Namespaces: `common` (~1,250 keys present in ≥ 4 apps) + one per variant (`responder`, `unit`, `ic`, `dispatch`, `bigboard`), `fallbackNS: 'common'` so existing flat keys keep working. Product names through `{{appName}}`.
- Reconciliation: the 71 English conflicts by review (`i18n-conflicts.tsv`); the 2,355 divergent translations resolved per key by git-blame recency into review CSVs; duplicate namespaces merged (`weatherAlerts`/`weather_alerts`, `videoFeeds`/`video_feeds`, `poi`/`pois`); scaffold strings removed ("Welcome to obytes app site").
- CI: key-set parity per language, unused-key report.

### 7.13 Config plugins and patches

One copy each in `@resgrid/config-plugins`: `withResourceBundleDeploymentTarget` (identical), customGradle (R, ARM ABIs), customManifest (R, cleartext gated to dev, phantom import fixed), icon badge (D `withIconBadge`), Live Activities (R `withLiveActivities`, team id from env; Unit's hardcodes `QKQVAJMTCN`), MediaButton and InCallAudio modules (U/I versions, package from manifest), notification sounds (U/I `withNotificationSounds` vs expo-notifications `sounds` — pick one in Phase 1), IC policy plugins (`withoutBackgroundLocation` for IC; `withRestrictedBootReceivers` for all). Dead plugins dropped (U `withWebRTCFrameworkFix`, `withForegroundNotifications` unless IC's static-frameworks build needs the former).

## 8. Offline-first and durable operations for every app

The design remains [`offline-first-architecture.md`](../../../int-Coordination/docs/architecture/offline-first-architecture.md) (persisted stores, generalized outbox, idempotency, three sync phases, RMS/Protected Data profiles). Omni implements it once, for all five variants.

### 8.1 Starting point

| Design element | U | I | R / D | Omni baseline |
|---|---|---|---|---|
| Persisted domain stores | `calls` not persisted | `calls`, `command` persisted | bounded | I + every offline-relevant store persisted (§8.5) |
| Stale reads offline | no | yes | no | I stale fallback + U empty-payload guard |
| Outbox drainer | best: ordered, single pass, newest-fix-only for location, 4xx permanent, prune failed to 50, recover "processing" after kill | partial ordering | R: tagged with server + user, encrypted, 7-day expiry for other users' items | U drainer + I event types + R scoping/encryption |
| Event contract / handler registry | switch | switch (26 IC types) | — | typed registry (§8.3) |
| Dead-letter UI | — | `settings/offline-queue` | — | I screen for all variants |
| Idempotent creates | — | temporary `local-*` ids | chat outbox + RMS records only | client GUIDs + idempotency keys (§8.6) |
| Shift-start hydration | — | `/Sync/Bundle` (Changes/Reference unused) | — | manifest-driven hydration (§8.4) |

### 8.2 Durable storage layer (`@resgrid/offline`)

- **KV state:** MMKV (native) with the frozen per-variant identity (D8); encrypted.
- **Queues and large sets:** SQLite (`expo-sqlite`) — owner decision — for the outbox, cached collections that outgrow MMKV (call history, messages), attachment staging manifests and the map pack registry. MMKV keeps small KV state (session, preferences, persisted store snapshots).
- **Web / Electron:** `react-native-mmkv` on web is localStorage (≈5 MB, evictable) — not durable enough for an outbox. Adapter order: `expo-sqlite` web (OPFS) if spike S7 passes (it needs COOP/COEP headers in nginx and Electron), else IndexedDB. Electron can also use the filesystem through the preload bridge. `navigator.storage.persist()` requested.
- **Interface:** `DurableStore` (KV), `DurableQueue` (ordered, transactional), `BlobStore` (attachments, map packs) — platform implementations behind one API.
- **Scope and wipe:** every record keyed by server + department + user (+ unit for Unit); wipe on logout, department switch, server switch; excluded from device backups; never in analytics or support bundles (offline-first Protected Data profile).

### 8.2a Storage maintenance and user controls

Local data must never grow without bound (owner requirement).

- **Retention per table**, declared next to each table's schema and enforced by one maintenance job:

  | Data | Kept |
  |---|---|
  | Outbox: sent | Deleted on server acknowledgement |
  | Outbox: dead-lettered / failed | 14 days, max 200 items, then dropped with a log entry |
  | Outbox: other user's or server's items | 7 days |
  | Cached collections (calls, messages, history) | Working-set window per variant (e.g. closed calls 7 days, messages 30 days) and a row cap per table |
  | Incident working sets | Removed after the call closes and its outbox drains |
  | Attachment staging | Deleted after upload; orphans after 24 h |
  | Offline map packs | MapLibre plan §19.5 (LRU, per-variant budget) |

- **Maintenance job:** runs at app start (deferred until after first render), on foreground after 24 h, and after each successful sync: applies retention, runs `PRAGMA incremental_vacuum` (databases created with `auto_vacuum=INCREMENTAL`), `PRAGMA optimize`, WAL checkpoint, and records sizes. A per-variant storage budget (e.g. 150 MB SQLite excluding map packs) triggers oldest-first pruning of cached data — never of unsent writes.
- **Schema migrations** are versioned and forward-only; a failed migration rebuilds caches from the server instead of blocking the app (queued writes are preserved first).
- **Settings → Advanced → Storage & sync** (every variant):
  - sizes: database, cached data, attachments, map packs, free device space;
  - pending changes: count and list of queued, failed and stuck items (age, type, last error, attempts) with **Retry**, **Retry all** and **Discard** (confirmation required);
  - last successful sync and hydration times; "Sync now";
  - **Clear cached data** — drops caches and map packs, keeps the session and unsent changes;
  - **Clear all local data** — warns with the number of unsent changes, then wipes SQLite, MMKV app data (except device preferences) and map packs and signs out;
  - diagnostics summary for support (counts and sizes only; no record content, no protected values).

### 8.3 Outbox contract

```ts
interface OutboxEvent<T = unknown> {
  id: string;                 // client UUID = idempotency key sent to the server
  type: string;               // registered handler key, e.g. 'status.set', 'ic.lane.create', 'records.draft.save'
  payload: T;
  scope: { server: string; departmentId: number; userId: string; unitId?: number };
  createdAt: number;          // device clock, ordering within a scope
  dependsOn?: string[];       // e.g. close call after close command (IC rule, generalized)
  coalesceKey?: string;       // newest-wins collapse, e.g. location fixes per unit
  attempts: number; state: 'pending' | 'processing' | 'failed' | 'dead';
  lastError?: { status?: number; code?: string; message: string };
  requiresOnlineAuth?: boolean; // RMS legal transitions, protected writes: never silent replay
}
```

- Handlers register `{ type, send(event), optimisticApply?, rollback?, classify(error) }`; variants register only the handlers in their scope.
- Drain on reconnect, foreground and timer; one pass at a time; dependency-ordered; 4xx permanent (dead-letter), 5xx/network retry with backoff; "processing" recovered after a kill; events from another user/server never replayed (held 7 days, then dropped with a visible record).
- **Pending sync** screen (from IC) in every variant: queued, failed and dead items with retry/discard; an offline banner and a "N changes waiting" indicator in the shell.

### 8.4 Hydration and reconciliation

- **Shift-start hydration** is an init-step list per variant (`offline.scope`): reference data (`/Sync/Reference`), working set (variant bundles — IC `/Sync/Bundle` exists; others composed from existing endpoints until Core adds scoped bundles), map packs (MapLibre §19), each with progress in a "field ready" checklist.
- **Reconnect:** refresh auth and grants → pull deltas (`/Sync/Changes` where available; otherwise re-fetch working-set endpoints) → reconcile → drain outbox → resume SignalR. Conflict policy per entity class (offline-first §8.1); RMS legal transitions and protected writes need a fresh online authorization and user confirmation.

### 8.5 Per-variant scope

| Variant | Read offline | Write offline |
|---|---|---|
| Responder | Own status/staffing, active calls + detail of the call responded to, personnel/units summary, shifts and calendar (own), messages (recent), contacts, protocols, notes, checklists, weather alerts, POIs, map packs | Personnel status, staffing, location fixes (person), self check-in, call notes/images, message compose, checklist runs, work-order reports, bounded RMS drafts |
| Unit | Offline-first §12 Unit scope: active calls + metadata, units, personnel + statuses + staffing, dispatches, contacts, groups, POIs, routes + active instance, protocols, weather, inventory for the unit, map packs (AO, incident, route corridors) | Unit status, location fixes (unit), check-in, call notes/images/files, route stop check-in/out, inventory counts, crew time reports/expenses, bounded RMS drafts |
| IC | Offline-first §12 IC scope (full command board per active incident, accountability, resources, objectives, timers, roles, annotations, timeline, POIs, protocols, maps) | All 26 IC event types (establish/transfer/close command, lanes, resources, roles, objectives, timers, annotations, check-ins) + status/location + RMS drafts |
| Dispatch | Active/pending/scheduled calls, units, personnel, statuses, POIs, contacts, protocols, run cards, weather alerts, map packs | Call notes, unit/personnel status on behalf, check-in updates, RMS drafts, **new calls** (owner decision; below) |
| BigBoard | Last dashboard data for every widget, with stale indicators; never logs out on network loss (`neverLogoutOnTransientError`); hub watchdog | Widget acknowledgements only (unit status alert acks) |

**Offline call creation** (any variant with `calls.create`; owner decision): the call is saved locally with a client GUID and shown everywhere as **"Queued — not dispatched yet"** (distinct colour, no call number, a banner while offline). Nobody is paged until the server accepts it. On reconnect the outbox sends `SaveCall` with the GUID as the idempotency key (Core change §8.6), replaces the local record with the server call (number, dispatch state) and notifies the creator. If the server rejects it (validation, required fields, permissions), it stays in Pending sync for correction. Possible duplicates (another call at the same location within a short window, via call location history) are flagged to the creator after sync. Local geocoding is unavailable offline: the form accepts coordinates from the map, a POI/contact address or free text.

### 8.6 Backend work (Core)

From offline-first §9, broadened from IC to every variant, plus the owner decisions of 2026-10-31. All additive (old builds unaffected); migrations and identifiers via the registry at authoring; made on Core `develop`.

1. Change-tracking columns (`ModifiedOn`, `DeletedOn`) on offline-relevant entities.
2. Idempotent creates honoring client GUIDs — first `SaveCall` (offline call creation), call notes/images, check-ins, then the rest of the outbox types.
3. `IdempotencyKey` dedupe on status, location, check-in and note endpoints.
4. `/Sync/Changes` and `/Sync/Bundle` generalized with a scope (unit, user, dispatch) beyond incident command.
5. **Long-lived refresh tokens (decided):** each variant sends its own OAuth `client_id` on the password and refresh grants; Core's `OidcConfig.TrustedLongLivedClientIds` lists the five ids (hosted config in `int-Fleet`, default in the self-host kit and `resgrid-setup`), giving the 365-day refresh lifetime. Old builds (no `client_id`) keep today's behaviour. **Found during implementation (2026-11-01):** Core's OpenIddict rejects any `client_id` that is not a registered application (`invalid_client`), and only the events client is registered today — so Core must also **register the five ids as OpenIddict applications** (public clients, password + refresh_token + the MFA-completion and external-token grants). Until then `@resgrid/auth` retries once without `client_id` and remembers that server for the session, so sign-in keeps working with today's 2-day refresh tokens.
6. **Realtime weather alerts (decided):** `WeatherAlertService` publishes alert received/updated/expired through the eventing pipeline (new `EventingTypes` values from the registry) to `/eventingHub` as `weatherAlertReceived`, `weatherAlertUpdated`, `weatherAlertExpired` (id-only, department-scoped), alongside the existing `M` inbox message. Omni subscribes and refetches.
7. Push: keep sending today's sound types and categories (Omni maps them all, §7.6); no server change needed for modern-only sounds.
8. `Config/GetConfig` branch for the IC app key if IC needs app-specific values (§10.2a).

### 8.7 Map data offline

Owned by MapLibre plan §19: department manifest, server-built PMTiles packs (OSM base map, custom map rasters), DepartmentData bundle (layers, geofences, POIs, hydrants, indoor metadata), department sprite, per-variant pack defaults; pack registry and blobs live in `@resgrid/offline` storage.

### 8.8 Phasing

Offline lands with the foundation, not at the end: durable storage and the outbox in Phase 1; each shared feature in Phase 3 ships with its handlers and persistence; per-variant scopes and hydration complete in Phase 4 before a variant replaces its store listing.

### 8.9 Acceptance

Per variant, in airplane mode after hydration: cold start shows the working set; every write in the scope table queues, survives an app kill, replays once on reconnect (server sees one row per idempotency key), and conflicts appear in Pending sync; logout leaves no records; switching user or server never replays the previous user's events.

## 9. Maps: MapLibre and offline maps in Omni

The [MapLibre plan v1.1](../../../int-Coordination/docs/architecture/maplibre-mapping-routing-navigation-plan.md) governs; in Omni:

- `@resgrid/maps` implements §8.1 (`rg` wrapper over `@maplibre/maplibre-react-native` / `maplibre-gl`, `map-provider`, traffic and route layers) once, and §19.5 offline packs on `@resgrid/offline` storage.
- `@resgrid/navigation` implements §9 for the Unit variant (`navigation.inApp`); Responder can enable it later by capability.
- Unit route work (§10.7) lands in `features/unit-routes`, fixing RD11–RD13 during the merge.
- Geocoding moves to the server endpoints for every variant (Dispatch's module becomes shared); attribution on in every map.
- Before Core ships MapLibre P1, Omni derives MapLibre styles client-side from existing config (§8.3) — Omni does not wait for the server.
- Offline base maps use **Protomaps** (owner decision): packs cut from Resgrid's mirror of the Protomaps planet build, drawn with `@protomaps/basemaps` styles, limited to each department's **maximum response area** (size-enforced; 40 km fallback) — MapLibre plan D13, §19.3.
- MapLibre P0-a/P0-h spikes run in Omni's Phase 0 build (S5).

## 10. Defects surfaced by the survey

### 10.1 Security and store-policy defects live in shipped apps — hotfix in the legacy repos now

| # | Defect | Apps |
|---|---|---|
| S-1 | Web HtmlRenderer iframe uses `allow-same-origin allow-scripts` with server HTML → script can read app storage, including tokens | IC (Unit fixed) |
| S-2 | Second MMKV instance opens the main store id `ResgridUnit` with key `'hunter2'` (`lib/storage/background-geolocation.ts`) | Unit (Responder fixed its copy) |
| S-3 | Server URL accepts `http://` for any host in production → password in cleartext | Responder, IC, BigBoard |
| S-4 | Raw axios errors (request bodies with passwords/tokens) sent to Sentry; raw usernames logged | Dispatch (errors), Dispatch + Responder (usernames) |
| S-5 | No HTML sanitizer while rendering server HTML in 5 WebViews, one with `originWhitelist=['*']`; push route ids not validated (`isSafeRouteId`) | BigBoard |
| S-6 | Production `usesCleartextTraffic=true` | Responder |
| S-7 | Background location declared with no task registered (App Review / Play policy exposure) | Dispatch, BigBoard |
| S-8 | Refresh failure on server outage signs users out (wall display goes dark) | BigBoard (any failure), IC (5xx), Responder (500) |
| S-9 | Novu inbox without subscriber HMAC hash (breaks when HMAC is enforced) | BigBoard |
| S-10 | Sentry events routed to the `unit` project | Dispatch, BigBoard |

### 10.2 API contract defects (verified against Core `develop` 158e5707)

- Dispatch, BigBoard: calendar routes that do not exist (`GetCalendarItems`, `GetCalendarItemTypes`, `GetCalendarItemsForDateRange`, `SetCalendarAttending`); `/Shifts/GetAllShifts` does not exist.
- BigBoard: `/Calls/UpdateCall` (Core: `EditCall`), `/Dispatch/GetSetUnitState` (Core: `GetSetUnitStatusData`), `GetWeatherAlert` id as query (Core: path).
- Responder: `/Mapping/GetMapLayers` → 404 (Core route is `GetMayLayers`).
- Unit: eight mapping calls send ids as query parameters; Core defines path routes (IC fixed).
- Responder, Unit, Dispatch: `ToggleCallTimers` sends a JSON body; Core reads query parameters (IC correct).
- Calendar `GetCalendarItem` parameter name likely wrong in all three calendar apps (confirm).
- Model mismatches listed in §7.2.

### 10.2a Server ↔ app contract gaps (from Core code, not yet device-verified)

- **Push channels:** the server sends Android `channelId` = sound type (`4`, `5`, `7`–`26`, `c{n}` possible) and iOS categories `messages`, `notifications`, `chats`; the apps create only `calls`, `0`–`3`, `notif`, `message`, `c1`–`c25` and register only the `calls` category. Verify on a device; Omni creates every channel and category (§7.6).
- **Weather alerts realtime:** the apps subscribe to `weatherAlertReceived/Updated/Expired`, but no Core code emits them; alerts arrive as `M` inbox messages. **Decided:** Core adds the events (§8.6 item 6).
- **Refresh-token lifetime:** apps send no `client_id`, so refresh tokens get `NonMobileRefreshTokenExpiryDays` (default 2 days) unless production lists a trusted client id; the `mobile` scope has no effect. **Decided:** per-variant `client_id` in `TrustedLongLivedClientIds` (§8.6 item 5).
- **IC config key:** `Config/GetConfig` has no branch for an IC app key; IC receives the generic config. Add one in Core if IC needs app-specific values.
- **`login_error`** is parsed by all apps but exists only on Core branch `login-error-codes` (unmerged).

### 10.3 Behaviour defects folded into the baseline

Unit/IC desktop drop every SignalR hub when the window is hidden (no forced "active" app state on web); hubs that exhaust retries stay dead until resume (U/I/D); Unit's background location task is lost after an OS relaunch; logout wipes language/theme (R/U/I); Unit/Dispatch switch server before signing out (push unregister hits the new server); IC registers push with an empty device id after in-app sign-out; Unit/IC navigate after sign-in with `push` (Android back returns to login); MFA sheet spinner sticks (U/I/D); Unit fetches flags before rights; Dispatch's lock state is not persisted; IC's offline store adds a NetInfo listener on every init; Dispatch's `ui/flat-list.tsx` disables FlashList; dark-mode primary scale not reversed (D/B); BigBoard `type-check` can never fail (`|| true`). Each is fixed by taking the baseline in §7.

## 11. Migration and cutover

### 11.1 Phases

| Phase | Content | Exit criteria |
|---|---|---|
| **P0 Foundation and spikes** | Repo scaffold (pnpm, catalogs, tooling, CI skeleton, AGENTS.md, skills); `apps/omni` with the variant system and five hello-world variants; spikes: **S1** expo-router `root` per variant + per-variant Metro cache; **S2** per-variant autolinking exclusion + permissions (App Store purpose strings, Play declarations); **S3** five EAS projects from one directory + version/versionCode continuity; **S4** storage-identity upgrade test (legacy store build → Omni build keeps session) for one variant; **S5** MapLibre RN on Expo 57 / New Architecture incl. local PMTiles (MapLibre P0-a, P0-h); **S6** `apps/desktop` packaging a web export, signing, auto-update; **S7** durable web storage (expo-sqlite OPFS vs IndexedDB). | All five variants build for all six targets from one commit; S1–S7 go/no-go recorded; D1 confirmed or fallback chosen. |
| **P1 Platform core** | L0–L3 packages from the §7.1–7.8 baselines with their tests: config, core, i18n (namespace split), offline (SQLite + MMKV durable store, outbox, maintenance job, §8.2a), api (client, cached endpoints, models, endpoints, contract tests), auth (per-variant `client_id`), realtime (incl. weather events), notifications (modern-only channels), location, voice; `expo-updates` channels (D18); `release.yml` build chain (§6.6). | Package test suites green in CI; contract tests pass against Core Swagger; a headless smoke signs in, hydrates and drains an outbox per variant; one release run produces every emit for one variant. |
| **P2 UI system and shell** | `@resgrid/ui` (merged primitives, tokens, NativeWind RC), `@resgrid/app-shell` (providers, shells, ShellGate, nav registry, init steps, route contract), form factors. | Each variant renders its shell, login, settings and maintenance on iOS, Android, web, Electron. |
| **P3 Shared features** | §7.10 features, each with offline handlers and persistence (§8.8), maps on MapLibre (§9). | Feature tests green; per-variant route contract passes for implemented routes. |
| **P4 Variants** | §7.11 modules and per-variant scopes, one variant at a time (§11.2): parity checklist, offline acceptance, upgrade test, internal beta (TestFlight / Play internal / Firebase App Distribution), store release with the same bundle ID. | Variant replaces its legacy store build; legacy repo archived (D15). |
| **P5 MapLibre follow-ons** | MapLibre P4 (Unit navigation), P5c (route navigation), P8b (offline maps) as their server phases land. | MapLibre §1.2 criteria. |
| **P6 Hardening** | Approval-gated `eas submit`, Electron auto-update rollout to all channels, Turborepo or larger runners if CI time demands, generated API models once Core annotations allow. | — |

### 11.2 Variant order

Decided (owner, 2026-10-31): **BigBoard → IC → Dispatch → Unit → Responder.** BigBoard is the smallest, furthest behind (gains 143 missing shared files) and lowest risk to field users; IC is the offline-first reference and has the newest codebase; Dispatch exercises web/Electron-first layouts; Unit carries the most native surface (AVL, PTT, CallKit, routes); Responder has the largest install base and goes last, on a proven pipeline.

### 11.3 Store continuity checklist (per variant)

1. Same bundle ID / package, scheme, associated domains, App Group, push keys (same EAS project).
2. Version and versionCode strictly above the store's current values (read from App Store Connect / Play Console, not local tags).
3. Storage identity unchanged (MMKV id/key, persisted store names, preserved keys); upgrade test passes on a device with queued offline actions.
4. Same Novu subscriber id format and push `Source`; same Sentry project (corrected for D/B).
5. Web: same Docker image name, legacy env names honoured, same AASA/assetlinks.
6. Electron: same appId and protocol (BigBoard: loopback origin or localStorage migration); first auto-update channel published.
7. Old app builds in the field keep working against the server (all Core changes additive).

### 11.4 Legacy repos

Freeze to critical fixes at P1 start (D15); §10.1 hotfixes land now; every hotfix after the freeze is also applied in Omni the same day. Carry over by hand: Responder `google-services.json` (into CI secrets), Dispatch `.env.development`/`.mcp.json` (if still needed). Consolidate the docs worth keeping (build/release, SignalR, push/FCM, Bluetooth audio, auth token refresh, secure storage, WebView HTML security, React Native Web rules, BigBoard widget system) into `docs/`; drop AI-written one-off change notes.

### 11.5 Core dependencies

Omni builds against Core `develop` only (D16). Features whose server side exists only on Core worktree branches (today: archived calls, POI capabilities, required call custom fields, `login_error` codes) are ported when that work reaches `develop`; until then the legacy behaviour applies. Swagger dump in Core CI (D12). Backend work in §8.6 scheduled per variant scope. MapLibre server phases per that plan.

## 12. Testing strategy

- **Unit/integration:** Jest in CI on every PR (sharded). Tests move with their baseline module; conflicting tests are reconciled, not dropped.
- **Contract:** endpoint method/path/params vs Core Swagger; model shape checks for reconciled models.
- **Route contract:** per variant, every emitted href resolves; every `(app)` route is in the nav registry.
- **Variant config:** snapshot of `expo config` per variant × env (bundle ids, permissions, plugins) — a diff means an identity change and needs review.
- **Upgrade tests:** legacy build → Omni build on iOS and Android (session, settings, queued actions).
- **Offline acceptance:** §8.9 scripted with network toggling; outbox idempotency asserted server-side.
- **E2E:** Maestro flows per variant (login, home, call detail, status change, offline queue) on Android emulator and iOS simulator; Playwright smoke for web and Electron. Fix stale Maestro `APP_ID` (`com.obytes.development`).
- **Visual:** docs screenshot harness per variant (existing Expo-web screenshot approach) for regression review.

## 13. Agent tooling

- `AGENTS.md` (canonical) and `CLAUDE.md` (imports it) at the root: stack, layout, layering rules, variant/capability rules, Resgrid domain essentials, conventions, testing, source control, what never to change.
- Skills in `.claude/skills/` (mirrored to `.agents/skills/` by `scripts/sync-agent-skills.mjs` for other agents):
  - Third-party, vetted and sanitized (provenance in each `SOURCE.md`): `expo-upgrade`, `eas-app-stores`, `eas-update`, `expo-router`, `expo-module`, `expo-animation` (Expo), `react-native-best-practices`, `react-native-testing` (Callstack), `nativewind-preview-to-rc` (NativeWind).
  - Resgrid knowledge skills: domain, v4 API, realtime and push, auth and protected data, variants and capabilities, offline-first, porting from the legacy repos, i18n, platform builds, maps.
- Source control: agents may commit to local branches (`RO-Txxx Summary`); nothing is pushed until the owner has reviewed it.
- Skipped on purpose: Expo `expo-ui`/`expo-native-ui`/`expo-design-system` (conflict with gluestack), `expo-data-fetching` ("avoid axios"), gluestack v4 skills (wrong version, auto-commit), Vercel React/RN skills (overlap, Next.js focus), `web-design-guidelines` (fetches unpinned remote instructions).

## 14. Risks and open questions

| # | Risk / question | Mitigation |
|---|---|---|
| R1 | Per-variant native-module exclusion is fragile in one Expo project | Spike S2; solve inside the single project (generated `react-native.config.js`, autolinking exclude, Metro stubs, permission plugins). |
| R2 | Upgrade signs users out or loses queued actions | D8 frozen storage identity; S4 and §11.3 upgrade tests per variant. |
| R3 | versionCode regression / tag collisions | D13; seed from store values. |
| R4 | Metro cache contamination across variants | Per-variant cache dir; CI builds variants in separate jobs. |
| R5 | MapLibre RN maturity on Expo 57 / New Architecture | S5 (MapLibre R1); wrapper isolates screens. |
| R6 | Jest suites that never ran in CI fail on import | Expected; triage in P1 per module, quarantine list with owners. |
| R7 | iOS CI cost × 5 variants | Release builds per variant tag, not every PR; PRs run `expo config` + web export only. |
| R8 | Scope creep: "while we're here" rewrites | §2.2 non-goal; baseline = best existing implementation. |
| R9 | Legacy repos keep moving during the build | D15 freeze + same-day Omni port of critical fixes. |
| R10 | Web durable storage limits (eviction, quotas, COOP/COEP for SQLite OPFS) | S7; Electron recommended for desktop offline. |
| R11 | Translation reconciliation effort (2,355 divergences) | Recency-based default with review CSVs; native-speaker review backlog tracked separately. |
| R12 | Single developer bandwidth across five store pipelines | One pipeline, variant matrix; variants cut over one at a time. |

## 15. Owner decisions (2026-10-31)

| # | Question | Decision |
|---|---|---|
| 1 | Repo structure | **One Expo project** (D1) |
| 2 | Package manager | **pnpm** (D6) |
| 3 | Ticket prefix / commits | **`RO-Txxx`**; agents may commit locally, the owner reviews before anything is pushed |
| 4 | Agent commit rule | **Relaxed** for Omni (no push without review) |
| 5 | React Query | **Dropped** (D7) |
| 6 | Durable queue store | **SQLite**, with retention, vacuuming and size budgets, plus Settings → Advanced → Storage & sync to inspect pending/stuck items and clear local data (§8.2a) |
| 7 | Long-lived refresh tokens | **Yes** — per-variant `client_id` in `TrustedLongLivedClientIds` (§8.6) |
| 8 | Notification sounds | **Modern only**; toggle and legacy sounds removed (D17) |
| 9 | Weather alerts | **Realtime** — Core emits weather alert events (§8.6) |
| 10 | Cutover order | **BigBoard → IC → Dispatch → Unit → Responder** (§11.2) |
| 11 | Offline call creation | **Allowed** (§8.5) |
| 12 | OTA | **`expo-updates`** from the first release (D18) |
| 13 | Responder Electron + web | **Ship as part of Omni** |
| 14 | Version numbers | **Derived from GitHub Actions run numbers** (D13, Appendix B) |
| 15 | Core worktree branches | **Ignored** — Omni relies on Core `develop` (D16) |
| 16 | Sentry | **Each app reports to its own Sentry project**, in Omni too (manifest `sentryProject`) |
| 17 | Offline base maps | **Protomaps** (MapLibre plan D13) |
| 18 | Offline map area | Departments define a **maximum response area**, enforced by the download size a mobile user would accept; fallback **40 km radius** around the map centre, else the department address, else a station address (MapLibre plan §19.3) |

Still open (technical, answered by spikes or device tests, not by the owner): S1–S7 results; push channel/category behaviour on devices; BigBoard and Dispatch store listings' current marketing versions (both apps had pre-React-Native versions — confirm in App Store Connect / Play Console before the first Omni upload, Appendix B).

## 16. Appendices

### A. Route inventory per variant (today; canonicalized in Omni)

- **Responder** (drawer; landscape permanent sidebar): `/home` (nested tabs: home, personnel, units, calls) · map · calendar · shifts · messages · chat, chatbot · contacts · notes · protocols · records · checklists · operations · certifications · work-orders · weather-alerts · settings · poi/[id] · account-security · approve-sign-in · call/[id], edit, new · chat/[channelId], thread · records/[id], new, connectors, deployments · login (form, sso, sso-section, recovery) · sso-return · onboarding.
- **Unit** (tabs: map, calls, routes, contacts, notes, weather-alerts, protocols, settings; landscape status sidebar): checklists · operations · records · inventory (index, count/[id]) · account-security · chat, chatbot · routes stack (index, start, active, directions, poi, stop, stop/contact, history/[planId], history/instance/[id]) · maps stack (index, search, custom/[id], indoor/[id]) · call/* · chat/* · records/* · weather-alert/[id] · login (form, sso, recovery, shared-device) · sso-return · onboarding.
- **IC** (tabs: map, calls, command, incidents; side drawer): weather-alerts · maps (index, search, custom, indoor) · settings · chat, chatbot · poi/[id] · operations · records · contacts · incident/[id] · command-map/[callId] · command-log/[callId] · resource-map · settings/account-security · settings/offline-queue · call/* · chat/* · records/* · weather-alert/[id] · login (form, sso, recovery, shared-device) · sso-return · onboarding.
- **Dispatch** (drawer native; 280 px toggle panel web): home (console) · calls · pending-calls · scheduled-calls · archived-calls · awaiting-resources · incident-command · map · personnel · units · pois · contacts · protocols · records · operations · chat, chatbot · weather-alerts (index, settings) · settings · account-security · notes (from console) · call/[id], edit, command, tactical-map, new, new/archived · personnel/[id] · units/[id] · poi/[id] · weather-alerts/[id] · chat/* · records/* · lockscreen · maintenance · login (form, sso, recovery, shared-device) · sso-return · onboarding.
- **BigBoard** (drawer): home (dashboard) · settings · configure · calls · contacts · map · notes · personnel · protocols · units · weather-alerts · weather-alert-detail · call/[id], edit, new · login (form, sso) · maintenance · onboarding.

### B. Per-variant identity and build values

| | Responder | Unit | IC | Dispatch | BigBoard |
|---|---|---|---|---|---|
| Slug | resgrid-responder | resgrid-unit | resgrid-ic | resgrid-dispatch | resgrid-bigboard |
| EAS project | 026d4a74-f01d-41db-ae57-67f8c65a5f79 | 6beb03e6-f639-4f35-bef7-5cfb5f173218 | b29e7235-267a-494d-8b59-466701ada204 | a46a953a-2a9e-4545-b28d-87e5838db146 | c775a10a-3bd5-499b-b0cb-79333e6ab8fe |
| iOS bundle | com.wavetech.Resgrid | com.resgrid.unit | com.resgrid.command | com.resgrid.dispatch | com.resgrid.bigboard |
| Android package | wtdt.resgrid.andriod | com.resgrid.unit | com.resgrid.command | com.resgrid.dispatch | com.resgrid.bigboard |
| Schemes | ResgridRespond, resgrid | ResgridUnit | ResgridIC | ResgridDispatch, resgriddispatch | ResgridBigBoard (host `auth`, `/callback`) |
| Passkey domains | responder(.eu-central).resgrid.com | unit… | ic… | dispatch… | — (add) |
| MMKV id | ResgridResponder | ResgridUnit | ResgridIC | ResgridDispatch (+ auth-storage, security-storage) | ResgridUnit (+ auth-storage, security-storage, default instances) |
| Env prefix (legacy) | RESPOND_ | UNIT_ | IC_ | DISPATCH_ | BIGBOARD_ |
| Version / versionCode today (GitHub Actions) | 10.N / 5080345+N | 7.N / "7"+N | 1.N / "1"+N | 1.N / N | 1.N / N |
| Latest release run (master, 2026-10-31) | 312 → 10.312 / 5080657 | 652 → 7.652 / 7652 | 185 → 1.185 / 1185 | 229 → 1.229 / 229 | 134 → 1.134 / 134 (repo also has a `v3.0.0` tag from the Ionic era) |
| **Omni version** (`M` = Omni `release.yml` run number) | **11.M** | **8.M** | **2.M** | **2.M** | **4.M** (clears any Ionic-era 3.x) |
| **Omni versionCode / iOS buildNumber** | **5100000 + M** | **100000 + M** | **100000 + M** | **100000 + M** | **100000 + M** |
| Why the bases are safe | legacy reaches 5100000 only at N = 19655 | legacy `"7"+N` passes 100000 only at N ≥ 10000 | legacy `"1"+N` passes 100000 only at N ≥ 10000 | legacy N < 100000 | legacy N < 100000 |
| Docker image | (new) resgridllc/responder | resgridllc/unit | resgridllc/ic | resgridllc/dispatch | resgridllc/bigboard |
| Electron appId / protocol | (new) | com.resgrid.unit / resgridunit | com.resgrid.command / resgridic | com.resgrid.dispatch / resgriddispatch | com.resgrid.bigboard / — |
| Keyboard mode (Android) | resize | resize | resize | resize | pan → resize |
| Notification colour | #2a7dd5 | #2a7dd5 | #2484c4 | #2a7dd5 | #2a7dd5 |
| Background location | yes | yes | no (foreground) | no (remove) | no (remove) |

MMKV encryption keys are not reproduced here; they move from source into per-variant build secrets.

### C. Evidence

Survey outputs (scratchpad of the planning session, 2026-10-31): `findings-build.md`, `findings-core.md`, `findings-realtime.md`, `findings-ui.md`, `findings-data.md`, `findings-history.md`, `findings-skills.md`; raw data `files.txt` (per-file hash groups across the five `src/` trees), `deps.txt`, `i18n-conflicts.tsv`, `data/ep_matrix.txt` (≈420 endpoints × apps), `dup-out.txt` and `leader-out.txt` (cross-repo commit twins). Re-run the hash comparison before each phase; the legacy repos are still moving.

### D. Renames

`satuses` → `statuses`; `weatherAlerts`/`weather-alerts` → `weather-alerts`; `callVideoFeeds`/`call-video-feeds`/`calls/video-feed-store` → `call-video-feeds`; `checkIn`/`check-in-timers`/`calls/check-in-store` → `check-in-timers` (components: `check-in`); `incidentCommand`/`command`/`calls/incidentCommand` → `incident-command`; `poi`/`pois` → `pois`; `maps` + `mapping/map-store` → `mapping/custom-maps-store` + `mapping/map-data-store`; `novu/inbox` → `inbox`; `scheduledCalls` → into `calls`; `workOrders` → `work-orders`; `[...messing]` → `[...missing]`; `getMayLayers()` → `getMapLayers()` (route unchanged); personnel `getUnitsFilterOptions` → `getPersonnelFilterOptions`; route `GetCurrentStatffing` → `GetCurrentStaffing` (alias exists in Core).
