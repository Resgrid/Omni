import type { StyleSpecification } from '../types';

/**
 * Seams for offline map packs (MapLibre plan §19.5). Interfaces only in this phase: the download manager, the pack
 * registry on `@resgrid/offline` durable storage and the style composer arrive later. `MapProvider` already accepts an
 * `offline` option built from these types, so wiring them in later changes no map screen.
 */

/** Persisted values — never renumber (plan §19.2, identifier registry). */
export enum OfflineMapPackKind {
  Basemap = 0,
  IncidentDetail = 1,
  RouteCorridor = 2,
  CustomMapRaster = 3,
  DepartmentData = 4,
  Sprite = 5,
}

/** Server-side build state of a pack in the manifest (plan §19.4). Persisted — never renumber. */
export enum OfflineMapPackStatus {
  Queued = 0,
  Building = 1,
  Ready = 2,
  Failed = 3,
}

/** D16: online (department style), offline (composite local style) or local-preferred inside the response area. */
export type OfflineMapMode = 'online' | 'offline' | 'local-preferred';

/** Packs are scoped by server, department and user and wiped when any of them changes (D17). */
export interface OfflinePackScope {
  serverUrl: string;
  departmentId: string;
  userId: string;
}

/** `[west, south, east, north]`. */
export type PackBounds = [number, number, number, number];

/** One row of the registry table (`offline_map_packs`, plan §19.5). */
export interface OfflineMapPackRecord {
  packId: string;
  kind: OfflineMapPackKind;
  /** Server `PackKey` (cell id + max zoom + archive version for base-map cells). */
  key: string;
  version: string;
  sha256: string;
  bytes: number;
  /** Local file path (`file://…`), never a remote URL. */
  path: string;
  bounds: PackBounds | null;
  minZoom: number;
  maxZoom: number;
  pinned: boolean;
  /** Epoch ms. */
  lastUsedAt: number | null;
  downloadedAt: number;
  /** Custom map packs: the layer they carry. */
  customMapLayerId?: string | null;
}

/** The pack registry (implemented later on `@resgrid/offline` DurableDb). */
export interface OfflinePackRegistry {
  list(scope: OfflinePackScope, kind?: OfflineMapPackKind): Promise<OfflineMapPackRecord[]>;
  get(scope: OfflinePackScope, packId: string): Promise<OfflineMapPackRecord | null>;
  upsert(scope: OfflinePackScope, record: OfflineMapPackRecord): Promise<void>;
  remove(scope: OfflinePackScope, packId: string): Promise<void>;
  markUsed(scope: OfflinePackScope, packId: string, at: number): Promise<void>;
  totalBytes(scope: OfflinePackScope): Promise<number>;
  /** Logout, department switch, server switch: rows and files go (D17). */
  wipe(scope?: OfflinePackScope): Promise<void>;
}

/** Local department data from the `DepartmentData` bundle, as GeoJSON collections keyed by section. */
export type OfflineDepartmentData = Record<string, GeoJSON.FeatureCollection>;

export interface OfflineIndoorFloor {
  floorId: string;
  imagePath: string;
  corners: [[number, number], [number, number], [number, number], [number, number]];
}

/** Everything the composer needs to build the offline style for one theme. */
export interface OfflineStyleInput {
  scheme: 'light' | 'dark';
  /** Offline style template JSON with `{basemap}`, `{glyphs}`, `{sprite}` placeholders (plan §5.1 `OfflineStyleUrlDay/Night`). */
  template: StyleSpecification | null;
  basemapPacks: OfflineMapPackRecord[];
  customMapPacks: OfflineMapPackRecord[];
  glyphsPath: string | null;
  spritePath: string | null;
  departmentData: OfflineDepartmentData | null;
  indoorFloors: OfflineIndoorFloor[];
}

/** Builds the composite offline style (`pmtiles://file://…` sources, local glyphs/sprite, department sources). */
export interface OfflineStyleComposer {
  compose(input: OfflineStyleInput): StyleSpecification | null;
}

/** What `MapProvider` needs at runtime to switch to the offline style (D16). */
export interface MapOfflineOptions {
  mode: OfflineMapMode;
  /** The composed offline style for the current theme, or null when packs are missing (stay online). */
  getStyle: (scheme: 'light' | 'dark') => StyleSpecification | null;
  /** Shown in the attribution and the "Offline map" badge. */
  attribution?: string;
  /** Epoch ms of the last successful manifest refresh (badge: "updated 2 d ago"). */
  updatedAt?: number | null;
}

/** Shared base-map attribution on every offline map (plan §19.11). */
export const OFFLINE_MAP_ATTRIBUTION = 'Protomaps © OpenStreetMap';
