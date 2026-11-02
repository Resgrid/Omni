import { dataPersistOptions, registerPersistedStore } from '@resgrid/data';
import { registerPreservedKeys } from '@resgrid/offline';
import { useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The live traffic overlay's on/off choice per map surface (MapLibre plan §11.1: "remembered per device"). A device
 * preference like the theme: persisted in the variant's storage and kept across logout, department and server switches.
 * A surface the member never toggled uses its own default (main map off, Dispatch console map on).
 */
export interface MapTrafficPreferenceState {
  /** Surface id (`map`, `dispatch-console`, …) → the member's choice. */
  traffic: Record<string, boolean>;
  setTraffic: (surface: string, isOn: boolean) => void;
}

type PersistedTraffic = Pick<MapTrafficPreferenceState, 'traffic'>;

export const MAP_TRAFFIC_STORE_NAME = 'omni-map-traffic-storage';

/** Surfaces and their defaults when the member has not chosen. */
export const TRAFFIC_SURFACES = {
  map: { id: 'map', defaultOn: false },
  dispatchConsole: { id: 'dispatch-console', defaultOn: true },
} as const;

const normalize = (value: unknown): Record<string, boolean> => {
  const traffic = value && typeof value === 'object' ? (value as { traffic?: unknown }).traffic : null;
  if (!traffic || typeof traffic !== 'object') return {};
  const result: Record<string, boolean> = {};
  for (const [surface, isOn] of Object.entries(traffic as Record<string, unknown>)) {
    if (typeof isOn === 'boolean') result[surface] = isOn;
  }
  return result;
};

export const useMapTrafficPreferenceStore = create<MapTrafficPreferenceState>()(
  persist(
    (set) => ({
      traffic: {},
      setTraffic: (surface, isOn) => set((state) => ({ traffic: { ...state.traffic, [surface]: isOn } })),
    }),
    dataPersistOptions<MapTrafficPreferenceState, PersistedTraffic>({
      name: MAP_TRAFFIC_STORE_NAME,
      partialize: (state) => ({ traffic: state.traffic }),
      merge: (persisted, current) => ({ ...current, traffic: normalize(persisted) }),
    })
  )
);

registerPersistedStore(MAP_TRAFFIC_STORE_NAME, useMapTrafficPreferenceStore);
registerPreservedKeys([MAP_TRAFFIC_STORE_NAME]);

/** `[isOn, toggle]` for one surface's traffic overlay (the remembered choice, else `defaultOn`). */
export function useTrafficPreference(surface: string, defaultOn: boolean): [boolean, () => void] {
  const stored = useMapTrafficPreferenceStore((state) => state.traffic[surface]);
  const isOn = stored ?? defaultOn;
  const toggle = useCallback(() => useMapTrafficPreferenceStore.getState().setTraffic(surface, !isOn), [isOn, surface]);
  return [isOn, toggle];
}
