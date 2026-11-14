import { useCustomMapsStore } from '@resgrid/data';
import type { ActiveLayerResultData } from '@resgrid/models';
import { useCallback, useEffect, useMemo } from 'react';

import { type LayerDetails, type MapLayerDetailsSource, mergeDepartmentLayers } from '../lib/layer-details';
import { toFeatureCollection } from '../lib/layer-geojson';
import { useMapViewStore } from './use-map-view-store';

export interface DepartmentMapLayer {
  id: string;
  name: string;
  color: string;
  isOn: boolean;
  /** The layer's GeoJSON once fetched (null while loading or when the server sent nothing usable). */
  data: GeoJSON.FeatureCollection | null;
  /** Description, event dates and contact from `Mapping/GetMayLayers`; null for a layer only GetAllActiveLayers listed. */
  details: LayerDetails | null;
}

const EMPTY_ACTIVE: ActiveLayerResultData[] = [];
const EMPTY_LAYERS: MapLayerDetailsSource[] = [];

/**
 * Department map layers / geofences drawn as GeoJSON. The list is every layer from `Mapping/GetMayLayers` (with its
 * description, event dates and contact; the shapes it carries are dropped by the store) plus the on-by-default ones from
 * `Mapping/GetAllActiveLayers`, so the map works before, or without, the full list. A layer starts as the department set
 * it (`IsOnByDefault`, which Core turns on while a layer's event runs) until the member toggles it; GeoJSON is fetched
 * (`GetMapLayerGeoJSON/{id}`) only for layers that are on. Custom-map region layers (`LayerSource` "custommaplayer")
 * are left to the custom maps screens: the store has no region-GeoJSON slice yet.
 */
export function useDepartmentLayers(enabled: boolean): { layers: DepartmentMapLayer[]; toggleLayer: (layerId: string) => void } {
  const activeLayers = useCustomMapsStore((state) => (enabled ? state.activeLayers : EMPTY_ACTIVE));
  const mapLayers = useCustomMapsStore((state) => (enabled ? state.mapLayers : EMPTY_LAYERS));
  const layerGeoJSON = useCustomMapsStore((state) => state.layerGeoJSON);
  const layerToggles = useMapViewStore((state) => state.layerToggles);

  useEffect(() => {
    if (!enabled) return;
    const store = useCustomMapsStore.getState();
    void store.fetchActiveLayers();
    void store.fetchMapLayers();
  }, [enabled]);

  const merged = useMemo(() => mergeDepartmentLayers(activeLayers, mapLayers), [activeLayers, mapLayers]);

  const layers = useMemo<DepartmentMapLayer[]>(
    () =>
      merged.map((layer) => ({
        id: layer.id,
        name: layer.name,
        color: layer.color,
        isOn: layerToggles[layer.id] ?? layer.isOnByDefault,
        data: toFeatureCollection(layerGeoJSON[layer.id]),
        details: layer.details,
      })),
    [merged, layerGeoJSON, layerToggles]
  );

  // Fetch GeoJSON for layers that are on and not cached (the store single-flights per layer).
  const missing = layers
    .filter((layer) => layer.isOn && layerGeoJSON[layer.id] === undefined)
    .map((layer) => layer.id)
    .join('|');
  useEffect(() => {
    if (!missing) return;
    for (const layerId of missing.split('|')) void useCustomMapsStore.getState().fetchLayerGeoJSON(layerId);
  }, [missing]);

  const toggleLayer = useCallback(
    (layerId: string) => {
      const layer = layers.find((entry) => entry.id === layerId);
      if (layer) useMapViewStore.getState().setLayer(layerId, !layer.isOn);
    },
    [layers]
  );

  return { layers, toggleLayer };
}
