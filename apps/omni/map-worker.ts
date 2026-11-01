// MapLibre Native runs its workers itself: there is no worker script to point at (see map-worker.web.ts for the web).
export const MAPLIBRE_WORKER_FILE = 'maplibre-gl-worker.js';

export function getMapLibreWorkerUrl(): string | null {
  return null;
}
