---
name: omni-shared-first
description: Keeping every fix, addition, update and removal uniform across the five Resgrid Omni apps (Responder, Unit, IC, Dispatch, BigBoard) — which shared layer owns each kind of change, the only things allowed to differ per app (UX built around that app's job), fixing the root pattern instead of one screen, finding every app and sibling screen a change touches, translation overrides, and the guard tests. Use for every bug fix or behaviour change, above all one reported or noticed in a single app, and before finishing any change in packages/ or apps/omni.
---

# Shared first: one fix, every app

Omni replaced five forked repos because the same code drifted apart in each. The same drift happens inside one repo when a
fix lands in one screen, one app's route, one app's translations or one component while its twins keep the bug. The rule:

**A bug fixed or a behaviour added in one app is fixed or added for all five, in the lowest shared layer that owns it.**
"Shared" is the default for everything. Something is per-app only when it is part of the experience that app is built
around, and even then it is chosen by the manifest (capabilities, `nav.ts`, `shell.homeRoute`), not by forking logic.

## What may differ per app, and what never does

| May differ (the app's UX) | Never differs (shared, always) |
| --- | --- |
| Which modules an app has (`variant.json` modules, capabilities, route files, `nav.ts` entries) | Logic: status flow, dispatch matching, validation, formatting, permissions checks |
| The home and each app's signature-module screens (omni-variants skill lists them): Responder centres on the member, Unit on the unit and its crew, IC on command, Dispatch on the desk, BigBoard on the wall display | Storage, persisted stores, MMKV/secure storage, offline outbox and sync |
| Layout by form factor (`useFormFactor()`), e.g. Unit's landscape sidebar | API calls, models, error handling, retries, logout rules |
| Content keyed by app: onboarding slides, product name via `{{appName}}` | Device and platform behaviour: location, audio, push, notifications, keyboard, files, camera, background work |
| Wording an app deliberately says differently, listed with its reason in `packages/i18n/review/variant-overrides.json` | Primitives' look and behaviour: lists, scrollers, sheets, headers, empty states, buttons, inputs |

If a difference is not in the left column, it is a bug in waiting. A behaviour that really must differ gets a capability
in the manifest (`useCapability()` / `getCapability()`), never `variant.id === '…'` in shared code.

## Where a change goes

| Kind of change | Owner |
| --- | --- |
| How a primitive looks or behaves (scrolling, list anchoring, sheet height, back button, empty state) | `@resgrid/ui` — the primitive itself, not each screen using it |
| Server call, envelope, error mapping | `@resgrid/api` endpoint + `@resgrid/data` store (`resgrid-v4-api` skill) |
| State that survives a restart or works offline | `@resgrid/data` persisted store / `@resgrid/offline` (`omni-offline-first` skill) |
| Device / OS behaviour | `@resgrid/core`, `location`, `notifications`, `voice`, `maps`; a `.native.ts`/`.web.ts` file only at the leaf |
| Business rules of a module | `@resgrid/features/<module>/lib` (pure functions, unit-tested), used by every screen of that module |
| A screen or component | `@resgrid/features/<module>` — the same screen serves every app that routes to it |
| Wiring every app needs (registrations, providers, sounds, init steps) | `apps/omni/shell-registrations.tsx`, `feature-providers.tsx`, other `apps/omni/*.ts` — or a `configureAppShell` option set identically by all five root layouts |
| A per-app fact (identity, modules, capabilities, permissions, home route) | `apps/omni/variants/<v>/variant.json` only |
| A string | `common` namespace + the feature's `i18n.en.json` (`resgrid-i18n` skill) |

`apps/omni/variants/<v>/` holds only the manifest, `variant.ts`, `nav.ts`, assets and one-line route re-exports. No logic,
no styling, no app-only fix.

## Fix the pattern, not the instance

1. State the root cause in one sentence about code, not about the screen where it showed ("a horizontal `ScrollView`
   grows to fill its column", not "the POI chips are too tall").
2. Search for the same shape everywhere: `grep -rn` across `packages/` and `apps/omni/` (and the variant folders).
3. If the cause is a primitive's default or a shared helper, fix it there and delete the per-screen workarounds. If the
   same logic is repeated in several modules, extract one helper into the lowest package all of them may import.
4. Add a guard so it cannot come back: a unit test on the primitive, and, when the bad shape can be typed again, a
   source-rule test (see `packages/ui/src/scroll-view/__tests__/scroll-view.test.tsx`, `features/*/__tests__/source-rules.test.ts`).
5. If it truly is local (one screen's own data or layout), say so in the summary and why the siblings are not affected.

Done right in this codebase:
- `@resgrid/ui` `FlatList` turns FlashList's `maintainVisibleContentPosition` off by default: every filtered list in
  every app starts at the top again.
- `@resgrid/ui` `ScrollView` keeps a horizontal scroller to its content height. It had been patched one screen at a time
  in eight files while nine other horizontal scrollers were not; the primitive now owns it and a source rule rejects a
  horizontal React Native `ScrollView` anywhere else.
- `ScreenHeader` drops its own back arrow when the app bar shows one (`AppBarBackContext` from the shell): one change,
  every detail screen in every app.
- `ZeroState` fills the space its column has left (`w-full flex-1`), not a full screen height that ran past the bottom
  under a header or search field. Seven list screens had overridden it one at a time; the default now covers all 110 uses.

Done wrong: copies of shared strings in app namespaces. The shared check-in card, protocol picker and time-report labels
use their strings one way; Responder, Dispatch and IC kept older copies worded another way and showed "Last check-in:
5 {{count}} min ago", "12/30 Duration", "selected" with no count and "Report #DTR-…" until the copies were removed.
The reverse happened too: the shared "Unit Assignment" title (wrong for a person in Responder) and "before a call can be
created" (shown when editing, in every app) were only right in one app's copy, so that wording became the shared one.

## Find every app and sibling a change touches

- Apps that route a module: `grep -rl "@resgrid/features/<module>" apps/omni/variants/*/app`. Modules reached from
  other screens (status, staffing, check-in, chat, records, incident command tabs) are in every app that has those screens.
- Sibling implementations of one job — when a bug shows in one, check the others in the same change:
  - Status: Responder's home status buttons (`member-home/components/home-status-buttons.tsx`), Unit's status buttons and
    sidebar (`unit-status/components/status-buttons.tsx`), Dispatch's console sheets and the staffing buttons
    (`staffing/components/staffing-buttons.tsx`) all open the one `StatusPicker` (`features/status`); fix the picker or
    `status/lib`, not a caller.
  - Homes: Responder `/home` (`member-home`), Unit and IC `/map` (+ Unit's `unit-status` sidebar), Dispatch's console,
    BigBoard's dashboard. A fix to a card, badge or action on one home usually belongs in the shared component they all
    render (current status badge, active call, check-in, weather and call cards).
  - Lists with search, filter chips and an empty state (calls, personnel, units, contacts, POIs, notes, weather alerts,
    checklists, work orders, operations, archived calls): one list's layout bug is usually in all of them.
- A test for shared behaviour belongs to the shared code (`@resgrid/features`, `@resgrid/ui`, …), never to a route file.

## Translations

- Any string a shared screen shows lives in `common` (and the feature's `i18n.en.json`), in all ten languages.
- An app namespace holds only strings for that app's own signature screens, plus deliberate overrides listed with a
  reason in `packages/i18n/review/variant-overrides.json`. `translations.test.ts` fails on any other key an app namespace
  shares with `common`, on a listed key that is a plain copy, and on an override whose `{{placeholders}}` differ from
  the shared string's.
- Changing a shared string: change it in `common`; then look the key up in `variant-overrides.json`. An app that overrides
  it still shows its own wording — update or remove that override in the same change.
- The legacy apps' differing wording was unified into `common` (2026-11-02); two deliberate overrides remain. Keep it
  that way: a new override needs a UX reason, not a preference for other words — change the shared string instead.

## Variant folders stay identical

`apps/omni/__tests__/variant-uniformity.test.ts` fails when a file several apps have (route re-exports, `_layout.tsx`,
`variant.ts`, `login/*`…) differs between apps by more than the app id; only `nav.ts` and the home route are per app. To
pass a new option to the shell, change all five root layouts the same way, or better, register it from
`shell-registrations.tsx` so the layouts do not change at all.

## Before you finish

- [ ] The change is in a package or the shared `apps/omni/*` wiring; a variant folder changed only in route files,
      `nav.ts` or `variant.json`.
- [ ] Searched for the same pattern; fixed the primitive or helper, or fixed every copy and said why there is no primitive.
- [ ] Checked every app that routes the module and the sibling screens above; behaviour differences come from
      capabilities, form factor or department flags, never from the variant id.
- [ ] Strings in `common`; no new keys in an app namespace that `common` also has.
- [ ] Guard test added when the bug was a pattern; `pnpm check-all` passes (the full run CI makes; it includes `pnpm lint:anti-slop`:
      no new anti-slop finding, and the baseline pruned when findings were removed).
- [ ] The summary names the apps the change affects ("all five", or which and why).
