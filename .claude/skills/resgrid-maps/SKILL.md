---
name: resgrid-maps
description: Maps in Resgrid Omni — MapLibre only (@maplibre/maplibre-react-native native, maplibre-gl web/Electron) behind the @resgrid/maps wrapper, style resolution from server config, server-side routing/geocoding, attribution, department map data (custom maps, indoor maps, layers, POIs, hydrants, pins), offline PMTiles packs and Unit turn-by-turn. Use when touching any map screen, marker, layer, map style or token, geocoding, routing/directions, static map, custom or indoor map, or offline map packs.
---

# Maps

Governing plan: `../int-Coordination/docs/architecture/maplibre-mapping-routing-navigation-plan.md` (§8 apps, §9 navigation, §10.7 route stops, §11 traffic, §19 offline maps, §20 Omni, §23 Core status). Status 2026-11-01: Core side built on `develop`; Omni side built (`docs/implementation-status.md`).

## Rules

- **MapLibre only.** Import map components from `@resgrid/maps` (`MapView`, `Camera`, `ShapeSource`, `SymbolLayer`, `LineLayer`, `FillLayer`, `CircleLayer`, `RasterSource`, `ImageSource`, `MarkerView`, `Images`, `UserLocation`). Never import `@rnmapbox/maps`, `mapbox-gl` or `maplibre-gl` directly in features.
- **maplibre-gl loads with the first map** on web/Electron (`packages/maps/src/rg/maplibre-loader.web.ts`, its own chunk). Inside `@resgrid/maps` import its values only through the loader (`loadMapLibre`, `getLoadedMapLibre`) and its types with `import type`; setup that must reach it before the first map (worker URL, `pmtiles://` protocol) goes through `withMapLibre`.
- **Styles come from config** through `map-provider`: `MapLibreStyleUrlDay/Night` when the server provides them; against older servers derive a MapLibre style from `MapDayStyleUrl` + `AppMapboxAccessToken` client-side. Hide maps when there is no style (not "no token").
- **No provider calls from the app.** Geocoding (`/Geocoding/*`), routing (`/Routing/*`), static maps (`Mapping/GetStaticMap`) and styles all go through the Resgrid server. No Google/Mapbox/OSRM keys in the client.
- **Attribution on** in every map (OSM ODbL and Mapbox require it).
- **Pins:** symbol layers with the department sprite for many markers; `MarkerView` only for a selected/interactive marker (performance on Dispatch/BigBoard with hundreds of pins).
- **Restyle safety:** re-add live layers on style change (`styleRevision`).
- Server-hosted rasters and images (custom maps, indoor floors, style JSON) use **signed URLs** — native sources cannot send auth headers. Sign through `useSignedMapUrl(s)` (batched `Mapping/SignMapResourceUrls`, cached, re-signed before expiry); draw nothing until a URL is signed. Georeferenced custom maps use the layer's signed `MercatorTileUrl`; the legacy `GetCustomMapTile` pixel pyramid is never a map source (D21).
- **Routing and traffic capabilities** come from config through `useMapRouting()` / `useMapTraffic()`; older servers send none, so traffic, voice and in-app navigation stay hidden. The traffic overlay is `TrafficLayer` + `MapTrafficButton`; routes draw with `RouteLine`. Tile errors from app-added overlays (traffic, custom maps, routes) must never count toward the offline switch.

## Department map data

Custom maps (server raster tiles from `CustomMapTiles`, `Mapping/GetCustomMapTile/{layerId}/{z}/{x}/{y}`), indoor maps (floor images + zone GeoJSON), map layers/geofences (`GetMapLayerGeoJSON/{layerId}`; list route is the Core typo `GetMayLayers`), custom map regions, POIs and types, hydrants (Records prevention module, gated by flag and rights), unit-type and custom pin icons. Mapping v4 routes take ids **in the path** (`/{id}`), not query strings.

## Offline maps (§19)

- Base map offline = **server-built Protomaps PMTiles packs** (Protomaps v4 schema, cut from Resgrid's weekly mirror of the Protomaps planet build), read locally (`pmtiles://file://…`) and drawn with `@protomaps/basemaps` styles. Attribution "Protomaps © OpenStreetMap" on every offline map. Never build or bundle packs from Mapbox tiles — Mapbox terms forbid redistributing offline data. Never point clients at the public Protomaps build URLs.
- **Coverage = the department's maximum response area** (setting 123): admin-drawn polygons, refused on save when the exact download size at z15 exceeds `ResponseAreaMaxBytes` (default 500 MB, ceiling 1 GB); live estimate via `Mapping/EstimateResponseArea`. No area → 40 km radius around the department map centre, else the department address, else a station address (max zoom stepped down if that circle is too big). The area is covered by shared z10 cells; incident and route-corridor packs exist only for places outside the area.
- Department data offline = manifest items: custom map raster PMTiles, DepartmentData JSON bundle (layers, geofences, regions, indoor metadata + zones, POIs, hydrants, legend), department sprite, indoor floor images.
- Flow: `Mapping/GetOfflineManifest` → download manager (Range resume, SHA-256 verify, atomic swap, Wi-Fi-only by default) → pack registry in `@resgrid/offline` → style composer builds the offline style → `map-provider` switches online/offline automatically and shows an "Offline map" badge.
- Packs are scoped by server/department/user, excluded from backups and wiped on logout/department/server switch. No protected (ADP) data in packs.
- Per-variant defaults: every variant downloads the full response area (Responder may pick a lighter z13 option); Unit adds incident packs and route corridors outside the area; IC adds incident packs outside the area and nearby custom/indoor maps; Dispatch adds all custom maps; BigBoard limits to its displayed zoom range.

## Navigation (Unit)

Turn-by-turn lives in `@resgrid/navigation` (engine, session store, components) and the `/navigate` screen in `features/navigation`; gate it with `useInAppNavigationAvailable()` (capability `maps.navigationInApp` ∧ config `NavigationAvailable` — Valhalla/Mapbox only, D26 — ∧ flag `Navigation.InApp`). Routes only from the server: `Routing/GetCallRoute` (call), `Routing/GetRoute` (point), live `Routes/GetInstanceDirections` with `navigation=true` (a route's remaining stops, one leg per stop); the route object is OSRM v5 / Mapbox Directions JSON with polyline6 geometry. Snapping, off-route, voice and arrival are pure TS (tested with synthetic routes); `expo-speech` voice; reroute ≥ 10 s apart, ≤ 30 per session. A failed reroute keeps guiding on the last route. Live ETA reports go through the outbox (`navigation.progress`, newest per unit, dropped once stale); Dispatch/BigBoard show them through `features/navigation-eta`. Directions buttons go through the shell's `NavigationHandoff`: in-app when the crew's navigation app is "Resgrid (in-app)" (the default where offered), else their external app; `openExternal` always opens the external app. A call target carries `callId` only when its location is not withheld (ADP).

## Tests

Jest for `map-provider` (style resolution, fallback transform), offline downloader/registry/style composer, navigation engine with synthetic GPS traces. Device checks per variant surface list (plan §8.2).
