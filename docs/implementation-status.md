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
| Spike S6 — desktop shell packaging, signing, auto-update | 🟡 | `apps/desktop` |
| Spike S7 — durable web storage (SQLite OPFS vs IndexedDB) | ⬜ | |
| CI workflows (`ci.yml`, `release.yml`, `nightly.yml`, `ota.yml`) | 🟡 | |
| Docker image (nginx runtime, legacy env names) | 🟡 | |

## Phase 1 — platform core

| Package | Status | Baseline (plan §7) |
|---|---|---|
| `@resgrid/models` | 🟡 | union of v4 models, reconciled against Core |
| `@resgrid/api` | 🟡 | Dispatch client structure + Unit cached endpoints + contract tests |
| `@resgrid/core` | 🟡 | env, platform, logging, Sentry, analytics, utils |
| `@resgrid/i18n` | 🟡 | common + per-variant namespaces, 10 languages |
| `@resgrid/offline` | 🟡 | SQLite + MMKV durable storage, outbox, maintenance |
| `@resgrid/ui` | 🟡 | gluestack v5 primitives (Responder native, Unit web) |
| `@resgrid/auth` | ⬜ | |
| `@resgrid/realtime` | ⬜ | |
| `@resgrid/notifications` | ⬜ | |
| `@resgrid/location` | ⬜ | |
| `@resgrid/voice` | ⬜ | |

## Phases 2–6

⬜ Not started — see plan §11.1.
