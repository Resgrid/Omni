import { create } from 'zustand';

/** Where someone last moved the map widget: offered as the fixed view in its settings ("Use the current map view"). */
export interface MapWidgetView {
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface MapWidgetViewState {
  lastView: MapWidgetView | null;
  setLastView: (view: MapWidgetView) => void;
}

/** Session only (a pan is not a setting until someone saves it in the widget's settings); never persisted. */
export const useMapWidgetViewStore = create<MapWidgetViewState>()((set) => ({
  lastView: null,
  setLastView: (lastView) => set({ lastView }),
}));
