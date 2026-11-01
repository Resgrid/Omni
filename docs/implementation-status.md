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
| `@resgrid/auth` | ⬜ | |
| `@resgrid/realtime` | ⬜ | |
| `@resgrid/notifications` | ⬜ | |
| `@resgrid/location` | ⬜ | |
| `@resgrid/voice` | ⬜ | |

## UI acceptance tests

| Item | Status | Notes |
|---|---|---|
| Playwright web boot tests per variant | ✅ | `pnpm e2e:web`; BigBoard 3/3 locally |
| Playwright Electron smoke | ✅ | 1/1 against the BigBoard Windows build |
| Maestro native flows per variant | 🟡 | written, dry-run only; run nightly on Android emulator |

## Phases 2–6

⬜ Not started — see plan §11.1.
