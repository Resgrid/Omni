---
name: omni-porting-from-legacy
description: How to bring code from the five legacy Resgrid app repos (G:\Resgrid\Responder, Unit, IC, Dispatch, BigBoard) into Omni — which repo is the baseline for each module, how to diff the copies, which known bugs not to carry over, renames, and keeping legacy hotfixes in sync. Use when porting, merging or comparing any module from the legacy repos, or when a fix lands in a legacy repo during the migration.
---

# Porting from the legacy repos

The five apps are one scaffold forked four times (Unit → Responder, Unit → Dispatch → BigBoard, Unit → IC). Shared files land identical and then drift through per-repo fixes, so **never copy one repo blindly**: diff all copies, take the baseline, fold in the other repos' fixes. Baseline decisions: `docs/architecture/omni-plan.md` §7 (per module). Defects not to carry: §10.

## Procedure for one module

1. **Find every copy.** Paths differ (e.g. `weatherAlerts` vs `weather-alerts`, `checkIn` vs `check-in-timers`, `callVideoFeeds` vs `call-video-feeds`, flat `call/[id].tsx` vs `call/[id]/index.tsx`). Grep each repo for the symbol, not the path.
2. **Diff, ignoring line endings** — repos mix CRLF and LF, so plain diffs report whole files changed:
   ```bash
   diff -u --strip-trailing-cr ../Unit/src/lib/navigation.ts ../IC/src/lib/navigation.ts
   ```
3. **Start from the §7 baseline**, then merge the specific fixes listed there from the other apps. If §7 has no row, prefer the most recently fixed copy (check `git log -p --follow` in each repo) and record the decision in §7.
4. **Check against Core** before trusting any endpoint or model: Core v4 controllers in `../Core/Web/Resgrid.Web.Services/Controllers/v4`, result/input models beside them. Several legacy apps call routes that do not exist (see below).
5. **Bring the tests** from the baseline app(s); reconcile conflicting tests, don't drop them. Legacy Jest suites never ran in CI — expect some to fail on first run.
6. **Apply Omni rules while porting:** layering (api never imports stores; stores never import UI/i18n/RN UI APIs), capabilities instead of per-app forks, kebab-case `api/` and store folders, `@resgrid/*` imports, translations into `common` or the variant namespace.

## Known defects — do not port these

- Security: IC web HtmlRenderer `allow-same-origin` (use Unit's); Unit `background-geolocation.ts` opens `ResgridUnit` MMKV with key `'hunter2'`; `http://` server URLs accepted in production (R, I, B); raw axios errors to Sentry and raw usernames in logs (D, R); BigBoard renders server HTML without sanitizer; Responder production `usesCleartextTraffic`.
- API (verified against Core): D/B calendar routes `GetCalendarItems`, `GetCalendarItemTypes`, `GetCalendarItemsForDateRange`, `SetCalendarAttending` and `/Shifts/GetAllShifts` don't exist (use Responder's); BigBoard `/Calls/UpdateCall` (→ `EditCall`) and `/Dispatch/GetSetUnitState` (→ `GetSetUnitStatusData`); Responder `/Mapping/GetMapLayers` (Core route is `GetMayLayers`); Unit sends mapping ids as query params (Core uses path); `ToggleCallTimers` must use query params (only IC is right).
- Behaviour: token refresh that logs out on 5xx/any failure (use Dispatch's engine + 400/401-only rule); SignalR without forced "active" app state on web (hubs drop when the window is hidden); background location task defined in a route-loaded module (define it from `index.ts`); logout wiping language/theme; switching server before signing out; navigating after sign-in with `push`.

## Renames (wire typos stay)

`satuses`→`statuses`, `weatherAlerts`→`weather-alerts`, `callVideoFeeds`→`call-video-feeds`, `checkIn`→`check-in-timers`, `incidentCommand`/`command`→`incident-command`, `poi`→`pois`, `novu/inbox`→`inbox`, `workOrders`→`work-orders`, `[...messing]`→`[...missing]`, `getMayLayers()`→`getMapLayers()`. Keep Core route names exactly: `GetMayLayers`, `GetAllCallPriorites`, `ImgagesCount`.

## Storage identity

Each variant keeps its legacy MMKV id, encryption key and persisted store names (R `ResgridResponder`; U and B `ResgridUnit`; I `ResgridIC`; D `ResgridDispatch` plus `auth-storage`/`security-storage`). Port storage code through the variant manifest — never hardcode an id or key.

## While the legacy repos are frozen

A critical fix that lands in a legacy repo must land in Omni the same day (and vice versa for security fixes found in Omni that affect shipped apps). Note the legacy commit in the Omni PR description.

## Useful evidence

The planning survey's per-file hash groups (`files.txt`: which apps share each file's content) and endpoint matrix (`ep_matrix.txt`: ~420 routes × apps) were produced on 2026-10-31; re-run a fresh comparison before relying on them — the legacy repos still move.
