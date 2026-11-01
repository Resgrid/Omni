---
name: resgrid-v4-api
description: Resgrid Core v4 REST API conventions for Omni — base URL and routes, PascalCase JSON, the response envelope and Status strings (not_found is HTTP 200), error and problem types, token endpoint grants and MFA/SSO errors, refresh lifetimes, required headers, UTC vs department-local time, the app bootstrap sequence, controllers by domain, route typos that must stay, and backward-compatibility rules. Use when adding or calling an endpoint, writing a model, handling API errors, parsing dates, or changing anything that talks to Core.
---

# Resgrid v4 API

Verify against Core before coding: controllers `../Core/Web/Resgrid.Web.Services/Controllers/v4`, models `../Core/Web/Resgrid.Web.Services/Models/v4`, Swagger `/swagger/v4/swagger.json` (QA: `https://qaapi.resgrid.dev`). Omni's contract tests compare every endpoint function against Swagger.

## Shape

- Base: `{BASE_API_URL}/api/v4/{Controller}/{Action}`; newer actions use path params (`/GetPoi/{poiId}`, `/GetCommandBoard/{callId}`). Mapping detail routes take ids **in the path**.
- JSON is **PascalCase** both ways; models in `@resgrid/models` mirror Core names exactly.
- Envelope: `{ PageSize, Page, Timestamp, Version, Node, Environment, RequestId, Status, PreviousPageUrl, NextPageUrl, Data }`. `Status` ∈ `success | failure | not_found | created | updated | deleted | queued`.
- **"Not found" is usually HTTP 200 with `Status: "not_found"`** — always check `Status`, not just the HTTP code.
- Errors: 400 (incl. automatic model validation), 401, 403, 404, 423 `department_locked`, problem `type`s (`records_module_disabled`, `unit_alert_note_required`, ADP `step_up_required | grant_expired | upgrade_required | protected_access_denied`). A 401 with a problem `type` or a `shared_session_locked|expired` body must **not** trigger a token refresh (locked → lock screen; expired → sign out).
- "Not enabled for your department" style errors are user-facing (toast), not Sentry noise.
- Writes complete server-side even if the client disconnects — design retries to be idempotent.

## Headers the client sends

`Authorization: Bearer …`, `X-Resgrid-Client` (variant), `X-Resgrid-Device-*`, `X-Resgrid-App-Version`, `X-Resgrid-Shared-Installation` (shared devices), `X-Resgrid-Protected-Grant` (when holding an ADP grant). Never send `X-Resgrid-ApiKey` from an app (integration keys; key + bearer = 403). Every axios instance has a timeout (15 s).

## Authentication

- `POST /api/v4/connect/token` (form-urlencoded). Grants: `password`, `refresh_token`, `urn:resgrid:params:oauth:grant-type:mfa_completion`, `urn:resgrid:params:oauth:grant-type:external_token`.
- Password grant today: `scope=openid profile offline_access mobile`, `mfa_flow=transaction`, **no `client_id`**. The `mobile` scope has no effect.
- Lifetimes: access token 1440 min. Refresh token is 365 days only when `client_id` is in `TrustedLongLivedClientIds`; otherwise `NonMobileRefreshTokenExpiryDays` (default **2**). Owner decision: Omni sends a per-variant `client_id` on password and refresh grants, and Core config lists the five ids (omni-plan §8.6) — required for multi-day offline use. Old builds without `client_id` keep the short lifetime.
- Errors: `invalid_grant`, `mfa_required`, `invalid_totp`, `mfa_enrollment_required`; with the transaction flow the error carries `mfa_transaction`, `mfa_methods`, `mfa_enrolled`, `mfa_preferred`, `mfa_expires_in` (or `mfa_setup_transaction`). Finish via `Authentication/Complete*` then the `mfa_completion` grant (`transaction`, `completion_code`). `login_error` + `lockout_minutes_remaining` are additive (may be absent on older servers — fall back to classifying `invalid_grant`).
- SSO: discovery `connect/sso-config?departmentToken|departmentCode`, `connect/sso-config-for-user?username&departmentId`; brokered PKCE `Sso/Begin` → `AuthorizeUrl` → return to `<scheme>://sso-return` → `Sso/Redeem` → `CompletionCode`. Return schemes per variant come from the manifest.
- Log out only when the token endpoint rejects the refresh (400/401). Network errors and 5xx keep the session and retry with backoff. Never log the login response, username or tokens.

## Time

- Instants are UTC on the wire; department-local time is for display and wall-clock input only.
- Many results carry a zone-less local field plus a `*Utc` field (`LoggedOn` / `LoggedOnUtc`). **`LoggedOnUtc` is temporarily sent without "Z"** — parse both forms with the shared UTC parser (`parseApiUtcDate`).
- Inputs: status writes send `Timestamp` + `TimestampUtc` (server accepts −7 days … +5 min); scheduled calls `DispatchOnUtc`; deployment entries `StartLocal`/`EndLocal`; calendar dates are never shifted.

## Bootstrap (signed-in init)

1. `Config/GetConfig?key=<APP_KEY>` (BigBoard: `GetDepartmentConfig`) — map config, `EventingUrl`, location thresholds, Novu ids, web push, `StatusHoldToConfirm`, sounds, run-card fields.
2. `Security/GetCurrentUsersRights` — department, Novu hashes, `IsAdmin`, `CanViewPII`, `CanCreateCalls`, `CanAddNote`, `CanCreateMessage`, app login rights, `Groups[]`.
3. `FeatureToggles/GetAll` (ETag/304) — after rights, keyed by department.
4. `DataProtection/Capabilities`. 5. `Config/GetTerminology`. 6. Working set (calls, units, statuses…), then SignalR hubs.
- Don't initialize while backgrounded; retry with backoff; guard with a generation counter so a late response from a previous session is discarded.
- Offline sync endpoints: `Sync/Reference`, `Sync/Bundle` (IC working set), `Sync/Changes?since=` (IC deltas).

## Controllers by domain (main ones)

Auth/session: Connect, Sso, Authentication, Mfa, MfaApproval, Passkeys, AccountSecurity, sessions (shared devices). Config/rights/flags: Config, Security, FeatureToggles, Sync, Health. Personnel: Personnel, PersonnelStatuses, PersonnelStaffing, PersonnelLocation, Statuses, CustomStatuses, Groups, Roles, Avatars. Units: Units, UnitStatus, UnitLocation, UnitRoles, UnitStatusAlerts, UnitTrackingDevices. Calls: Calls (GetActiveCalls, GetCall, GetCallExtraData, GetCallHistory, GetCallLocationHistory, GetCallSiteInfo, GetNewCallFieldPolicy, GetPendingCalls, SaveCall, EditCall, CloseCall, EscalateCall, DispatchCallNow, UpdateScheduledDispatchTime, DeleteCall), CallNotes, CallFiles, CallPriorities, CallTypes, CallProtocols, CallVideoFeeds, Dispatch (GetNewCallData, GetSetUnitStatusData, GetNearestUnits, templates), AwaitingResources, RunCards, Templates, Autofills, Geocoding, UserDefinedFields, Search. Accountability: CheckInTimers. Incident command: IncidentCommand, IncidentRoles (GetMyCapabilities), IncidentResources, IncidentVoice, Commands, IncidentReporting. Messaging: Chat, Chatbot, Messages, Inbox. Field: Contacts, ContactFiles, Shifts, Calendar, Notes, Forms, Checklists, ChecklistRuns, Inventory, WorkOrders, Deployments, TimeReports, Certifications, FieldRecords, Records. Mapping: Mapping, TypeIcons, Routes, WeatherAlerts. Devices, Voice (LiveKit default), DataProtection.

## Compatibility rules

- **All Core changes are additive.** Old store builds stay in the field for months (e.g. builds before 2026-08-27 cannot sign in MFA users). Never rename/remove fields, change `error` values, or change route names.
- **Wire typos are permanent:** `Mapping/GetMayLayers`, `CallPriorities/GetAllCallPriorites`, `ImgagesCount`; `PersonnelStaffing/GetCurrentStatffing` (alias `GetCurrentStaffing` exists). Wrap them with correctly named client functions.
- Some legacy app calls hit routes that do not exist (calendar/shift routes in Dispatch/BigBoard, `/Calls/UpdateCall`, `/Dispatch/GetSetUnitState`, `/Mapping/GetMapLayers`) — never copy those; see the `omni-porting-from-legacy` skill.
- Core is a separate repo whose agents never commit or push; server changes needed by Omni are planned in int-Coordination and made there, uncommitted, for the owner to review.
