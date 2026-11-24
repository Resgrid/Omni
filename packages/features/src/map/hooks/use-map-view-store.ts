import { create } from 'zustand';

import type { ToggleableMarkerKind } from '../lib/map-markers';

/**
 * The map's layer toggles (view state, not server data — @resgrid/data holds only what the server sent): pin kinds and
 * POI types the member switched off, department layers switched away from their `IsOnByDefault`, and the facility maps
 * (custom and indoor maps) switched on with their floor or layer. Kept for the session so every map looks the same when
 * the member comes back to it (the Map screen, the Dispatch console and the IC maps share them); never persisted.
 */
export interface MapViewState {
  hiddenKinds: Partial<Record<ToggleableMarkerKind, boolean>>;
  hiddenPoiTypes: Record<string, boolean>;
  /** Department layer id → on/off chosen by the member (absent: the layer's `IsOnByDefault`). */
  layerToggles: Record<string, boolean>;
  /**
   * Facility maps shown (`facilityMapKey`: `custom:<id>` / `indoor:<id>`) → the chosen floor or layer, null for the map's
   * default (an indoor map's default floor, every layer of a custom map). Absent: off.
   */
  facilityMaps: Record<string, string | null>;
  toggleKind: (kind: ToggleableMarkerKind) => void;
  togglePoiType: (layerId: string) => void;
  setLayer: (layerId: string, isOn: boolean) => void;
  /** Switches a facility map on (its default level) or off. */
  toggleFacilityMap: (key: string) => void;
  /** Shows a facility map at this floor or layer (switching it on). */
  setFacilityLevel: (key: string, levelId: string | null) => void;
  reset: () => void;
}

export const useMapViewStore = create<MapViewState>()((set) => ({
  hiddenKinds: {},
  hiddenPoiTypes: {},
  layerToggles: {},
  facilityMaps: {},
  toggleKind: (kind) => set((state) => ({ hiddenKinds: { ...state.hiddenKinds, [kind]: state.hiddenKinds[kind] !== true } })),
  togglePoiType: (layerId) => set((state) => ({ hiddenPoiTypes: { ...state.hiddenPoiTypes, [layerId]: state.hiddenPoiTypes[layerId] !== true } })),
  setLayer: (layerId, isOn) => set((state) => ({ layerToggles: { ...state.layerToggles, [layerId]: isOn } })),
  toggleFacilityMap: (key) =>
    set((state) => {
      if (key in state.facilityMaps) {
        const { [key]: _removed, ...others } = state.facilityMaps;

        return { facilityMaps: others };
      }

      return { facilityMaps: { ...state.facilityMaps, [key]: null } };
    }),
  setFacilityLevel: (key, levelId) => set((state) => ({ facilityMaps: { ...state.facilityMaps, [key]: levelId } })),
  reset: () => set({ hiddenKinds: {}, hiddenPoiTypes: {}, layerToggles: {}, facilityMaps: {} }),
}));
