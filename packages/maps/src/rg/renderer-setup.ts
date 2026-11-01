/**
 * Renderer-wide setup. Native (MapLibre Native) needs none: workers and protocols are built in. The web build
 * (`renderer-setup.web.ts`) points maplibre-gl at its worker script.
 */
export interface MapRendererSetup {
  /** Web/Electron: URL of a served copy of `maplibre-gl/dist/maplibre-gl-worker.mjs`. */
  workerUrl?: string | null;
}

export const configureMapRenderer = (_setup: MapRendererSetup): void => undefined;
