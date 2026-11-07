# Badge counts

Counts beside menu entries, on tabs and on the Responder home's number cards, in every app that shows them. One request, `Counts/GetBadgeCounts?include=<keys>`, answers all of them; the Novu inbox count joins them on the device.

| Key              | Count                                                                                | Where it shows                                                  |
| ---------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `calls`          | Active calls the member can see (the rows the call list shows)                       | Calls (menu/tab), Responder home Calls tab, "active calls" card |
| `callsImOn`      | Active calls dispatched to the member, their group, a role they hold or a unit seat  | Responder home "calls I'm on" card                              |
| `checkIns`       | Check-in timers in warning or overdue on the calls the member can see                | Responder home "missed check-ins" card                          |
| `messages`       | Unread inbox messages                                                                | Messages (Responder)                                            |
| `chats`          | Unread chat messages across every channel (the active unit's too in Unit)            | Chat; Unit's Chat shortcut                                      |
| `weather`        | Active, unexpired Extreme + Severe alerts (breakdown: `extreme`, `severe`)           | Weather alerts; "severe weather" card                           |
| `certifications` | Own records expired or expiring within the department's reminder horizon (breakdown) | Certifications (Responder)                                      |
| `deployments`    | Open deployments the member is on the current roster of                              | Deployments (Responder, Unit, IC, Dispatch); Unit's shortcut    |
| `checklists`     | Scheduled checks the member (Unit: the active unit) can start now                    | Checklists (Responder, Unit); Unit's shortcut                   |
| `shifts`         | Today's shift days (department date) the member is on the roster of                  | Shifts, summed with `shiftTrades`                               |
| `shiftTrades`    | Trade requests awaiting the member's answer, plus their own still open (breakdown)   | Shifts, summed with `shifts`                                    |
| `workOrders`     | Open work orders assigned to the member or a role they hold                          | Work orders (Responder)                                         |
| `notifications`  | Unread Novu inbox items (device only)                                                | Notifications; the app bar bell                                 |

BigBoard shows none (its entries are hidden). A count the member cannot see (no permission, module switched off, feature flag off) is left out of the answer and shows no badge.

## Device (Omni)

- A nav entry declares its count in its feature's `nav.ts` (`badge: 'calls'`, or several keys shown as their sum: `badge: ['shifts', 'shiftTrades']`); `featureNav` copies it onto `NavEntry.badge`, and a variant can override it. `packages/app-shell/src/__tests__/nav-badges.test.ts` keeps every app's counted entries carrying theirs.
- `useBadgeCountsStore` (`@resgrid/data`) holds the counts, persisted so the menu has numbers at launch, and asks only for the keys something on screen needs: `ShellBadgeCounts` requests the visible entries' keys once the session bootstrap is done (the drawer unmounts its rows when closed), and `useBadgeCount` / `useServerCount` / `requestBadgeCounts` add a tab bar's or a card's own. Keys the server does not know are ignored both ways, so app and server can add counts independently. An older Core without the endpoint (404) shows no badges, and the Responder home cards count from the persisted lists as before.
- Refreshes go through `refreshBadgeCountsSoon`, which collapses a burst into one request: realtime pings (calls, weather, checklists, chat, hub rejoins; department-wide ones add up to 2 s of jitter so a department does not ask in the same instant), the app returning to the foreground, a 5-minute poll in the foreground, a rise in the Novu unread count, and local writes (chat read marks, opening or deleting a message, shift signups and trades, checklist submits, certification and work-order changes). The Responder home refreshes on focus unless a request left in the last 15 s (`refreshBadgeCountsIfStale`).
- The Novu count is read once, by `InboxUnreadCountBridge` in the shell's inbox provider, into the same store; the bell and the Notifications entry both read it.
- `CountBadge` (`@resgrid/ui`) draws the pill (99+ past 99); the control it sits in carries the count in its accessibility label (`shell.nav_item_with_count`).

## Core

- `IBadgeCountProvider` (`Resgrid.Model.Services`): a key (`BadgeCountKeys`), the v4 policy that protects the list it counts, and `GetCountAsync(BadgeCountContext)`. Providers in `Core/Resgrid.Services/BadgeCounts/` are found by assembly scanning (`ServicesModule.RegisterBadgeCountProviders`), so **a new count is one class**: no controller, interface or registration change. `BadgeCountsServiceTests` checks every provider's key is unique and its policy is a real `ResgridResources` name.
- `BadgeCountsService` runs the asked-for providers one at a time (they share the request's connection), skips those whose policy the member lacks (`CountsController` checks it against the principal), and leaves out one that fails or does not apply. The context loads the department's module switches and local date once per request; `ModuleBadgeCountProvider` applies the module switch and feature flag the dashboard applies to the same module.
- Every count is a COUNT, never the list: `IBadgeCountsRepository` (certifications, deployments, checklists, shifts, trades), `ICallsService` (calls, calls I'm on), `IMessageService`, `IChatChannelService` (the channel list's own reads with each channel's sequence read fresh), `IWorkOrderCountRepository` (the work-order list's assignment scope), `IWeatherAlertService`. Department-wide counts are cached 60 s on a department calls version that `CallsService` rolls on every save, delete and reopen, or dropped by `WeatherAlertService` on every change; check-in counts keep 30 s (they move with the clock). M0312 adds the indexes the counts seek on (message recipients, weather alerts, shift days, signups and trades).
- Known gaps: the checklists count does not repeat the due list's per-target view checks (a unit or person the member may not view), and the shifts count leaves out a night shift from yesterday still running.

## App start

- `startup.i18n` starts loading the device language while storage opens; `startup.preferences` waits for the language storage asks for, at most `LANGUAGE_LOAD_BUDGET_MS` (4 s), then shows English until the strings land.
- Push setup is its own optional step (`startup.push`, 10 s): a failure leaves the app usable without notifications instead of failing startup.
- The session bootstrap starts the working set and chains the outbox drain and shift-start hydration after it in the background, so the hubs connect and push arms at once; screens read the persisted stores meanwhile.
