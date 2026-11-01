---
name: omni-offline-first
description: Offline-first and durable operations in Resgrid Omni — durable storage, the outbox (idempotent queued writes), shift-start hydration, reconnect sync, conflict rules, per-variant offline scope, RMS and protected-data limits, and offline map packs. Use when adding any write action, persisting a store, reading data that must work without network, touching @resgrid/offline, the pending-sync screen, sync endpoints, or anything that runs on reconnect.
---

# Offline-first in Omni

Every Omni app works offline: it reads its shift working set from durable storage and queues writes that replay exactly once on reconnect. Design: `../int-Coordination/docs/architecture/offline-first-architecture.md`; Omni specifics: `docs/architecture/omni-plan.md` §8. Status: target design (2026-10-31).

## Rules for any new feature

1. **Reads:** persisted store first → stale cache → typed empty default. Never throw because the network is down. Persist only durable server data + sync metadata (`partialize`), never loading flags.
2. **Writes go through the outbox**, not straight to the API, if the action is in the variant's offline scope. Register a handler:
   ```ts
   registerOutboxHandler({
     type: 'status.set',
     send: (e) => api.statuses.saveUnitStatus(e.payload, { idempotencyKey: e.id }),
     optimisticApply: (e) => useUnitStatusStore.getState().applyLocal(e.payload),
     rollback: (e) => useUnitStatusStore.getState().revertLocal(e.id),
     classify: (err) => (err.status && err.status < 500 ? 'permanent' : 'retry'),
   });
   ```
3. **Idempotency:** the event `id` (client UUID) is the idempotency key sent to the server; creates send a client GUID. Never generate ids that change on retry.
4. **Ordering:** use `dependsOn` for real dependencies (e.g. close call only after close command) and `coalesceKey` for newest-wins streams (location fixes).
5. **Scope:** every queued event and stored record carries server + department + user (+ unit). Never replay one user's or server's events as another; hold them (7 days) and show them.
6. **Wipe:** logout, department switch and server switch wipe the working set and queue for that scope (preserved: device prefs like language, theme, server URL). Register stores with the reset registry.
7. **Show state:** pending items appear in the Pending sync screen (retry/discard), the shell shows an offline banner and "N changes waiting". Never silently drop a failed write.

## Never queue silently

RMS legal transitions (submit for review, approve, finalize/attest, amend, void, external submit) and writes that carry protected (ADP) values need a **fresh online authorization and user confirmation** after reconnect (`requiresOnlineAuth`). An offline attempt stays a visible pending item. Protected values in local storage are encrypted, scoped, excluded from analytics/support bundles, and purged on grant expiry, lock, logout or context change.

## Durable storage (`@resgrid/offline`)

- KV: MMKV with the variant's frozen id/key (never change them — upgrade would sign users out).
- Queues and large collections: SQLite (`expo-sqlite`, owner decision); web/Electron use the platform adapter (SQLite OPFS or IndexedDB; Electron filesystem). Do not put the outbox in localStorage.
- Blobs: attachments staging, offline map packs (registry in SQLite, files in the app sandbox, excluded from backups).

## Local data must not grow forever (plan §8.2a)

- **Every new table declares a retention rule** next to its schema (age window, row cap, or "until acknowledged"). A table without one fails review.
- The maintenance job applies retention at start-up (after first render), on foreground after 24 h and after each sync; then `PRAGMA incremental_vacuum` (`auto_vacuum=INCREMENTAL`), `PRAGMA optimize`, WAL checkpoint. A per-variant budget prunes oldest cached data first — **never unsent writes**.
- Defaults: sent outbox items deleted on acknowledgement; failed/dead items 14 days, max 200; other users'/servers' items 7 days; attachment orphans 24 h; incident working sets removed after the call closes and its outbox drains.
- Migrations are forward-only; on failure preserve the queue, then rebuild caches from the server.
- **Settings → Advanced → Storage & sync** (all variants): sizes (database, caches, attachments, map packs, free space), the list of queued/failed/stuck items with Retry, Retry all and Discard (confirmed), last sync, "Sync now", **Clear cached data** (keeps session and unsent changes) and **Clear all local data** (warns with the unsent count, wipes and signs out). Diagnostics show counts and sizes only.

## Offline call creation (owner decision)

Variants with `calls.create` can create calls offline: saved locally with a client GUID, shown as **"Queued — not dispatched yet"** (no call number, nobody paged), sent on reconnect via `SaveCall` with the GUID as idempotency key, then replaced by the server call; rejections stay in Pending sync for correction; possible duplicates at the same location are flagged after sync. No geocoding offline — take coordinates from the map, a POI/contact or free text.

## Hydration and reconnect

- Shift-start hydration = the variant's init steps (reference data `/Sync/Reference`, working set — IC `/Sync/Bundle`, others composed until Core adds scoped bundles —, map packs). The app is "field ready" when required steps are current.
- Reconnect order: refresh auth/grants → pull deltas (`/Sync/Changes` where available, else re-fetch the working set) → reconcile → drain outbox → resume SignalR.
- Conflicts: per entity class (offline-first §8.1). Server `ModifiedOn` wins for singletons; additive intents (notes, check-ins, telemetry) merge.

## Per-variant scope (summary)

- Responder: own status/staffing, location (person), self check-in, call notes/images, messages, checklists, work-order reports, RMS drafts.
- Unit: unit status, location (unit), check-in, call notes/images/files, route stop check-in/out, inventory counts, time reports/expenses, RMS drafts; map packs incl. route corridors.
- IC: full command board (26 event types), status/location, RMS drafts; incident map packs.
- Dispatch: notes, on-behalf status, check-in updates, RMS drafts, queued new calls.
- BigBoard: read-only durable dashboard with stale indicators; never logs out on network loss.

## Offline maps

Owned by the MapLibre plan §19: server-built Protomaps PMTiles packs covering the department's maximum response area (never Mapbox tiles), custom map raster packs, a DepartmentData bundle (layers, geofences, POIs, hydrants, indoor metadata) and a department sprite, refreshed by manifest version. See the `resgrid-maps` skill.

Offline sessions rely on long-lived refresh tokens: each variant sends its own OAuth `client_id`, listed in Core's `TrustedLongLivedClientIds` (otherwise refresh tokens last 2 days).

## Tests

For each handler: queued while offline, survives app kill, replays once, permanent vs retry classification, rollback, scope isolation (other user/server never replayed), wipe on logout.
