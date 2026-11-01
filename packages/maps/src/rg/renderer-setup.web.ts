import { withMapLibre } from './maplibre-loader.web';
import type { MapRendererSetup } from './renderer-setup';

export type { MapRendererSetup } from './renderer-setup';

/**
 * maplibre-gl 6 locates its worker (`maplibre-gl-worker.mjs`) next to the module through `import.meta.url`, which a
 * Metro web bundle does not provide. The web export / Electron build therefore serves a copy of the worker file and the
 * app passes its URL here (MapProvider `webWorkerUrl`). Without one maplibre-gl keeps its default lookup. maplibre-gl
 * loads with the first map, so the URL is applied then (or now, when it has loaded already).
 */
export const configureMapRenderer = (setup: MapRendererSetup): void => {
  const url = setup.workerUrl?.trim();
  if (!url) return;
  withMapLibre(({ getWorkerUrl, setWorkerUrl }) => {
    if (getWorkerUrl() !== url) {
      setWorkerUrl(url);
    }
  });
};
