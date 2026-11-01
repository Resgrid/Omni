---
name: resgrid-auth-security
description: Authentication, session, permission gating and protected data in Resgrid Omni — sign-in with MFA/SSO/passkeys, token refresh and when to log out, shared-device sessions and the personal lock, storage of tokens and secrets, rights DTO and access endpoints for gating UI, department feature flags, Advanced Data Protection (protected grants, REDACTED sentinel, concealment), logging/PII rules, HTML sanitization and server URL safety. Use when touching login, logout, tokens, MFA, SSO, passkeys, session locking, permission checks, feature flags, protected fields, logging of user data, WebViews/HTML rendering or server URL settings.
---

# Auth, gating and protected data

Omni baselines: `docs/architecture/omni-plan.md` §7.3; API details in the `resgrid-v4-api` skill.

## Session

- Sign-in: password grant with `mfa_flow=transaction`; MFA via transaction completion; SSO via brokered PKCE (`Sso/Begin`/`Sso/Redeem`) with the variant's return scheme; passkeys via `react-native-passkey` with the variant's associated domains. Every variant gets MFA and passkeys (BigBoard included).
- Refresh engine (one, in `@resgrid/auth`): proactive refresh before expiry, backoff 5 s → 60 s, discard results that arrive after the session changed, single-flight. **Log out only when the token endpoint rejects the refresh with 400/401.** Network errors and 5xx keep the user signed in (an unattended BigBoard must never go dark on a server blip).
- Restore on cold start from the token's `exp` with clock skew; persist only whitelisted session fields; logout is single-flight and clears state first, then runs the reset registry (device preferences — language, theme, server URL, device UUID, navigation app, BigBoard layouts — survive).
- After sign-in navigate with `replace` (Android back must not return to login).
- Server URL: https only (http only to localhost in dev); sign out **before** switching servers so push unregistration reaches the old server.
- Shared-device sessions (Unit, IC, Dispatch): `X-Resgrid-Shared-Installation`; 401 `shared_session_locked` → lock screen, `shared_session_expired` → sign out; never refresh on these. Personal inactivity lock (Dispatch capability): persisted lock state, off for shared devices and SSO users.
- App access: IC requires `CanLoginToCommandApp`, Dispatch `CanLoginToDispatchApp` — enforced in ShellGate.

## Storage of secrets

- Tokens and session live in the variant's encrypted MMKV store (frozen id/key per variant — changing it signs everyone out). Plan: re-key once into a SecureStore-generated key; legacy keys come from build secrets, never source.
- No secrets in `EXPO_PUBLIC_*` beyond public client config.

## Gating UI

- Gate on the **rights DTO** (`IsAdmin`, `CanViewPII`, `CanCreateCalls`, `CanAddNote`, `CanCreateMessage`, group admin flags…) and **per-module access endpoints** (`Inventory/GetAccess`, `ChecklistRuns/GetChecklistAccess`, `Readiness/GetAccess`, `IncidentRoles/GetMyCapabilities`, deployment `TimeAccess`). Never infer access from raw permissions or roles; the server decides.
- Department feature flags: the shared persisted feature-flag store (`isEnabled`, `useFeatureFlag`); unknown flags are **disabled**; fetched after rights. Do not invent new gating mechanisms. With `Chat.System` off every chat endpoint 404s — hide entries, redirect chat routes home, skip the chat hub.
- Variant capabilities decide what an app can do at all; flags and rights decide what this department/user may do now.
- `CanViewPII` false hides personnel on maps and PII fields.

## Advanced Data Protection (ADP)

- Protected values are withheld unless the client holds a grant: send `X-Resgrid-Protected-Grant`; withheld fields come back listed in `RedactedFields` with the literal sentinel **`"REDACTED"`** (never translate or display it raw — render a shield/"protected" label).
- Problem types: `step_up_required`, `grant_expired`, `upgrade_required`, `protected_access_denied` → step-up flow (MFA/passkey/approval) or conceal.
- On grant expiry, background/lock, logout, department switch or policy change: conceal values and purge plaintext working state. Protected values never go to analytics, logs, Sentry or support bundles; offline copies are encrypted and scoped, and protected writes need fresh authorization after reconnect.
- BigBoard never holds a grant; the server sends it a safe shell.

## Logging and telemetry

- Never log passwords, tokens, login responses, usernames or protected values. Sanitize before console and Sentry (logger in `@resgrid/core`); send sanitized errors, never raw axios errors with request bodies.
- Sentry per variant project; user-facing "not enabled" errors are not exceptions.

## Rendering untrusted content

- Server HTML (call notes, protocols, messages) renders only through `@resgrid/ui` `HtmlRenderer`, after `sanitizeHtmlContent()` (`sanitize-html` pinned to exactly **2.17.0** — later versions pull ESM-only htmlparser2 that breaks Jest/Hermes). Web uses an iframe **without** `allow-same-origin`; links limited to http/https/mailto. No `originWhitelist={['*']}`.
- Deep-link/push ids pass `isSafeRouteId` before routing.
