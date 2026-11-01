/** Offline maps routes (Settings → Offline maps, MapLibre plan §19.8). The variant's route file re-exports the screen. */
export const OFFLINE_MAPS_ROUTE_PATTERNS = {
  offlineMaps: '/settings/offline-maps',
} as const;

export const offlineMapsRoutes = {
  offlineMaps: (): string => OFFLINE_MAPS_ROUTE_PATTERNS.offlineMaps,
} as const;

export type OfflineMapsRouteName = keyof typeof offlineMapsRoutes;
