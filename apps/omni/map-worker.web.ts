// maplibre-gl 6 runs its tile worker from a separate module (`maplibre-gl-worker.mjs`) that it locates through
// import.meta.url, which a Metro web bundle does not provide. metro.config.js copies that file into public/ under this
// name (expo start serves it at the web root, expo export copies it into dist/<variant>, Electron packages the export),
// and MapProvider hands maplibre-gl its URL. Keep the name in sync with metro/maplibre-worker.js (a test checks it).
export const MAPLIBRE_WORKER_FILE = 'maplibre-gl-worker.js';

/** The served worker script at the app's root: the web origin, Electron's app://bundle or BigBoard's loopback origin. */
export function getMapLibreWorkerUrl(): string | null {
  if (typeof window === 'undefined' || !window.location?.href) {
    return null;
  }
  try {
    return new URL(`/${MAPLIBRE_WORKER_FILE}`, window.location.href).href;
  } catch {
    return null;
  }
}
