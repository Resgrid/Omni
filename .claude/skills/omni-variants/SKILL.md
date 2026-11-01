---
name: omni-variants
description: How Resgrid Omni builds five apps (Responder, Unit, IC, Dispatch, BigBoard) from one Expo project — variant manifests, capabilities, per-variant routes, native modules, permissions and identity that must never change. Use when adding or changing a feature that only some apps get, touching app.config.ts, eas.json, variant.ts, expo-router route trees, permissions, bundle ids, schemes, MMKV ids, or deciding where app-specific code goes.
---

# Omni variants and capabilities

Status: target design from `docs/architecture/omni-plan.md` (v1.1, 2026-10-31) §4–§6; owner decisions in §15 (one Expo project, pnpm, no React Query, OTA from the first release, each variant reports to its own Sentry project). Where code exists, the code wins; update this skill when it diverges.

## The model

- **One Expo project:** `apps/omni`. `APP_VARIANT` (`responder|unit|ic|dispatch|bigboard`) × `APP_ENV` (`development|internal|staging|production`) select what is built.
- **Variant manifest:** `apps/omni/variants/<v>/variant.ts` is the only place per-app facts live: identity, storage identity, auth/push identity, capabilities, native modules and permissions, navigation shell, offline scope, versioning. `app.config.ts`, env, `apps/desktop`, Docker and the CI matrix read it. Never hand-copy a per-app value anywhere else.
- **Route tree per variant:** `apps/omni/variants/<v>/app/` (expo-router `root`). Route files are one-line re-exports of shared screens:
  ```ts
  export { default } from '@resgrid/features/calls/screens/call-detail';
  ```
- **Electron:** `apps/desktop` packages `dist/<variant>` from the web export. No RN code lives there.

## Where app-specific behaviour goes (in this order)

1. **Capability** — `useCapability('calls.create')` in UI, `getCapability()` in services and `app.config.ts`. Examples: `calls.create: none|quick|full`, `status.subject: personnel|unit`, `incidentCommand: view|assist|command`, `voicePtt`, `callKeep`, `backgroundLocation`, `locationTransmission: person|unit|none`, `pushSubject: user|unit|icUser|none`, `sharedDevice`, `personalLock`, `neverLogoutOnTransientError`, `hubWatchdog`, `weatherAlerts.admin`, `navigation.inApp`, `offline.scope`.
2. **Form factor** — `useFormFactor()` → `phone | tablet | desktop | wall` (+ `isLandscapeBoard`, `isElectron`).
3. **Platform file at a leaf** — `.web.tsx` / `.native.tsx` only for renderers and platform APIs (map renderer, HtmlRenderer, DOM primitives, passkey, web push). Never fork a whole screen per platform.
4. **Variant-only screen** — only each app's home and its signature modules (`features/dashboard`, `dispatch-console`, `runcards`, `call-queues`, `unit-status`, `unit-routes`, `inventory`, `incident-command` (command tier), `member-home`, `calendar`, `shifts`, `messages`, `work-orders`, `certifications`).

Department feature flags (`Chat.System`, `Records.Field.*`, `Checklists.System`, `Maintenance.WorkOrders`, `Dispatch.RunCards*`, `Navigation.InApp`, `Maps.Offline`) gate at runtime **on top of** capabilities, via the feature-flag store. Unknown flags are disabled.

## Adding a feature to some apps

1. Build it in the right package (`@resgrid/features/<domain>` for screens; data in `@resgrid/data`; never in a variant folder).
2. Add or reuse a capability; set it in each variant's manifest.
3. Add route files only in the variants that expose it; register nav entries (placement, flag, terminology key, icon) in the variant's `shell.nav`. Tabs are generated from the registry — an unregistered `(app)` route fails CI.
4. Link with `useHref()` builders. A link to a route the variant lacks must be hidden, not broken. The per-variant route contract test enforces this.
5. If it needs a native module or permission: add it to `native.modules` / `native.permissions` for those variants only (iOS purpose strings and Android permissions come only from that variant's config plugins). Check App Store purpose strings and Play declarations.

## Identity that must never change (store continuity)

Bundle ids / packages (Responder is `com.wavetech.Resgrid` / `wtdt.resgrid.andriod` — the typo is permanent), EAS project ids, URL schemes, SSO return schemes, passkey associated domains, Responder's App Group, **MMKV instance ids and encryption keys and persisted store names**, Electron appIds/protocols, BigBoard's Electron loopback origin, Docker image names, legacy runtime env names (`RESPOND_`, `UNIT_`, `IC_`, `DISPATCH_`, `BIGBOARD_`), Novu subscriber id formats, push `Source`, client ids. Changing any of these signs users out, breaks deep links or orphans store listings. If a change is unavoidable, it needs a migration and an upgrade test (legacy store build → Omni build) before merge.

## Canonical routes

`/call/[id]`, `/call/[id]/edit`, `/call/new`, `/weather-alerts/[id]`, `/poi/[id]`, `/chat/[channelId]`, `/records/*`, `/settings/account-security`, `/maps/*`, `[...missing]`. Do not reintroduce `/weather-alert/[id]`, `/weather-alert-detail` or `[...messing]`.

## Building a variant locally

```bash
APP_VARIANT=unit APP_ENV=development npx expo start --clear
APP_VARIANT=dispatch npx expo export -p web --output-dir dist/dispatch
APP_VARIANT=ic npx eas-cli build --profile ic-production --platform android --local
```

Always set `APP_VARIANT` for EAS CLI commands too — it resolves the EAS project from the manifest. Use `--clear` (or the per-variant Metro cache) when switching variants: the route root and `EXPO_PUBLIC_*` values are inlined at transform time.

## Checklist before merging variant-affecting changes

- `expo config` snapshot per variant × env reviewed (bundle id, permissions, plugins unchanged unless intended).
- Route contract and nav registry tests pass for every variant.
- Native module/permission changes verified for each affected variant on iOS and Android.
