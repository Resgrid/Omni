import { create } from 'zustand';

import type { ToggleableMarkerKind } from '../lib/map-markers';

/**
 * The map's layer toggles (view state, not server data — @resgrid/data holds only what the server sent): pin kinds and
 * POI types the member switched off, and department layers switched away from their `IsOnByDefault`. Kept for the
 * session so the map looks the same when the member comes back to it; never persisted.
 */
export interface MapViewState {
  hiddenKinds: Partial<Record<ToggleableMarkerKind, boolean>>;
  hiddenPoiTypes: Record<string, boolean>;
  /** Department layer id → on/off chosen by the member (absent: the layer's `IsOnByDefault`). */
  layerToggles: Record<string, boolean>;
  toggleKind: (kind: ToggleableMarkerKind) => void;
  togglePoiType: (layerId: string) => void;
  setLayer: (layerId: string, isOn: boolean) => void;
  reset: () => void;
}

export const useMapViewStore = create<MapViewState>()((set) => ({
  hiddenKinds: {},
  hiddenPoiTypes: {},
  layerToggles: {},
  toggleKind: (kind) => set((state) => ({ hiddenKinds: { ...state.hiddenKinds, [kind]: state.hiddenKinds[kind] !== true } })),
  togglePoiType: (layerId) => set((state) => ({ hiddenPoiTypes: { ...state.hiddenPoiTypes, [layerId]: state.hiddenPoiTypes[layerId] !== true } })),
  setLayer: (layerId, isOn) => set((state) => ({ layerToggles: { ...state.layerToggles, [layerId]: isOn } })),
  reset: () => set({ hiddenKinds: {}, hiddenPoiTypes: {}, layerToggles: {} }),
}));
