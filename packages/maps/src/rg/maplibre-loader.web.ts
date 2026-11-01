import type * as MapLibreGl from 'maplibre-gl';

/**
 * maplibre-gl (about 1 MB) loads the first time a map renders instead of with the app, so the web export's entry bundle
 * does not carry it for screens without a map. Setup that has to reach maplibre-gl before the first map — the worker URL
 * (configureMapRenderer) and the pmtiles protocol — goes through `withMapLibre` and runs as the module arrives.
 */
export type MapLibreModule = typeof MapLibreGl;

let loaded: MapLibreModule | null = null;
let loading: Promise<MapLibreModule> | null = null;
const pendingSetups: ((maplibre: MapLibreModule) => void)[] = [];

/** Runs `setup` against maplibre-gl now when it is loaded, else as soon as it loads (before any map is created). */
export const withMapLibre = (setup: (maplibre: MapLibreModule) => void): void => {
  if (loaded) setup(loaded);
  else pendingSetups.push(setup);
};

/** maplibre-gl when it has loaded, else null. Code that runs only inside a created map can rely on it. */
export const getLoadedMapLibre = (): MapLibreModule | null => loaded;

/** Loads maplibre-gl once (a separate chunk in the web export); a failed load is retried on the next call. */
export const loadMapLibre = (): Promise<MapLibreModule> => {
  if (loaded) return Promise.resolve(loaded);
  loading ??= import('maplibre-gl').then(
    (module) => {
      for (const setup of pendingSetups.splice(0)) setup(module);
      loaded = module;
      return module;
    },
    (error: unknown) => {
      loading = null;
      throw error;
    }
  );
  return loading;
};
