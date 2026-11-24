import { useNetInfo } from '@react-native-community/netinfo';
import { useCustomMapsStore } from '@resgrid/data';
import { mapBounds } from '@resgrid/features/custom-maps/lib/map-viewer';
import type { CameraRef, MapFacilitySectionProps } from '@resgrid/maps';
import type { CustomMapLayerResultData, CustomMapResultData, IndoorMapResultData } from '@resgrid/models';
import { isNetInfoOnline } from '@resgrid/offline';
import { type RefObject, useCallback, useEffect, useMemo, useState } from 'react';

import {
  type FacilityBounds,
  facilityBounds,
  facilityFeatureOf,
  type FacilityLevel,
  facilityLevels,
  type FacilityMapDetail,
  type FacilityMapListing,
  facilityMapListings,
  type FacilityOverlayLayer,
  parseFacilityMapKey,
  resolvedLevelId,
  resolveFacilityLayers,
} from '../lib/facility-maps';
import { useMapViewStore } from './use-map-view-store';

const EMPTY_CUSTOM: CustomMapResultData[] = [];
const EMPTY_INDOOR: IndoorMapResultData[] = [];

/** Room around a facility map framed on the camera, in pixels, and how long the camera takes to get there. */
const FOCUS_PADDING_PX = 40;
const FOCUS_ANIMATION_MS = 800;

type CustomOverlayLayer = Extract<FacilityOverlayLayer, { kind: 'custom' }>;

const isCustomOverlayLayer = (entry: FacilityOverlayLayer): entry is CustomOverlayLayer => entry.kind === 'custom';

/** The read tokens (`layer:<id>`) for a custom map's drawn layers whose regions the device has not read yet. */
const unreadCustomLayers = (layers: readonly FacilityOverlayLayer[], layerById: Readonly<Record<string, CustomMapLayerResultData>>): string[] => {
  const unread = layers.filter(isCustomOverlayLayer).filter((entry) => !layerById[entry.layer.IndoorMapFloorId]);

  return unread.map((entry) => `layer:${entry.layer.IndoorMapFloorId}`);
};

/**
 * The department's facility maps to choose from. The lists are kept on the device (they open offline) and read again
 * whenever a surface that offers them mounts.
 */
export function useFacilityMapListings(enabled: boolean): FacilityMapListing[] {
  const customMaps = useCustomMapsStore((state) => (enabled ? state.customMaps : EMPTY_CUSTOM));
  const indoorMaps = useCustomMapsStore((state) => (enabled ? state.indoorMaps : EMPTY_INDOOR));

  useEffect(() => {
    if (!enabled) return;
    const store = useCustomMapsStore.getState();

    void store.fetchCustomMaps();
    void store.fetchIndoorMaps();
  }, [enabled]);

  return useMemo(() => facilityMapListings(customMaps, indoorMaps), [customMaps, indoorMaps]);
}

/** A facility map shown, and the floor or layer chosen for it (null: its default). */
export interface FacilitySelection {
  key: string;
  levelId: string | null;
}

/** A shown facility map as read: its levels, the level it shows, its bounds and what it draws. */
export interface ResolvedFacilityMap {
  key: string;
  name: string;
  levels: FacilityLevel[];
  /** The floor or layer drawn; null for every layer of a custom map. */
  levelId: string | null;
  /** Custom maps can show every layer at once; indoor maps one floor. */
  allowsAllLevels: boolean;
  bounds: FacilityBounds | null;
  layers: FacilityOverlayLayer[];
}

/** What the selected facility maps draw, and each one as read (by map key). */
export interface FacilityMapLayers {
  layers: FacilityOverlayLayer[];
  maps: Record<string, ResolvedFacilityMap>;
}

/**
 * Reads each selected map (`GetCustomMap/{id}`, `GetIndoorMap/{id}` and the shown floor with its zones) once, and returns
 * what to draw. Maps and floors already on the device answer at once (the store persists them).
 */
export function useFacilityMapLayers(selections: readonly FacilitySelection[]): FacilityMapLayers {
  const customMapById = useCustomMapsStore((state) => state.customMapById);
  const indoorMapById = useCustomMapsStore((state) => state.indoorMapById);
  const floorById = useCustomMapsStore((state) => state.floorById);
  const layerById = useCustomMapsStore((state) => state.customMapLayerById);

  const maps = useMemo(() => {
    const resolved: Record<string, ResolvedFacilityMap> = {};

    for (const selection of selections) {
      const ref = parseFacilityMapKey(selection.key);

      const detail: FacilityMapDetail | null = !ref
        ? null
        : ref.kind === 'custom'
          ? customMapById[ref.mapId]
            ? { kind: 'custom', data: customMapById[ref.mapId] }
            : null
          : indoorMapById[ref.mapId]
            ? { kind: 'indoor', data: indoorMapById[ref.mapId] }
            : null;

      if (!ref || !detail) continue;
      const layers = resolveFacilityLayers(selection.key, detail, selection.levelId, floorById, layerById);
      const map = detail.data.Map;

      resolved[selection.key] = {
        key: selection.key,
        name: map?.Name ?? '',
        levels: facilityLevels(detail),
        levelId: resolvedLevelId(detail, selection.levelId),
        allowsAllLevels: ref.kind === 'custom',
        // The drawn layers' bounds, else the map's own (a tiled layer may have none).
        bounds: facilityBounds(layers, map ? mapBounds(map) : null),
        layers,
      };
    }

    return resolved;
  }, [customMapById, floorById, indoorMapById, layerById, selections]);

  // Read what is not on the device yet: the maps, then an indoor map's shown floor (its own read carries the zones) and a
  // custom map's shown layers (their own reads carry the regions).
  const missing = selections
    .flatMap((selection) => {
      const ref = parseFacilityMapKey(selection.key);

      if (!ref) return [];

      if (ref.kind === 'custom') return customMapById[ref.mapId] ? unreadCustomLayers(maps[selection.key]?.layers ?? [], layerById) : [`custom:${ref.mapId}`];

      if (!indoorMapById[ref.mapId]) return [`indoor:${ref.mapId}`];
      const floorId = maps[selection.key]?.levelId;

      return floorId && !floorById[floorId] ? [`floor:${floorId}`] : [];
    })
    .join('|');

  // A read that failed offline (the cache stays empty, so `missing` does not change) is made again once the device is back
  // online; none is tried while it is offline.
  const isOnline = isNetInfoOnline(useNetInfo());

  useEffect(() => {
    if (!missing || !isOnline) return;
    const store = useCustomMapsStore.getState();

    for (const entry of missing.split('|')) {
      const separator = entry.indexOf(':');
      const kind = entry.slice(0, separator);
      const id = entry.slice(separator + 1);

      if (kind === 'custom') void store.fetchCustomMap(id);
      else if (kind === 'layer') void store.fetchCustomMapLayer(id);
      else if (kind === 'indoor') void store.fetchIndoorMap(id);
      else void store.fetchIndoorFloor(id);
    }
  }, [isOnline, missing]);

  const layers = useMemo(() => Object.values(maps).flatMap((map) => map.layers), [maps]);

  return { layers, maps };
}

export interface FacilityMapsState {
  /** Every facility map the department has. */
  listings: FacilityMapListing[];
  /** Shown maps, read. */
  maps: Record<string, ResolvedFacilityMap>;
  /** What to draw (`FacilityMapsOverlay`). */
  layers: FacilityOverlayLayer[];
  /** Map key → shown. */
  toggles: Record<string, boolean>;
  toggle: (key: string) => void;
  selectLevel: (key: string, levelId: string | null) => void;
  /** Bounds to frame: a map just switched on, or its floor or layer just changed (`useFacilityFocus`). */
  focus: FacilityBounds | null;
  clearFocus: () => void;
}

/**
 * The facility maps a map with a Layers sheet shows: the department's list, the ones switched on this session (shared by
 * the Map screen, the Dispatch console and the IC maps through `useMapViewStore`) and what they draw.
 */
export function useFacilityMaps(enabled: boolean): FacilityMapsState {
  const listings = useFacilityMapListings(enabled);
  const chosen = useMapViewStore((state) => state.facilityMaps);

  const selections = useMemo<FacilitySelection[]>(
    () => (enabled ? listings.filter((listing) => listing.key in chosen).map((listing) => ({ key: listing.key, levelId: chosen[listing.key] ?? null })) : []),
    [chosen, enabled, listings]
  );

  const { layers, maps } = useFacilityMapLayers(selections);
  const toggles = useMemo(() => Object.fromEntries(selections.map((selection) => [selection.key, true])), [selections]);
  // The map switched on last (or whose level changed) is framed once its bounds are known.
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const toggle = useCallback((key: string) => {
    const store = useMapViewStore.getState();
    const switchingOn = !(key in store.facilityMaps);

    store.toggleFacilityMap(key);
    setFocusKey(switchingOn ? key : null);
  }, []);

  const selectLevel = useCallback((key: string, levelId: string | null) => {
    useMapViewStore.getState().setFacilityLevel(key, levelId);
    setFocusKey(key);
  }, []);

  const clearFocus = useCallback(() => setFocusKey(null), []);
  const focus = (focusKey && maps[focusKey]?.bounds) || null;

  return { listings, maps, layers, toggles, toggle, selectLevel, focus, clearFocus };
}

/**
 * Frames a facility map on the camera when the member switches it on or changes its floor or layer (as the web map's
 * Layers panel does). `onFramed` lets a screen treat it as a camera move of the member's (stop following, show recentre).
 */
export function useFacilityFocus(cameraRef: RefObject<CameraRef | null>, facility: Pick<FacilityMapsState, 'focus' | 'clearFocus'>, onFramed?: () => void, enabled = true): void {
  const { focus, clearFocus } = facility;

  useEffect(() => {
    if (!focus) return;
    const camera = cameraRef.current;

    clearFocus();

    if (!enabled || !camera) return;
    onFramed?.();
    camera.fitBounds(focus.ne, focus.sw, FOCUS_PADDING_PX, FOCUS_ANIMATION_MS);
  }, [cameraRef, clearFocus, enabled, focus, onFramed]);
}

/**
 * A tapped room or region (`featureId`: its zone or region id) while it is drawn. Once its floor or layer is not — another
 * floor chosen, its map switched off — it reads as null and `clear` drops it, so its card closes and does not come back
 * when the map is switched on again. A selection with no `featureId` (a department layer's shape) is kept.
 */
export function useDrawnFacilityFeature<T>(selected: T | null, featureId: string | null | undefined, layers: readonly FacilityOverlayLayer[], clear: () => void): T | null {
  const hidden = selected !== null && !!featureId && facilityFeatureOf(layers, featureId) === null;

  useEffect(() => {
    if (hidden) clear();
  }, [clear, hidden]);

  return hidden ? null : selected;
}

/** The Layers sheet's facility maps section for `useFacilityMaps`; none when the department has no facility maps. */
export function facilitySheetSection(facility: FacilityMapsState, t: (key: string) => string): MapFacilitySectionProps | undefined {
  if (facility.listings.length === 0) return undefined;

  return {
    items: facility.listings.map((listing) => {
      const resolved = facility.maps[listing.key];

      return {
        Id: listing.key,
        Name: listing.name,
        TypeLabel: listing.typeKey ? t(listing.typeKey) : null,
        Levels: resolved ? resolved.levels.map((level) => ({ Id: level.id, Name: level.name })) : [],
        LevelId: resolved?.levelId ?? null,
        AllLevelsLabel: listing.kind === 'custom' ? t('maps.facility.all_layers') : null,
      };
    }),
    toggles: facility.toggles,
    onToggle: facility.toggle,
    onSelectLevel: facility.selectLevel,
  };
}
