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

## Configuration

- `oxlint` and `@oxlint/plugins` pinned to the same exact version in the `pnpm-workspace.yaml` catalog (1.90.0); upgrade them together.
- Oxlint's JS plugin API is documented upstream as alpha. Run with `pnpm lint:anti-slop`; it is not part of `pnpm lint`, `check-all`, CI or the git hooks.
- `.oxlintrc.json` turns off Oxlint's default `correctness` category (ESLint stays the primary linter) and enables `oxc/no-accumulating-spread` plus every generic anti-slop rule at `error`, except `no-module-mocking`.
- `no-module-mocking` is off by owner decision (2026-11-02): `jest.mock()` is the repo's documented test seam (`AGENTS.md`, "Testing"). Keep it off on updates unless the owner reverses this.

## Findings at install (2026-11-02)

16,416 diagnostics in 1,580 of 2,576 files with every rule on; nothing was fixed. `require-readable-spacing` accounts for 11,849 of them (autofixable). Turning off `no-module-mocking` removed its 289. `packages/api/src/index.ts` could not be read because it holds a Windows-1252 byte (not UTF-8).

## Updating

Follow `.claude/skills/install-anti-slop/references/update.md`: stage the incoming bundle outside this folder, three-way merge against the base above, keep the deviations listed here, and update this file.
