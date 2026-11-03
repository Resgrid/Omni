# Source

- Upstream: https://github.com/dmmulroy/anti-slop/tree/d2a9aea3b896ffcb291a85f2c1301aa2543ad8c8/skills/install-anti-slop
- Commit: `d2a9aea3b896ffcb291a85f2c1301aa2543ad8c8`
- Licence: MIT (see `LICENSE` in this folder, copied from the upstream repository root).
- Installed into Resgrid Omni on 2026-11-02 after review (relevance, version fit, safety). First installed with `npx skills` into `.agents/skills` (`skills-lock.json`), then moved here so `node scripts/sync-agent-skills.mjs` keeps it.
- Local changes: none. `assets/anti-slop` is the pristine base for the vendored copy in `tooling/oxlint/anti-slop` (its `UPSTREAM.md` records Omni's deviations and configuration).

To update: re-copy from upstream, re-apply the changes above, and re-review. Omni-specific precedence rules live in the root `AGENTS.md` ("Skills").
