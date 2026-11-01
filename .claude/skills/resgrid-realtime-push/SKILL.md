---
name: resgrid-realtime-push
description: Resgrid realtime and push for Omni — SignalR hubs (eventingHub, geolocationHub, chatHub), hub methods and events, reconnect and token rules, cache-bypassing refetch on events, push via Novu (subscriber ids per app, device registration), push event codes and first-letter routing, Android channels and iOS categories, notification tap deep links and cold start, per-app chat push routing. Use when touching SignalR, live updates, push registration or handling, notification channels/sounds, the inbox, or deep links from notifications.
---

# Realtime and push

Server sources: `../Core/Web/Resgrid.Web.Eventing` (hubs, `Worker.cs`), `../Core/Core/Resgrid.Services/PushService.cs`, `ChatNotificationService.cs`, `../Core/Providers/Resgrid.Providers.Messaging/NovuProvider.cs`. Omni baselines: `docs/architecture/omni-plan.md` §7.5–7.6.

## SignalR

- Hubs live on the **Eventing** service: `{Config.EventingUrl}/eventingHub`, `/geolocationHub`, `/chatHub`. All close when the access token expires (`CloseOnAuthenticationExpiration`) — reconnect with a fresh token.
- Token: `accessTokenFactory` must read the **current** token at call time (a connect-time token replays expired credentials on auto-reconnect).
- Client → server: Eventing `Connect(departmentId)` (must match the token), `SubscribeToCall(callId)`/`UnsubscribeToCall`, `SubscribeToDepartmentLink`; Geolocation `GeolocationConnect()`, `UnitLocationConnect(unitId)`, `PersonLocationConnect(userId)` (location writes are REST, not hub); Chat `Connect`, `JoinChannel(id, asUnitId?)`, `LeaveChannel`, `Typing`, `MarkRead`, `MarkDelivered`, `Heartbeat`, `SetActiveChannel(id, asUnitId?)`.
- Server → client: `personnelStatusUpdated`, `personnelStaffingUpdated`, `unitStatusUpdated`, `callsUpdated`, `callAdded`, `callClosed`, `incidentCommandUpdated`, `departmentUpdated`, `checklistUpdated`, `unitStatusAlertUpdated`, `unitActiveRolesUpdated` (unit id or "0"), `outstandingRequirementsUpdated(id, payload)` (two args); geolocation `onPersonnelLocationUpdated`, `onUnitLocationUpdated`; chat `chatMessageReceived|Edited|Deleted`, `chatReactionUpdated`, `chatReceiptUpdated`, `chatChannelUpdated|Provisioned`, `chatModerationApplied`, `chatMessageAckRequired`, `chatThreadUpdated`, `chatbotMessageReceived`, `chatbotTyping`, `chatAccessRevoked`, `chatTyping`, `chatPresenceChanged`.
- **Weather alerts:** as of 2026-10-31 no Core code emits `weatherAlertReceived/Updated/Expired` (alerts arrive only as `M` inbox messages). Owner decision: Omni needs realtime weather alerts, so Core will publish those three id-only events on `/eventingHub` (omni-plan §8.6). Subscribe to them, refetch on receipt, and keep the inbox path working for servers that don't emit them yet.
- **Events are id-only pings: refetch, and the refetch must bypass caches** (single-flight with a trailing re-run). Stale caches once showed old unit status for 15 minutes.
- **After every reconnect re-invoke** `Connect(departmentId)`, `GeolocationConnect()`, chat `Connect` and `SetActiveChannel`. Register listeners before `start()`. Forward all event arguments; wrap each listener so one failure doesn't stop the rest.
- Lifecycle: on web force the app state to "active" (react-native-web reports background when a tab is hidden, which would drop hubs on Electron/desktop); hubs that exhaust retries are retried when NetInfo reports the network back; always-on screens (BigBoard) run a hub watchdog.
- Chat push is suppressed only for a recipient who has that channel active — call `SetActiveChannel` on open and on close.

## Push (Novu)

- Subscriber ids: `{deptCode}_User_{userId}` (Responder, Dispatch, BigBoard), `{deptCode}_Unit_{unitId}` (Unit), `{deptCode}_IC_User_{userId}` (IC). Pass the HMAC hash to the inbox (`NovuSubscriberHash`, `GetUnitSubscriberHash`, `NovuICSubscriberHash`) — HMAC enforcement is coming.
- Tokens: native `expo-notifications` `getDevicePushTokenAsync` (+ notifee for channels/display); web Firebase JS `getToken` with VAPID from config; Electron `@eneris/push-receiver`.
- Registration: `Devices/RegisterDevice { Platform 1 iOS | 2 Android | 3 Web, Token, UnitId, DeviceUuid, Prefix (dept code), Source }`; Unit uses `RegisterUnitDevice` and removes the old unit's registration when switching units; sign-out unregisters with the outgoing session's token **before** any server switch.
- Only the `data` object survives on Novu inbox items.

## Event codes

| Code | Meaning |
|---|---|
| `C{callId}` (no colon) | Call dispatch |
| `NC:{id}` | Call closed |
| `M{id}` | Inbox message (incl. weather alerts) |
| `N{id}` | Notification |
| `t:{channelId}` / `g:{channelId}` | Chat DM (incl. IncidentCommanderLine) / group channel |
| `CT:{token}` | Communication test |
| `NWO:{id}` | Work order |
| `NA:` | Sign-in approval (Responder) |

- The server maps the **first letter** to priority, iOS category, critical sound and web urgency (`c` calls, `m` messages, `n` notifications, `t`/`g` chats). **Any code starting with `C` is a critical call alert** — non-call codes must not start with C. New codes need an `EVENT_CODE_TYPES` entry and a leading letter old builds already handle safely.
- Client parsing: split on the first `:`, check whole-prefix codes (`nc`, `ct`, `nwo`, `na`), else the first character; accept legacy `C1234`. On iOS the code may be in `payload.body` or `aps`. Validate ids with `isSafeRouteId` (reject `/ \ ? #`).

## Taps and deep links

- Route through the variant's deep-link resolver and the route contract (`/call/[id]`, `/chat/[channelId]` — the assistant channel goes to `/chatbot`, messages, weather alerts, `/approve-sign-in`, `/work-orders/[id]`); hide or ignore targets the variant lacks.
- Navigate with `routerPushWithRetry` (waits for navigation readiness **and** signed-in state; 40 × 250 ms). `router.push` before the root layout mounts is silently dropped.
- Cold start: register listeners first, then `getLastNotificationResponseAsync()`; dedupe taps by request id.

## Channels and categories

- **Omni uses modern sounds only** (owner decision): no classic sound files, no modern/classic toggle.
- The server sends Android `channelId` = sound type (`calls`, `0`–`26`, `c1`–`c25`, plus `notif`, `message`) and iOS categories `calls`, `messages`, `notifications`, `chats`. The legacy apps created only `calls`, `0`–`3`, `notif`, `message`, `c1`–`c25` and the `calls` category. Omni creates **every** channel id the server can send, each with the modern sound for that type's meaning (so departments still on classic server settings also hear modern sounds), and registers all four iOS categories. A channel's sound can't change after creation — changing a sound means a new channel id strategy, coordinated with Core.

## Per-app chat routing (server)

Responder: every channel. IC: incident channels (Incident, IncidentLane, IncidentCommand, IncidentLeads, IncidentDispatch) + IncidentCommanderLine. Unit: its UnitDispatch line, incident channels it is in, DMs to the unit, IncidentCommanderLine. A new `ChatChannelType` must be added to the server's `ShouldNotify*` predicates.
