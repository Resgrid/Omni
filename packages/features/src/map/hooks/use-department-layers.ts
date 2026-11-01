import { useCustomMapsStore } from '@resgrid/data';
import type { ActiveLayerResultData } from '@resgrid/models';
import { useCallback, useEffect, useMemo } from 'react';

import { toFeatureCollection } from '../lib/layer-geojson';
import { useMapViewStore } from './use-map-view-store';

export interface DepartmentMapLayer {
  id: string;
  name: string;
  color: string;
  isOn: boolean;
  /** The layer's GeoJSON once fetched (null while loading or when the server sent nothing usable). */
  data: GeoJSON.FeatureCollection | null;
}

const EMPTY_LAYERS: ActiveLayerResultData[] = [];

/**
 * Department map layers / geofences drawn as GeoJSON (`Mapping/GetAllActiveLayers` + `GetMapLayerGeoJSON/{id}` through
 * the custom-maps store). A layer starts as the department set it (`IsOnByDefault`) until the member toggles it; GeoJSON
 * is fetched only for layers that are on. Custom-map region layers (`LayerSource` "custommaplayer") are left to the
 * custom maps screens: the store has no region-GeoJSON slice yet.
 */
export function useDepartmentLayers(enabled: boolean): { layers: DepartmentMapLayer[]; toggleLayer: (layerId: string) => void } {
  const activeLayers = useCustomMapsStore((state) => (enabled ? state.activeLayers : EMPTY_LAYERS));
  const layerGeoJSON = useCustomMapsStore((state) => state.layerGeoJSON);
  const layerToggles = useMapViewStore((state) => state.layerToggles);

  useEffect(() => {
    if (enabled) void useCustomMapsStore.getState().fetchActiveLayers();
  }, [enabled]);

  const layers = useMemo<DepartmentMapLayer[]>(
    () =>
      activeLayers
        .filter((layer) => layer.Id && layer.LayerSource?.toLowerCase() !== 'custommaplayer')
        .map((layer) => ({
          id: layer.Id,
          name: layer.Name || layer.Id,
          color: layer.Color || '',
          isOn: layerToggles[layer.Id] ?? layer.IsOnByDefault === true,
          data: toFeatureCollection(layerGeoJSON[layer.Id]),
        })),
    [activeLayers, layerGeoJSON, layerToggles]
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
