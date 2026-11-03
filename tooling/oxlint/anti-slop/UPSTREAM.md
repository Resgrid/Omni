# Anti-slop Oxlint plugin (vendored)

- Source: https://github.com/dmmulroy/anti-slop/tree/d2a9aea3b896ffcb291a85f2c1301aa2543ad8c8/skills/install-anti-slop/assets/anti-slop
- Commit: `d2a9aea3b896ffcb291a85f2c1301aa2543ad8c8` (the last upstream commit touching `skills/install-anti-slop`; every bundled file was byte-compared against it on 2026-11-02).
- Licence: MIT (`LICENSE` in this folder, copied from the upstream repository root). The vendored padding rule keeps its own `vendor/eslint-stylistic/LICENSE` and `UPSTREAM.md`.
- Installed into Resgrid Omni on 2026-11-02 with the `install-anti-slop` skill (`.claude/skills/install-anti-slop`, same commit). The skill's `assets/anti-slop` folder is the pristine base for future three-way merges.

## Installed paths

- Generic plugin: `tooling/oxlint/anti-slop/index.ts`, registered as `anti-slop` in the root `.oxlintrc.json`.
- Effect plugin: `tooling/oxlint/anti-slop/effect/index.ts`, copied but not registered (no package declares `effect`).

## Local deviations

- `package.json` (`"type": "module"`) added so Node loads the TypeScript sources as ES modules without the `MODULE_TYPELESS_PACKAGE_JSON` warning. Upstream has none.
- Upstream formatting is kept: this folder is excluded from ESLint and Prettier, and from Oxlint itself.
- Rule sources are unchanged.
- Upstream's rule tests (`rules/*.test.ts`, among them the `require-readable-spacing` tests that `vendor/eslint-stylistic/UPSTREAM.md` names) are not vendored, and that file's `pnpm check` and `pnpm sync:skill-assets` are upstream scripts Omni does not have. Both apply only to the upstream repository; it stays unedited. Omni's check is `pnpm lint:anti-slop` (see Configuration).

## Configuration

- `oxlint` and `@oxlint/plugins` pinned to the same exact version in the `pnpm-workspace.yaml` catalog (1.90.0); upgrade them together.
- Oxlint's JS plugin API is documented upstream as alpha. `pnpm lint:anti-slop` (`scripts/ci/anti-slop.mjs`) runs Oxlint and compares the findings per file and rule with `tooling/oxlint/anti-slop-baseline.json`: it fails when a file gains a finding, when the baseline lists findings that are gone (`--prune` lowers it, never raises it), or when Oxlint cannot read or parse a file. It runs in the pre-commit hook (`lefthook.yml`), `pnpm check-all`, CI (`ci.yml`, lint job) and as a Claude Code PostToolUse hook on the edited file (`.claude/settings.json`). It is not part of `pnpm lint`.
- `--rebaseline` rewrites the baseline from the current findings. Owner only: after enabling a rule or taking an upstream update that finds more, never to make a check pass. A baseline diff in a normal change only lowers or removes counts.
- `.oxlintrc.json` turns off Oxlint's default `correctness` category (ESLint stays the primary linter) and enables `oxc/no-accumulating-spread` plus every generic anti-slop rule at `error`, except `no-module-mocking`.
- `no-module-mocking` is off by owner decision (2026-11-02): `jest.mock()` is the repo's documented test seam (`AGENTS.md`, "Testing"). Keep it off on updates unless the owner reverses this.

## Findings at install (2026-11-02)

16,416 diagnostics in 1,580 of 2,576 files with every rule on; nothing was fixed. `require-readable-spacing` accounts for 11,849 of them (autofixable). Turning off `no-module-mocking` removed its 289. `packages/api/src/index.ts` could not be read because it held Windows-1252 bytes (not UTF-8); converted to UTF-8 when the baseline was created.

## Baseline (2026-11-02)

`tooling/oxlint/anti-slop-baseline.json` was created from the working tree with `--rebaseline`: 16,612 findings in 1,619 files. Findings are fixed as code is touched; the baseline only shrinks.

## Updating

Follow `.claude/skills/install-anti-slop/references/update.md`: stage the incoming bundle outside this folder, three-way merge against the base above, keep the deviations listed here, and update this file. Then run `pnpm lint:anti-slop`; when the update finds more, the owner decides between fixing those findings and `--rebaseline`.
