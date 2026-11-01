---
name: resgrid-domain
description: Resgrid system and domain knowledge for Omni — what Core is, what each of the five apps is for and who uses it, and the domain vocabulary (departments, groups/stations, personnel, units, unit roles/crew, personnel status vs staffing vs unit status, custom status sets and BaseType, calls/priorities/types/states, dispatch lists, protocols, POIs, check-in timers/PAR, incident command, records, contacts, shifts, deployments, terminology). Use when implementing or reviewing any feature logic, naming things, or reasoning about statuses, calls, units or incident command.
---

# Resgrid domain

Sources (verify there before relying on a detail): Core at `../Core` (`CLAUDE.md`, `Core/Resgrid.Model`, v4 controllers in `Web/Resgrid.Web.Services/Controllers/v4`), architecture docs in `../int-Coordination/docs/architecture`, public docs in `../docs/docs/apps`. Collected 2026-10-31.

## System

- **Core** (.NET, SQL Server or PostgreSQL, Redis, RabbitMQ/Azure Service Bus): MVC web app (`Resgrid.Web`), v4 REST API (`Resgrid.Web.Services`), SignalR **Eventing** service (`/eventingHub`, `/geolocationHub`, `/chatHub`), workers, TTS, protected-data broker, GPS tracker gateway. Server-side caches are long (Redis, 1 day typical) — a server change may not appear immediately.
- **Push:** self-hosted Novu only (FCM, APNs, web FCM). **Relay:** tone/scanner and email-to-call gateway.
- **QA:** `qaapi.resgrid.dev` (Swagger `/swagger/v4/swagger.json`), `qaapp`, `qadispatch`, `qaunit`, `qabigboard`, `qaevents`. The apps' default API URL is QA. qaapi CORS does not allow localhost.

## The five apps

| App | Who / what | Form factor |
|---|---|---|
| Responder | Individual member: own status and staffing, calls, messages, chat, PTT, shifts, checklists, records, work orders, certifications, approving other apps' sign-ins | Phone |
| Unit | Shared device on one apparatus: user signs in, then selects the **Active Unit**; unit status, crew seats, active call, AVL, PTT, routes, inventory, chat as the unit | Vehicle tablet / MDT; map is home |
| IC | Incident commander: command board, accountability/PAR, timers, command chat; offline-first | Tablet landscape, desktop |
| Dispatch | Dispatcher CAD console: new/edit/close/pending/scheduled/archived calls, run cards, unit and personnel actions | Desktop/web, Electron |
| BigBoard | Unattended wall display: widget grid (personnel, units with status timers, unit alerts, calls, map, weather) | TV / monitor |

App login gates: `CanLoginToDispatchApp`, `CanLoginToCommandApp` in rights (permissions 29/30, default allow). The app identifies itself with `X-Resgrid-Client` (`responder|unit|dispatch|bigboard|command|ic|…`) → server claim `client_app`; the server changes behaviour per app (e.g. BigBoard gets a redacted "safe shell" for protected departments).

## Vocabulary

- **Department** — the tenant (token claim), with time zone and a **department code** (push subscriber prefix). Departments can be **linked** for mutual aid.
- **Group / Station** — sub-organization, optional geofence; group admins in `Groups[].IsGroupAdmin`.
- **Personnel** — members; hidden/disabled members excluded from personnel lists. **Personnel roles** are dispatchable roles (icon, sort order).
- **Unit** — apparatus or team; has a **unit type** (may carry a custom status set and an icon) and **unit roles** (crew seats). `UnitActiveRoles` = current crew. Units are soft-deleted.
- **Personnel status** (`ActionTypes`): StandingBy 0, NotResponding 1, Responding 2, OnScene 3, AvailableStation 4, RespondingToStation 5, RespondingToScene 6, OnUnit 7.
- **Staffing** (`UserStateTypes`): Available 0, Delayed 1, Unavailable 2, Committed 3, OnShift 4 (base types add OffDuty 5, OnCall 6).
- **Unit status** (`UnitStateTypes`): Available 0, Delayed 1, Unavailable 2, Committed 3, OutOfService 4, Responding 5, OnScene 6, Staging 7, Returning 8, Cancelled 9, Released 10, Manual 11, Enroute 12.
- **Custom status sets** (`CustomStateTypes`: Personnel 1, Unit 2, Staffing 3): options with note requirement, destination type (`CustomStateDetailTypes` stations/calls/POIs combinations), a **BaseType** meaning (`ActionBaseTypes`, -1…23) and NextIds (UI hint only).
  - **Always reason by BaseType, never by id or text.** "Is custom" = membership in the department's option ids (not `<= 25`). Options with BaseType -1 break release, auto-close and timers. Shared helper: `lib/base-types`.
  - A status links to a call only through `DestinationId`/`DestinationType`. Hold-to-confirm comes from config `StatusHoldToConfirm`.
- **Calls** — states (`CallStates`): Active 0, Closed 1, Cancelled 2, Unfounded 3, Founded 4, Minor 5, Transferred 6, FalseAlarm 7, **Pending 8** (excluded from every "active" read). Scheduled calls have a future `DispatchOn`. Priorities: Low 0, Medium 1, High 2, Emergency 3, or department-defined priorities (color, tone, BaseType 0–3) that replace them. Call types are department lists (class, icon).
  - **Dispatch list**: personnel, groups, roles, units. A blank list means "page everyone" (not for pending calls). Pickers from `Dispatch/GetNewCallData`. Honor the **New Call field policy** (`Calls/GetNewCallFieldPolicy`) and resend hidden field values on edit.
  - Call files: DispatchAudio 1, Image 2, File 3, Video 4. Protocols per call. **An active incident command blocks closing the call.**
- **Check-in timers / PAR** — target types Personnel 0, UnitType 1, IC 2, PAR 3, HazmatExposure 4, SectorRotation 5, Rehab 6; `PerformCheckIn` takes an idempotency key.
- **Incident command** — one active command per call; nodes (Division, Group, Branch, Sector, StrikeTeam, TaskForce, Staging, UnifiedCommand), resources (real/linked-department/ad-hoc units and personnel), objectives, needs, timers, annotations, log; incident roles 0–30; command definitions are department ICS templates. Tiers in Omni: view (Responder/Unit), assist (Dispatch), command (IC).
- **Run cards / awaiting resources** — Dispatch recommendations and outstanding requirements (flags `Dispatch.RunCards`, `Dispatch.RunCardConditions`).
- **POIs** — typed points of interest; some are destinations (hospitals etc., optional capabilities).
- **Records (RMS / Field Records)** — flags `Records.System`, `Records.Field.{Responder,Unit,IncidentCommand,Dispatch}`; record numbers are allocated server-side.
- **Shifts** — Assigned (0; users may call these "Static"), Signup (1), and Workshifts (unit crews for a period; Core web calls them "Static Shifts"; `StaffedShiftTypes.Workshift = 2`). Trades with approver setting 121.
- **Deployments** — crew/individual time reports and expenses (`Operations.Deployments`); entries use department-local `StartLocal`/`EndLocal`.
- **Messaging** — Messages = legacy inbox (also weather alerts); Chat = realtime channels (`Chat.System`; `ChatChannelType` 0–12, 12 = IncidentCommanderLine addressed to the command role); Notifications = Novu inbox.
- **Terminology** (setting 118) — departments rename modules and record types; apps show `useTerm(TermKeys.X)`; API data values never change.

## Product rules

- Prefer generic, configurable features over customer-specific ones.
- Never trust posted primary keys; the server checks department ownership — so must new endpoints.
- Dev safety: on the shared dev department, send test dispatches only to the designated test role; never page a whole department.
