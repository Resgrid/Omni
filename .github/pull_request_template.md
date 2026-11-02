## Summary

<!-- What changes and why. Link the issue: "Fixes #123". Commit messages: RO-Txxx Summary. -->

## Apps affected

<!-- Tick every app whose behaviour, build or store package changes. -->

- [ ] Responder
- [ ] Unit
- [ ] IC
- [ ] Dispatch
- [ ] BigBoard
- [ ] None (tooling, CI or docs only)

## Platforms affected

- [ ] iOS
- [ ] Android
- [ ] Web (hosted and Docker)
- [ ] Desktop (Electron: Windows, macOS, Linux)

## How it was tested

<!-- Jest suites, devices or simulators, browsers. Say what was not tested. -->

## Checklist

- [ ] Tests added or updated; `pnpm lint`, `pnpm type-check` and `pnpm test` pass.
- [ ] New or changed text goes through `t()` in all ten languages (`pnpm i18n:check`).
- [ ] App-specific behaviour uses capabilities or form factor, not a copy per app (see [AGENTS.md](../AGENTS.md)).
- [ ] For changes to some apps but not others: the `expo config` snapshot diff was reviewed for every variant.
- [ ] No bundle id, scheme, MMKV id, persisted store name or other app identity changed without a migration and an upgrade test.
- [ ] No passwords, tokens, personal or call details in code, logs, screenshots or this description.
