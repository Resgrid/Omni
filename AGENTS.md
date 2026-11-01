# Resgrid Omni — Agent Guide

Canonical instructions for every coding agent in this repository (Claude Code reads it through `CLAUDE.md`; Codex, OpenCode, Cursor and others read it directly). Keep it short and true; detail lives in `docs/` and `.claude/skills/`.

## What this repo is

Resgrid Omni is **one Expo (prebuild/CNG) React Native codebase that builds the five Resgrid client apps** — Responder, Unit, IC, Dispatch, BigBoard — each for **iOS, Android, web (Docker) and Electron (Windows, macOS, Linux)**. It replaces five forked repos (`../Responder`, `../Unit`, `../IC`, `../Dispatch`, `../BigBoard`) whose common code drifted.

- **Status (2026-11-01): Phases 0–4 code complete (all five apps' modules, routes and tests); device verification, store releases and the open items are tracked in `docs/implementation-status.md`. Owner decisions are recorded in plan §15.** The plan is `docs/architecture/omni-plan.md`. Read the relevant section before building anything; when code and plan disagree, the code wins and the plan gets updated in the same change.
- Related plans (in `../int-Coordination/docs/architecture`): `maplibre-mapping-routing-navigation-plan.md` (maps, offline maps, Unit navigation), `offline-first-architecture.md`, `mobile-feature-exposure.md` (which app gets which module), `identifier-allocation-registry.md` (server ids, settings, migrations).

## Stack

Expo SDK 58 · React Native 0.88 (New Architecture, Hermes) · React 19.3 · TypeScript (strict) · expo-router 58 · zustand + react-native-mmkv · axios · gluestack-ui v5 + NativeWind 5 RC + Tailwind 4 (CSS config) · lucide-react-native · react-hook-form + zod · i18next (10 languages) · @microsoft/signalr · Novu + expo-notifications + notifee · LiveKit · MapLibre (`@maplibre/maplibre-react-native`, `maplibre-gl`) · Sentry · Countly · Jest 29 + jest-expo + @testing-library/react-native · Electron 40 · pnpm workspaces.

## Layout (target — see plan §5.1)

```
apps/omni/                 the one Expo project; variants/<v>/{variant.json, variant.ts, app/, assets/, theme.css}
apps/desktop/              Electron shell (packages each variant's web export)
packages/<name>/           @resgrid/{config,core,models,api,offline,auth,data,realtime,notifications,
                           location,voice,maps,navigation,i18n,ui,app-shell,features,config-plugins}
tooling/                   eslint-config, tsconfig, jest-preset
docs/                      architecture/, build/, subsystems/
```

**Layering (enforced by dependency-cruiser):** `config, models` → `core, i18n` → `api, offline` → `auth, realtime, notifications, location, voice, maps` → `data` → `ui` (depends only on core/i18n/config) → `features, navigation` → `app-shell` → `apps/*`. Import only downward. `api` never imports stores or UI (auth/token is injected). Stores in `data` never import components, routes, hooks, features, i18n or React Native UI APIs (`Alert`, `Linking`).

## How the five apps differ

Never fork code per app. In order of preference: **capability** (`useCapability()` from the variant manifest) → **form factor** (`useFormFactor()`) → **platform file at a leaf** (`.web.tsx` only for renderers/platform APIs) → **variant-only screen** (only each app's home and signature modules). Per-app facts live only in `apps/omni/variants/<v>/variant.json` (read at build time by `@resgrid/config-plugins` and at runtime through `variant.ts`, validated by the zod schema in `@resgrid/config`). Use the `omni-variants` skill for any change that applies to some apps but not others.

**Never change without a migration and an upgrade test:** bundle ids/packages (Responder's `wtdt.resgrid.andriod` typo is permanent), EAS project ids, URL and SSO schemes, associated domains, App Group, **MMKV ids/keys and persisted store names**, Electron appIds/protocols, Docker image names, legacy runtime env names, Novu subscriber formats, push `Source`, client ids.

## Conventions

- TypeScript strict; no `any`; `import type` for types; `@resgrid/*` package imports (no deep relative paths across packages).
- Conditional rendering with ternaries, not `&&`.
- Files and folders kebab-case; components PascalCase; hooks `use-*.ts` exporting `useX`; stores `use-x-store` style hooks. v4 models mirror Core names (PascalCase fields) exactly.
- Every user-visible string through `t()`; all 10 language files in key parity (`resgrid-i18n` skill). Department-renameable words via `useTerm()`.
- UI from `@resgrid/ui` (gluestack primitives) and NativeWind classes; lucide icons used directly (named imports from `lucide-react-native` only — `apps/omni/babel/lucide-icon-imports.js` turns them into one module per icon). No React Native `Modal` (use `NativeModal`/overlay primitives). No new UI libraries without a plan change.
- Web/Electron-safe styling: merge style arrays with `StyleSheet.flatten()`, never pass `style` to lucide icons (wrap in a `View`), avoid `gap` in `StyleSheet` styles.
- Data: zustand stores → `@resgrid/api` endpoint functions → cached endpoints; persisted stores for anything needed offline. No React Query. Writes in an app's offline scope go through the outbox (`omni-offline-first` skill); local SQLite data always has a retention rule.
- Notifications use the modern sound set only (no classic sounds, no toggle).
- Dates: UTC on the wire; parse `*Utc` fields with the shared parser (some arrive without "Z"); department-local only for display/wall-clock input.
- Status logic by **BaseType**, never by status id or text.
- Never call map/routing/geocoding providers from the app; go through the Resgrid server (`resgrid-maps` skill).
- Prettier: single quotes, es5 trailing commas, printWidth 220. ESLint must pass with zero warnings in touched files.
- No experimental or beta platform features (owner decision, SDK 58 upgrade): no `experiments.*` in the app config, no `EXPO_UNSTABLE_*` flags, no `unstable_*`/`experimental_*` APIs or options. Sole exception: EAS `extra.eas.build.experimental.ios.appExtensions`, the only way EAS gives the Live Activity widget its credentials. NativeWind stays on the 5.0 RC until 5.0 ships.

## Security and privacy

- Never log or send to Sentry/analytics: passwords, tokens, login responses, usernames, protected (ADP) values. Sanitize errors.
- Server HTML only through `HtmlRenderer` + `sanitizeHtmlContent()`; `sanitize-html` stays pinned at exactly `2.17.0`. No `originWhitelist={['*']}`, no iframe `allow-same-origin` for server HTML.
- Log out only when the token endpoint rejects a refresh (400/401); never on network errors or 5xx.
- Server URLs: https only (http only to localhost in development).
- Gate UI on the rights DTO, module access endpoints and feature flags (unknown flags = disabled). Details: `resgrid-auth-security` skill.

## Testing

- Every module ships with Jest tests; CI runs Jest, type-check, lint, translation parity, dependency rules, API contract tests and per-variant route contract tests on every PR.
- `jest.mock()` factories may only reference variables prefixed `mock`. Mocks of the auth store need `getState()`. Keep route files (`variants/*/app/**`) free of tests and logic — test the screens in `@resgrid/features`.
- After dependency bumps, suspect stale `node_modules`/Metro cache first.
- Variant-affecting changes: review the `expo config` snapshot diff for every variant.

## Resgrid essentials (details in skills)

- Core v4 API: `/api/v4/{Controller}/{Action}`, PascalCase JSON, envelope with string `Status` — **`not_found` comes back as HTTP 200**. All server changes are additive (old store builds stay in the field). Wire typos stay (`GetMayLayers`, `GetAllCallPriorites`, `ImgagesCount`). → `resgrid-v4-api`
- SignalR events are id-only pings: refetch bypassing caches; re-invoke hub `Connect` methods after every reconnect. Push codes: first letter drives priority — anything starting with `C` is a critical call alert. → `resgrid-realtime-push`
- Domain vocabulary (departments, units, statuses, calls, incident command, records, shifts…) → `resgrid-domain`.
- `router.push` before the root layout mounts is silently dropped — use `routerPushWithRetry`. Android keyboard mode stays `resize`; chat composers use `BottomAnchoredKeyboardView`.

## Skills (`.claude/skills/`, mirrored to `.agents/skills/` by `node scripts/sync-agent-skills.mjs`)

Resgrid/Omni: `omni-variants`, `omni-offline-first`, `omni-porting-from-legacy`, `omni-platform-builds`, `resgrid-domain`, `resgrid-v4-api`, `resgrid-realtime-push`, `resgrid-auth-security`, `resgrid-i18n`, `resgrid-maps`.
Third-party (vetted; provenance in each `SOURCE.md`): `expo-upgrade`, `eas-app-stores`, `eas-update`, `expo-router`, `expo-module`, `expo-animation`, `react-native-best-practices`, `react-native-testing`, `nativewind-preview-to-rc`.

Precedence when guidance conflicts: this file and the Omni/Resgrid skills win over third-party skills. Specifically — UI is gluestack + NativeWind (not `@expo/ui` or native-UI-first advice); networking is axios + zustand stores (ignore "avoid axios"); upgrades use `expo-upgrade` (CNG — there are no committed native folders); expo-router guidance written for iOS must also work on web and Electron; never publish an EAS update or submit to a store without the owner asking.

## Working in this repo

- **Source control:** agents may commit to local branches (message `RO-Txxx Summary`; leave the ticket number out if none was given). **Never push** — the owner reviews every change before it is pushed. Never rewrite or revert commits or files you did not make.
- Several agent sessions may run at once in the same checkout: touch only the files your task needs.
- Legacy repos are frozen to critical fixes once Omni Phase 1 starts; a critical fix in a legacy repo is mirrored in Omni the same day (`omni-porting-from-legacy` skill).
- Server work belongs in `../Core` (agents never commit there either) and is coordinated through `../int-Coordination` plans and the identifier registry.
- Prefer generic, configurable behaviour over customer-specific code.
